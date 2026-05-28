import { join } from "node:path";
import { chromium, type Browser } from "playwright";
import type { EvidenceBundle, ScreenshotEvidence } from "../contracts/evidence.js";
import type {
  RuntimeExecutionContext,
  RuntimeExecutionRequest,
  RuntimeExecutionSummary,
} from "../contracts/execution.js";
import type { RuntimeComponentInventory, RuntimeDomSnapshot } from "../contracts/runtime.js";
import { EvidenceWriterService } from "../evidence/evidence-writer.service.js";
import { createMockGovernanceReport } from "../reports/mock-governance-report.js";
import { RuntimeExtractionService } from "../runtime/runtime-extraction.service.js";
import { ScreenshotService } from "../runtime/screenshot.service.js";
import { createRunId } from "../shared/id.js";
import { TelemetryService } from "../telemetry/telemetry-service.js";

export interface ExecutionAgentDependencies {
  readonly telemetry: TelemetryService;
  readonly runtimeExtraction: RuntimeExtractionService;
  readonly screenshot: ScreenshotService;
  readonly evidenceWriter: EvidenceWriterService;
  readonly evidenceRoot: string;
}

export class ExecutionAgent {
  constructor(private readonly dependencies: ExecutionAgentDependencies) {}

  async execute(request: RuntimeExecutionRequest): Promise<EvidenceBundle> {
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

    let browser: Browser | undefined;

    try {
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
      const screenshot = await this.dependencies.screenshot.capture(page, screenshotPath, request.viewport);
      this.dependencies.telemetry.record(
        context.runId,
        "screenshot.captured",
        { path: screenshot.path },
        Date.now() - screenshotStartedAt,
      );

      const extractionStartedAt = Date.now();
      const domSnapshot = await this.dependencies.runtimeExtraction.extractDom(page);
      this.dependencies.telemetry.record(
        context.runId,
        "dom.extracted",
        { elementCount: domSnapshot.elements.length },
        Date.now() - extractionStartedAt,
      );

      const componentInventory = this.dependencies.runtimeExtraction.buildComponentInventory(domSnapshot);
      this.dependencies.telemetry.record(context.runId, "component.inventory.generated", {
        componentCount: componentInventory.components.length,
      });

      const governanceReport = createMockGovernanceReport(context, componentInventory);
      const summary = this.createSummary({
        context,
        evidenceDirectory,
        screenshot,
        componentInventory,
        startedAtMs,
        status: "passed",
      });

      this.dependencies.telemetry.record(context.runId, "evidence.generated", {
        evidenceDirectory,
      });
      this.dependencies.telemetry.record(context.runId, "execution.completed", {
        status: summary.status,
      });

      return this.dependencies.evidenceWriter.writeBundle({
        context,
        evidenceDirectory,
        screenshot,
        domSnapshot,
        componentInventory,
        telemetry: this.dependencies.telemetry.getEvents(),
        governanceReport,
        summary,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown execution error";
      this.dependencies.telemetry.record(context.runId, "execution.failed", { errorMessage });

      const domSnapshot = this.emptyDomSnapshot(request.targetUrl);
      const componentInventory: RuntimeComponentInventory = {
        capturedAt: new Date().toISOString(),
        components: [],
      };
      const governanceReport = createMockGovernanceReport(context, componentInventory);
      const summary = this.createSummary({
        context,
        evidenceDirectory,
        componentInventory,
        startedAtMs,
        status: "failed",
        errorMessage,
      });

      return this.dependencies.evidenceWriter.writeBundle({
        context,
        evidenceDirectory,
        domSnapshot,
        componentInventory,
        telemetry: this.dependencies.telemetry.getEvents(),
        governanceReport,
        summary,
      });
    } finally {
      await browser?.close();
    }
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
