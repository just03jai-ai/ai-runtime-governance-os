import type { RuntimeExecutionContext, RuntimeExecutionSummary } from "./execution.js";
import type { RuntimeComponentInventory, RuntimeDomSnapshot } from "./runtime.js";
import type { TelemetryEvent } from "./telemetry.js";

export interface ScreenshotEvidence {
  readonly path: string;
  readonly capturedAt: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
}

export interface GovernanceReportFinding {
  readonly id: string;
  readonly severity: "info" | "warning" | "critical";
  readonly title: string;
  readonly description: string;
}

export interface GovernanceReport {
  readonly reportId: string;
  readonly runId: string;
  readonly generatedAt: string;
  readonly status: "draft" | "ready";
  readonly summary: string;
  readonly findings: readonly GovernanceReportFinding[];
}

export interface EvidenceBundle {
  readonly context: RuntimeExecutionContext;
  readonly screenshot?: ScreenshotEvidence;
  readonly domSnapshot: RuntimeDomSnapshot;
  readonly componentInventory: RuntimeComponentInventory;
  readonly telemetry: readonly TelemetryEvent[];
  readonly governanceReport: GovernanceReport;
  readonly summary: RuntimeExecutionSummary;
}
