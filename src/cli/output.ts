import type { RuntimePipelineResult, RuntimePipelineStageMetric } from "../orchestration/runtime-pipeline-orchestrator.js";
import type { FindingsReport } from "../reports/findings/findings-report.js";

export function printHeader(title: string): void {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
}

export function printKeyValues(values: Readonly<Record<string, string | number | boolean | undefined>>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      console.log(`${key}: ${String(value)}`);
    }
  }
}

export function printPipelineSummary(result: RuntimePipelineResult): void {
  printHeader("Pipeline Summary");
  printKeyValues({
    runId: result.runtimeEvidence.execution.runId,
    route: result.runtimeEvidence.route.resolvedUrl,
    status: result.runtimeEvidence.execution.status,
    governanceFindings: result.governanceFindings.length,
    verifiedFindings: result.verifiedFindings.length,
    governanceScore: result.findingsReport.governanceScore.score,
  });

  printStageMetrics(result.metrics);
}

export function printReportSummary(report: FindingsReport): void {
  printHeader("Report Summary");
  printKeyValues({
    reportId: report.reportId,
    runId: report.executionSummary.runId,
    route: report.executionSummary.route,
    score: report.governanceScore.score,
    critical: report.severitySummary.critical,
    medium: report.severitySummary.medium,
    minor: report.severitySummary.minor,
  });
}

export function printStageMetrics(metrics: readonly RuntimePipelineStageMetric[]): void {
  printHeader("Stage Status");

  for (const metric of metrics) {
    const error = metric.errorMessage ? ` (${metric.errorMessage})` : "";
    console.log(`${metric.stage}: ${metric.status} in ${metric.durationMs}ms after ${metric.attempts} attempt(s)${error}`);
  }
}
