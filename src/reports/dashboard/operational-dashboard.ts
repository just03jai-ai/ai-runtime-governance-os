import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { RuntimePipelineStageMetric } from "../../orchestration/runtime-pipeline-orchestrator.js";
import type { OperationalInsightsReport } from "../../shared/types/operational-insights-report.js";
import type { RuntimeEvidenceScreenshot } from "../../shared/types/runtime-evidence.js";

export interface OperationalDashboardInput {
  readonly findings: readonly VerifiedFinding[];
  readonly insights: OperationalInsightsReport;
  readonly screenshots?: readonly RuntimeEvidenceScreenshot[] | undefined;
  readonly executionMetrics?: readonly RuntimePipelineStageMetric[] | undefined;
  readonly generatedAt?: string | undefined;
}

export interface DashboardSeveritySummary {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly total: number;
}

export interface DashboardRouteSummary {
  readonly route: string;
  readonly findingCount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
}

export interface OperationalDashboardModel {
  readonly generatedAt: string;
  readonly governanceScore: number;
  readonly severitySummary: DashboardSeveritySummary;
  readonly routeSummaries: readonly DashboardRouteSummary[];
  readonly criticalFindings: readonly VerifiedFinding[];
  readonly warningFindings: readonly VerifiedFinding[];
  readonly infoFindings: readonly VerifiedFinding[];
  readonly screenshots: readonly RuntimeEvidenceScreenshot[];
  readonly executionMetrics: readonly RuntimePipelineStageMetric[];
  readonly insights: OperationalInsightsReport;
}

export function buildOperationalDashboardModel(input: OperationalDashboardInput): OperationalDashboardModel {
  const activeFindings = input.findings.filter((finding) => finding.status !== "rejected");
  const criticalFindings = activeFindings.filter((finding) => finding.severity === "critical");
  const warningFindings = activeFindings.filter((finding) => finding.severity === "warning");
  const infoFindings = activeFindings.filter((finding) => finding.severity === "info");

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    governanceScore: scoreGovernance(activeFindings),
    severitySummary: {
      critical: criticalFindings.length,
      warning: warningFindings.length,
      info: infoFindings.length,
      total: activeFindings.length,
    },
    routeSummaries: summarizeRoutes(activeFindings),
    criticalFindings,
    warningFindings,
    infoFindings,
    screenshots: input.screenshots ?? [],
    executionMetrics: input.executionMetrics ?? [],
    insights: input.insights,
  };
}

function scoreGovernance(findings: readonly VerifiedFinding[]): number {
  const penalty = findings.reduce((total, finding) => {
    const severityWeight = finding.severity === "critical" ? 15 : finding.severity === "warning" ? 8 : 3;
    return total + severityWeight * finding.confidence;
  }, 0);

  return Math.max(0, Math.round(100 - penalty));
}

function summarizeRoutes(findings: readonly VerifiedFinding[]): readonly DashboardRouteSummary[] {
  const byRoute = new Map<string, VerifiedFinding[]>();

  for (const finding of findings) {
    byRoute.set(finding.route, [...(byRoute.get(finding.route) ?? []), finding]);
  }

  return [...byRoute.entries()]
    .map(([route, routeFindings]) => ({
      route,
      findingCount: routeFindings.length,
      criticalCount: routeFindings.filter((finding) => finding.severity === "critical").length,
      warningCount: routeFindings.filter((finding) => finding.severity === "warning").length,
      infoCount: routeFindings.filter((finding) => finding.severity === "info").length,
    }))
    .sort((left, right) => right.findingCount - left.findingCount || left.route.localeCompare(right.route));
}
