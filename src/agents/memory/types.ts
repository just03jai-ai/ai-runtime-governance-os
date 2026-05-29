import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { ExecutionEnvironment } from "../../shared/types/execution.js";
import type { SeverityLevel } from "../../shared/types/severity.js";

export interface ExecutionMetadata {
  readonly runId: string;
  readonly route: string;
  readonly routeId?: string | undefined;
  readonly environment?: ExecutionEnvironment | undefined;
  readonly status?: "passed" | "failed" | undefined;
  readonly governanceScore?: number | undefined;
  readonly startedAt: string;
  readonly completedAt?: string | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface MemoryExecutionSnapshot {
  readonly metadata: ExecutionMetadata;
  readonly verifiedFindings: readonly VerifiedFinding[];
}

export interface MemoryHistoryQuery {
  readonly route?: string | undefined;
  readonly routeId?: string | undefined;
  readonly limit?: number | undefined;
}

export interface HistoricalMemoryRepository {
  saveExecutionSnapshot(snapshot: MemoryExecutionSnapshot): Promise<void>;
  listExecutionSnapshots(query?: MemoryHistoryQuery): Promise<readonly MemoryExecutionSnapshot[]>;
}

export interface ViolationRecurrence {
  readonly signature: string;
  readonly route: string;
  readonly component: string;
  readonly severity: SeverityLevel;
  readonly occurrenceCount: number;
  readonly affectedRunIds: readonly string[];
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly currentFindingIds: readonly string[];
}

export interface RegressionFinding {
  readonly signature: string;
  readonly findingId: string;
  readonly route: string;
  readonly component: string;
  readonly severity: SeverityLevel;
  readonly regressionType: "returned-after-clean-run" | "new-violation";
  readonly previousCleanRunId?: string | undefined;
  readonly lastSeenRunId?: string | undefined;
}

export interface GovernanceScoreTrendPoint {
  readonly runId: string;
  readonly route: string;
  readonly startedAt: string;
  readonly score: number;
}

export interface GovernanceScoreTrend {
  readonly points: readonly GovernanceScoreTrendPoint[];
  readonly currentScore?: number | undefined;
  readonly previousScore?: number | undefined;
  readonly delta?: number | undefined;
  readonly averageScore?: number | undefined;
  readonly direction: "improving" | "regressing" | "stable" | "insufficient-data";
}

export interface RouteHistoryInsight {
  readonly route: string;
  readonly routeId?: string | undefined;
  readonly executionCount: number;
  readonly latestRunId: string;
  readonly latestStartedAt: string;
  readonly averageGovernanceScore?: number | undefined;
  readonly totalVerifiedFindings: number;
  readonly recurringViolationCount: number;
}

export interface ComponentFailureFrequency {
  readonly component: string;
  readonly occurrenceCount: number;
  readonly affectedRunCount: number;
  readonly affectedRoutes: readonly string[];
  readonly highestSeverity: SeverityLevel;
  readonly latestSeenAt: string;
}

export interface HistoricalInsights {
  readonly runId: string;
  readonly generatedAt: string;
  readonly analyzedExecutionCount: number;
  readonly recurringViolations: readonly ViolationRecurrence[];
  readonly regressions: readonly RegressionFinding[];
  readonly governanceScoreTrend: GovernanceScoreTrend;
  readonly routeHistory: readonly RouteHistoryInsight[];
  readonly componentFailureFrequency: readonly ComponentFailureFrequency[];
}

export type DriftTrendDirection = "increasing" | "decreasing" | "stable" | "insufficient-data";

export interface DriftTrend {
  readonly direction: DriftTrendDirection;
  readonly firstValue?: number | undefined;
  readonly previousValue?: number | undefined;
  readonly currentValue?: number | undefined;
  readonly deltaFromPrevious?: number | undefined;
  readonly deltaFromBaseline?: number | undefined;
}

export interface DriftSeveritySummary {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
}

export interface DriftExecutionPoint {
  readonly runId: string;
  readonly route: string;
  readonly startedAt: string;
  readonly governanceScore?: number | undefined;
  readonly violationCount: number;
  readonly accessibilityViolationCount: number;
  readonly tokenViolationCount: number;
  readonly severity: DriftSeveritySummary;
}

export interface RouteDriftInsight {
  readonly route: string;
  readonly executionCount: number;
  readonly violationTrend: DriftTrend;
  readonly scoreTrend: DriftTrend;
  readonly driftScore: number;
  readonly degradationIndicators: readonly string[];
}

export interface ComponentDriftInsight {
  readonly component: string;
  readonly affectedRoutes: readonly string[];
  readonly violationTrend: DriftTrend;
  readonly latestSeverity: SeverityLevel;
  readonly driftScore: number;
  readonly degradationIndicators: readonly string[];
}

export interface TokenDriftEvolution {
  readonly tokenName: string;
  readonly affectedComponents: readonly string[];
  readonly occurrenceTrend: DriftTrend;
  readonly driftScore: number;
  readonly degradationIndicators: readonly string[];
}

export interface AccessibilityDriftInsight {
  readonly route: string;
  readonly violationTrend: DriftTrend;
  readonly affectedComponents: readonly string[];
  readonly driftScore: number;
  readonly degradationIndicators: readonly string[];
}

export interface GovernanceScoreDegradation {
  readonly trend: DriftTrend;
  readonly degraded: boolean;
  readonly degradationAmount: number;
}

export interface DriftAnalysisReport {
  readonly reportId: string;
  readonly runId: string;
  readonly generatedAt: string;
  readonly analyzedExecutionCount: number;
  readonly overallDriftScore: number;
  readonly governanceScoreDegradation: GovernanceScoreDegradation;
  readonly executionTimeline: readonly DriftExecutionPoint[];
  readonly routeDrift: readonly RouteDriftInsight[];
  readonly componentDrift: readonly ComponentDriftInsight[];
  readonly tokenDriftEvolution: readonly TokenDriftEvolution[];
  readonly accessibilityDrift: readonly AccessibilityDriftInsight[];
  readonly degradationIndicators: readonly string[];
}
