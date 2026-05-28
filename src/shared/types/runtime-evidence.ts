import type { AccessibilityFinding } from "./accessibility-finding.js";
import type { ComponentBoundingBox, ComponentInventoryItem } from "./component-inventory.js";
import type { ConfidenceScore } from "./confidence-score.js";
import type { ExecutionEnvironment } from "./execution.js";
import type { RouteMetadata } from "./route-metadata.js";
import type { SeverityLevel } from "./severity.js";
import type { TelemetrySnapshotEvent } from "./telemetry-snapshot.js";

export type RuntimeEvidenceSchemaVersion = "runtime-evidence/v1";

export type RuntimeEvidenceEnvironment = ExecutionEnvironment;

export type RuntimeEvidenceSeverity = SeverityLevel;

export interface RuntimeEvidenceTimestampSet {
  readonly startedAt: string;
  readonly capturedAt: string;
  readonly completedAt?: string | undefined;
}

export interface RuntimeEvidenceExecutionMetadata {
  readonly runId: string;
  readonly schemaVersion: RuntimeEvidenceSchemaVersion;
  readonly environment: RuntimeEvidenceEnvironment;
  readonly executor: "execution-agent";
  readonly status: "passed" | "failed";
  readonly durationMs?: number | undefined;
}

export type RuntimeEvidenceRouteMetadata = RouteMetadata;

export interface RuntimeEvidenceDomSnapshotMetadata {
  readonly capturedAt: string;
  readonly elementCount: number;
  readonly interactiveElementCount: number;
  readonly extractionStrategy: "playwright-dom";
}

export type RuntimeEvidenceBoundingBox = ComponentBoundingBox;

export type RuntimeEvidenceComponent = ComponentInventoryItem;

export interface RuntimeEvidenceDesignToken {
  readonly name: string;
  readonly value: string;
  readonly category: "color" | "typography" | "spacing" | "radius" | "shadow" | "unknown";
  readonly source: "computed-style" | "css-variable" | "design-system";
}

export type RuntimeEvidenceAccessibilityFinding = AccessibilityFinding;

export interface RuntimeEvidenceScreenshot {
  readonly id: string;
  readonly path: string;
  readonly capturedAt: string;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
  };
  readonly fullPage: boolean;
}

export type RuntimeEvidenceTelemetryEvent = TelemetrySnapshotEvent;

export interface RuntimeEvidenceGovernanceViolation {
  readonly id: string;
  readonly policyId: string;
  readonly severity: RuntimeEvidenceSeverity;
  readonly title: string;
  readonly description: string;
  readonly selectorHint?: string | undefined;
  readonly deterministic: true;
}

export interface RuntimeEvidenceConfidenceScore extends ConfidenceScore {
  readonly basis: "runtime-observation";
}

// Normalization gives future agents one stable evidence shape regardless of
// which browser, route, or extractor produced the data. Agents should depend on
// these deterministic fields instead of scraping raw DOM or artifact files.
export interface RuntimeEvidence {
  readonly schemaVersion: RuntimeEvidenceSchemaVersion;
  readonly execution: RuntimeEvidenceExecutionMetadata;
  readonly route: RuntimeEvidenceRouteMetadata;
  readonly timestamps: RuntimeEvidenceTimestampSet;
  readonly domSnapshot: RuntimeEvidenceDomSnapshotMetadata;
  readonly componentInventory: readonly RuntimeEvidenceComponent[];
  readonly designTokens: readonly RuntimeEvidenceDesignToken[];
  readonly accessibilityFindings: readonly RuntimeEvidenceAccessibilityFinding[];
  readonly screenshots: readonly RuntimeEvidenceScreenshot[];
  readonly telemetry: readonly RuntimeEvidenceTelemetryEvent[];
  readonly governanceViolations: readonly RuntimeEvidenceGovernanceViolation[];
  readonly confidence: RuntimeEvidenceConfidenceScore;
}
