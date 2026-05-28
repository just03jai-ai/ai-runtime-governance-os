import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import type { ScreenshotEvidence } from "../../governance/contracts/evidence.js";
import type {
  RuntimeExecutionContext,
  RuntimeExecutionRequest,
  RuntimeExecutionSummary,
} from "../../governance/contracts/execution.js";
import type { RuntimeComponentInventory, RuntimeDomSnapshot } from "../../governance/contracts/runtime.js";
import { EvidenceWriterService } from "../../runtime/evidence/evidence-writer.service.js";
import { ScreenshotService } from "../../runtime/evidence/screenshot.service.js";
import { RuntimeExtractionService } from "../../runtime/extraction/runtime-extraction.service.js";
import { RuntimeEvidenceNormalizerService } from "../../runtime/normalization/runtime-evidence-normalizer.service.js";
import { TelemetryService } from "../../runtime/telemetry/telemetry-service.js";
import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import { runtimeEvidenceSchema } from "../../shared/schemas/runtime-evidence.schema.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import { createRunId } from "../../shared/utils/id.js";

export interface ExecutionAgentDependencies {
  readonly telemetry: TelemetryService;
  readonly runtimeExtraction: RuntimeExtractionService;
  readonly screenshot: ScreenshotService;
  readonly evidenceNormalizer: RuntimeEvidenceNormalizerService;
  readonly evidenceWriter: EvidenceWriterService;
  readonly evidenceRoot: string;
  readonly logger?: OperationalLogger;
}

