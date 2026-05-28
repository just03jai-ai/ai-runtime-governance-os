import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import { FindingsAggregationService } from "./findings-aggregation.js";
import type { FindingsReport } from "./findings-report.js";
import { FindingsReportScoringService } from "./report-scoring.js";

export interface FindingsReportInput {
  readonly findings: readonly VerifiedFinding[];
  readonly evidence?: RuntimeEvidence | undefined;
}

export class FindingsReportEngine {
  constructor(
    private readonly aggregation = new FindingsAggregationService(),
    private readonly scoring = new FindingsReportScoringService(),
  ) {}

  generate(input: FindingsReportInput): FindingsReport {
    const activeFindings = input.findings.filter((finding) => finding.status !== "rejected");
    const route = input.evidence?.route.resolvedUrl ?? activeFindings[0]?.route ?? "unknown";
    const runId = input.evidence?.execution.runId ?? "unknown";

    return {
      reportId: `findings-report:${runId}`,
      executionSummary: {
        runId,
        route,
        title: input.evidence?.route.title ?? "",
        generatedAt: new Date().toISOString(),
        executionStatus: input.evidence?.execution.status ?? "unknown",
        durationMs: input.evidence?.execution.durationMs,
      },
      governanceScore: this.scoring.score(input.findings),
      severitySummary: this.aggregation.severitySummary(activeFindings),
      routeAnalysis: this.aggregation.routeSummaries(activeFindings),
      criticalFindings: this.aggregation.byBucket(activeFindings, "critical"),
      mediumFindings: this.aggregation.byBucket(activeFindings, "medium"),
      minorFindings: this.aggregation.byBucket(activeFindings, "minor"),
      evidenceReferences: this.aggregation.evidenceReferences(activeFindings),
      screenshots: input.evidence?.screenshots ?? [],
    };
  }
}
