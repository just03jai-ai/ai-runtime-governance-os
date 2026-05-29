import type { OperationalInsightsReport } from "../../agents/analyzer/operational-insights-report.js";
import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { GovernanceValidationFinding } from "../../governance/validation/governance-finding.js";
import type { RuntimePipelineStageMetric } from "../../orchestration/runtime-pipeline-orchestrator.js";
import type { FindingsReportGovernanceScore } from "../../reports/findings/findings-report.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";

export interface HistoricalExecutionRecord {
  readonly correlationId?: string | undefined;
  readonly runtimeEvidence: RuntimeEvidence;
  readonly governanceFindings: readonly GovernanceValidationFinding[];
  readonly verifiedFindings: readonly VerifiedFinding[];
  readonly analyzerInsights: OperationalInsightsReport;
  readonly executionMetrics: readonly RuntimePipelineStageMetric[];
  readonly governanceScore: FindingsReportGovernanceScore;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface ExecutionHistoryQuery {
  readonly route?: string | undefined;
  readonly routeId?: string | undefined;
  readonly severity?: string | undefined;
  readonly limit?: number | undefined;
}

export interface ExecutionHistorySummary {
  readonly runId: string;
  readonly route: string;
  readonly routeId?: string | undefined;
  readonly status: "passed" | "failed";
  readonly startedAt: string;
  readonly completedAt?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly governanceScore?: number | undefined;
  readonly findingCount: number;
  readonly verifiedFindingCount: number;
}

export interface GovernanceExecutionRepository {
  saveExecution(record: HistoricalExecutionRecord): Promise<void>;
  findExecution(runId: string): Promise<HistoricalExecutionRecord | undefined>;
  listExecutionHistory(query?: ExecutionHistoryQuery): Promise<readonly ExecutionHistorySummary[]>;
}

export interface StorageMigration {
  readonly version: string;
  readonly name: string;
  readonly sql: string;
}
