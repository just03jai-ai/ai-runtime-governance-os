import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { RuntimeEvidenceScreenshot } from "../../shared/types/runtime-evidence.js";

export type ReportSeverityBucket = "critical" | "medium" | "minor";

export interface FindingsReportExecutionSummary {
  readonly runId: string;
  readonly route: string;
  readonly title: string;
  readonly generatedAt: string;
  readonly executionStatus: "passed" | "failed" | "unknown";
  readonly durationMs?: number | undefined;
}

export interface FindingsReportSeveritySummary {
  readonly critical: number;
  readonly medium: number;
  readonly minor: number;
  readonly total: number;
}

export interface FindingsReportGovernanceScore {
  readonly score: number;
  readonly verifiedFindingCount: number;
  readonly needsReviewFindingCount: number;
  readonly rejectedFindingCount: number;
}

export interface FindingsReportRouteSummary {
  readonly route: string;
  readonly findingCount: number;
  readonly criticalCount: number;
  readonly mediumCount: number;
  readonly minorCount: number;
}

export interface FindingsReportEvidenceReference {
  readonly findingId: string;
  readonly component: string;
  readonly route: string;
  readonly evidence: VerifiedFinding["evidence"];
}

export interface FindingsReport {
  readonly reportId: string;
  readonly executionSummary: FindingsReportExecutionSummary;
  readonly governanceScore: FindingsReportGovernanceScore;
  readonly severitySummary: FindingsReportSeveritySummary;
  readonly routeAnalysis: readonly FindingsReportRouteSummary[];
  readonly criticalFindings: readonly VerifiedFinding[];
  readonly mediumFindings: readonly VerifiedFinding[];
  readonly minorFindings: readonly VerifiedFinding[];
  readonly evidenceReferences: readonly FindingsReportEvidenceReference[];
  readonly screenshots: readonly RuntimeEvidenceScreenshot[];
}
