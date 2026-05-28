import type { ScreenshotEvidence } from "../../governance/contracts/evidence.js";
import type {
  RuntimeExecutionContext,
  RuntimeExecutionSummary,
} from "../../governance/contracts/execution.js";
import type { RuntimeComponentInventory, RuntimeDomSnapshot } from "../../governance/contracts/runtime.js";
import type { TelemetryEvent } from "../../governance/contracts/telemetry.js";
import type {
  RuntimeEvidence,
  RuntimeEvidenceComponent,
  RuntimeEvidenceScreenshot,
} from "../../shared/types/runtime-evidence.js";
import { runtimeEvidenceSchemaVersion } from "../../shared/schemas/runtime-evidence.schema.js";

export interface RuntimeEvidenceNormalizationInput {
  readonly context: RuntimeExecutionContext;
  readonly domSnapshot: RuntimeDomSnapshot;
  readonly componentInventory: RuntimeComponentInventory;
  readonly telemetry: readonly TelemetryEvent[];
  readonly summary: RuntimeExecutionSummary;
  readonly screenshot?: ScreenshotEvidence;
}

export class RuntimeEvidenceNormalizerService {
  normalize(input: RuntimeEvidenceNormalizationInput): RuntimeEvidence {
    const capturedAt = input.domSnapshot.capturedAt;
    const screenshots = input.screenshot ? [this.normalizeScreenshot(input.screenshot)] : [];

    return {
      schemaVersion: runtimeEvidenceSchemaVersion,
      execution: {
        runId: input.context.runId,
        schemaVersion: runtimeEvidenceSchemaVersion,
        environment: input.context.request.environment,
        executor: "execution-agent",
        status: input.summary.status,
        durationMs: input.summary.durationMs,
      },
      route: {
        targetUrl: input.context.request.targetUrl,
        resolvedUrl: input.domSnapshot.url,
        title: input.domSnapshot.title,
        ...(input.context.request.runLabel ? { runLabel: input.context.request.runLabel } : {}),
      },
      timestamps: {
        startedAt: input.context.startedAt,
        capturedAt,
        completedAt: input.summary.completedAt,
      },
      domSnapshot: {
        capturedAt,
        elementCount: input.domSnapshot.elements.length,
        interactiveElementCount: input.componentInventory.components.length,
        extractionStrategy: "playwright-dom",
      },
      componentInventory: input.componentInventory.components.map((component) =>
        this.normalizeComponent(component, input.domSnapshot),
      ),
      designTokens: [],
      accessibilityFindings: [],
      screenshots,
      telemetry: input.telemetry.map((event) => ({
        eventId: event.eventId,
        type: event.type,
        timestamp: event.timestamp,
        ...(event.durationMs === undefined ? {} : { durationMs: event.durationMs }),
        ...(event.metadata ? { metadata: event.metadata } : {}),
      })),
      governanceViolations: [],
      confidence: {
        score: input.summary.status === "passed" ? 1 : 0,
        basis: "runtime-observation",
        notes:
          input.summary.status === "passed"
            ? ["Evidence is based on deterministic Playwright runtime capture."]
            : [input.summary.errorMessage ?? "Runtime execution failed before complete evidence capture."],
      },
    };
  }

  private normalizeComponent(
    component: RuntimeComponentInventory["components"][number],
    domSnapshot: RuntimeDomSnapshot,
  ): RuntimeEvidenceComponent {
    const sourceElement = domSnapshot.elements.find((element) => element.selectorHint === component.selectorHint);

    return {
      id: component.id,
      tagName: component.tagName,
      role: component.role,
      label: component.label,
      selectorHint: component.selectorHint,
      visible: component.visible,
      ...(sourceElement?.boundingBox ? { boundingBox: sourceElement.boundingBox } : {}),
      source: component.source,
    };
  }

  private normalizeScreenshot(screenshot: ScreenshotEvidence): RuntimeEvidenceScreenshot {
    return {
      id: "full-page",
      path: screenshot.path,
      capturedAt: screenshot.capturedAt,
      viewport: screenshot.viewport,
      fullPage: true,
    };
  }
}