export class ExecutionAgent {
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: ExecutionAgentDependencies) {
    this.logger = dependencies.logger ?? createAgentLogger("ExecutionAgent");
  }

  async execute(request: RuntimeExecutionRequest): Promise<RuntimeEvidence> {
    const startedAtMs = Date.now();
    const context: RuntimeExecutionContext = {
      runId: createRunId("runtime"),
      startedAt: new Date(startedAtMs).toISOString(),
      request,
    };
    const evidenceDirectory = join(this.dependencies.evidenceRoot, context.runId);
    const screenshotPath = join(evidenceDirectory, "screenshots", "full-page.png");

    this.dependencies.telemetry.record(context.runId, "execution.started", {
      targetUrl: request.targetUrl,
      environment: request.environment,
    });
    const trace = this.logger.start("execution", {
      correlationId: context.runId,
      route: request.targetUrl,
      metadata: {
        environment: request.environment,
      },
    });

    let browser: Browser | undefined;

    try {
      this.logger.debug("browser.launch.started", { correlationId: context.runId });
      browser = await chromium.launch();
      const page = await browser.newPage({
        viewport: {
          width: request.viewport.width,
          height: request.viewport.height,
        },
        ...(request.viewport.deviceScaleFactor === undefined
          ? {}
          : { deviceScaleFactor: request.viewport.deviceScaleFactor }),
      });

      const navigationStartedAt = Date.now();
      this.logger.info("route.navigation.started", { correlationId: context.runId, targetUrl: request.targetUrl });
      await page.goto(request.targetUrl, {
        waitUntil: "domcontentloaded",
        timeout: request.timeoutMs ?? 30_000,
      });
      this.dependencies.telemetry.record(
        context.runId,
        "page.navigation.completed",
        { url: page.url() },
        Date.now() - navigationStartedAt,
      );

      const screenshotStartedAt = Date.now();
      this.logger.info("screenshot.capture.started", { correlationId: context.runId });
      const screenshot = await this.dependencies.screenshot.capture(page, screenshotPath, request.viewport);
      this.dependencies.telemetry.record(
        context.runId,
        "screenshot.captured",
        { path: screenshot.path },
        Date.now() - screenshotStartedAt,
      );

      const extractionStartedAt = Date.now();
      this.logger.info("dom.extraction.started", { correlationId: context.runId });
      const domSnapshot = await this.dependencies.runtimeExtraction.extractDom(page);
      this.dependencies.telemetry.record(
        context.runId,
        "dom.extracted",
        { elementCount: domSnapshot.elements.length },
        Date.now() - extractionStartedAt,
      );

      this.logger.info("component.inventory.started", { correlationId: context.runId });
      const componentInventory = this.dependencies.runtimeExtraction.buildComponentInventory(domSnapshot);
      this.dependencies.telemetry.record(context.runId, "component.inventory.generated", {
        componentCount: componentInventory.components.length,
      });

      const summary = this.createSummary({
        context,
        evidenceDirectory,
        screenshot,
        componentInventory,
        startedAtMs,
        status: "passed",
      });
      this.dependencies.telemetry.record(context.runId, "execution.completed", {
        status: summary.status,
      });

      const evidence = await this.normalizeValidateAndWrite({
        context,
        evidenceDirectory,
        domSnapshot,
        componentInventory,
        summary,
        screenshot,
      });
      this.logger.complete(trace, {
        componentCount: componentInventory.components.length,
        telemetryEventCount: this.dependencies.telemetry.getEvents().length,
      });
      return evidence;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown execution error";
      this.logger.fail(trace, error, { errorMessage });
      this.dependencies.telemetry.record(context.runId, "execution.failed", { errorMessage });

      const domSnapshot = this.emptyDomSnapshot(request.targetUrl);
      const componentInventory: RuntimeComponentInventory = {
        capturedAt: new Date().toISOString(),
        components: [],
      };
      const summary = this.createSummary({
        context,
        evidenceDirectory,
        componentInventory,
        startedAtMs,
        status: "failed",
        errorMessage,
      });

      const evidence = await this.normalizeValidateAndWrite({
        context,
        evidenceDirectory,
        domSnapshot,
        componentInventory,
        summary,
      });
      return evidence;
    } finally {
      await browser?.close();
    }
  }

  private async normalizeValidateAndWrite(input: {
    readonly context: RuntimeExecutionContext;
    readonly evidenceDirectory: string;
    readonly domSnapshot: RuntimeDomSnapshot;
    readonly componentInventory: RuntimeComponentInventory;
    readonly summary: RuntimeExecutionSummary;
    readonly screenshot?: ScreenshotEvidence;
  }): Promise<RuntimeEvidence> {
    this.logger.info("evidence.normalization.started", { correlationId: input.context.runId });
    const evidence = this.dependencies.evidenceNormalizer.normalize({
      context: input.context,
      domSnapshot: input.domSnapshot,
      componentInventory: input.componentInventory,
      telemetry: this.dependencies.telemetry.getEvents(),
      summary: input.summary,
      ...(input.screenshot ? { screenshot: input.screenshot } : {}),
    });

    this.logger.info("evidence.validation.started", { correlationId: input.context.runId });
    const validatedEvidence = runtimeEvidenceSchema.parse(evidence);

    this.dependencies.telemetry.record(input.context.runId, "evidence.generated", {
      evidenceDirectory: input.evidenceDirectory,
    });
    this.logger.info("evidence.write.started", {
      correlationId: input.context.runId,
      evidenceDirectory: input.evidenceDirectory,
    });

    return this.dependencies.evidenceWriter.writeRuntimeEvidence({
      evidenceDirectory: input.evidenceDirectory,
      evidence: validatedEvidence,
    });
  }

  private createSummary(input: {
    readonly context: RuntimeExecutionContext;
    readonly evidenceDirectory: string;
    readonly screenshot?: ScreenshotEvidence;
    readonly componentInventory: RuntimeComponentInventory;
    readonly startedAtMs: number;
    readonly status: RuntimeExecutionSummary["status"];
    readonly errorMessage?: string;
  }): RuntimeExecutionSummary {
    const completedAtMs = Date.now();

    return {
      runId: input.context.runId,
      targetUrl: input.context.request.targetUrl,
      status: input.status,
      startedAt: input.context.startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: completedAtMs - input.startedAtMs,
      evidenceDirectory: input.evidenceDirectory,
      ...(input.screenshot ? { screenshotPath: input.screenshot.path } : {}),
      componentCount: input.componentInventory.components.length,
      telemetryEventCount: this.dependencies.telemetry.getEvents().length,
      ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
    };
  }

  private emptyDomSnapshot(targetUrl: string): RuntimeDomSnapshot {
    return {
      url: targetUrl,
      title: "",
      capturedAt: new Date().toISOString(),
      elements: [],
    };
  }

}
