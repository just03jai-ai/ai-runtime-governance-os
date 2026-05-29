import type { DriftAnalysisReport, HistoricalInsights, MemoryExecutionSnapshot } from "../../agents/memory/types.js";
import type { MonitoringInsights, RouteHealthMonitoring } from "../../agents/monitoring/monitoring-agent.js";
import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { GovernanceScore } from "../../governance/scoring/governance-scoring-engine.js";
import type { RuntimePipelineStageMetric } from "../../orchestration/runtime-pipeline-orchestrator.js";

export interface OperationalIntelligenceReportInput {
  readonly verifiedFindings: readonly VerifiedFinding[];
  readonly historicalExecutions: readonly MemoryExecutionSnapshot[];
  readonly executionMetrics?: readonly RuntimePipelineStageMetric[] | undefined;
  readonly historicalInsights?: HistoricalInsights | undefined;
  readonly driftAnalysis?: DriftAnalysisReport | undefined;
  readonly monitoringInsights?: MonitoringInsights | undefined;
  readonly governanceScore?: GovernanceScore | undefined;
  readonly generatedAt?: string | undefined;
}

export interface OperationalOverviewSection {
  readonly monitoredExecutionCount: number;
  readonly routeCount: number;
  readonly activeFindingCount: number;
  readonly governanceQualityScore?: number | undefined;
  readonly releaseRisk: "low" | "medium" | "high" | "critical";
  readonly releaseRiskIndicators: readonly string[];
}

export interface GovernanceTrendsSection {
  readonly direction: "improving" | "regressing" | "stable" | "insufficient-data";
  readonly currentScore?: number | undefined;
  readonly previousScore?: number | undefined;
  readonly delta?: number | undefined;
  readonly averageScore?: number | undefined;
  readonly executionScores: readonly {
    readonly runId: string;
    readonly route: string;
    readonly startedAt: string;
    readonly score: number;
  }[];
}

export interface RecurringViolationsSection {
  readonly totalRecurringViolationCount: number;
  readonly totalRegressionCount: number;
  readonly topRecurringViolations: NonNullable<HistoricalInsights["recurringViolations"]>;
}

export interface AccessibilityHealthSection {
  readonly violationCount: number;
  readonly affectedRoutes: readonly string[];
  readonly affectedComponents: readonly string[];
  readonly driftScore?: number | undefined;
  readonly trendDirection?: string | undefined;
}

export interface ComponentStabilitySection {
  readonly unstableComponentCount: number;
  readonly components: readonly {
    readonly component: string;
    readonly occurrenceCount: number;
    readonly affectedRunCount: number;
    readonly affectedRoutes: readonly string[];
    readonly highestSeverity: string;
  }[];
}

export interface DriftAnalysisSection {
  readonly overallDriftScore?: number | undefined;
  readonly governanceScoreDegraded: boolean;
  readonly governanceScoreDegradationAmount: number;
  readonly routeDriftCount: number;
  readonly componentDriftCount: number;
  readonly tokenDriftCount: number;
  readonly accessibilityDriftCount: number;
  readonly driftSummaries: readonly string[];
}

export interface OperationalIntelligenceReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly operationalOverview: OperationalOverviewSection;
  readonly governanceTrends: GovernanceTrendsSection;
  readonly recurringViolations: RecurringViolationsSection;
  readonly routeHealth: readonly RouteHealthMonitoring[];
  readonly accessibilityHealth: AccessibilityHealthSection;
  readonly componentStability: ComponentStabilitySection;
  readonly driftAnalysis: DriftAnalysisSection;
  readonly executionMetrics: readonly RuntimePipelineStageMetric[];
}

export function buildOperationalIntelligenceReport(
  input: OperationalIntelligenceReportInput,
): OperationalIntelligenceReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const activeFindings = input.verifiedFindings.filter((finding) => finding.status !== "rejected");
  const governanceTrends = buildGovernanceTrends(input);
  const routeHealth = input.monitoringInsights?.routeHealth ?? [];
  const accessibilityHealth = buildAccessibilityHealth(activeFindings, input.driftAnalysis);
  const componentStability = buildComponentStability(input.historicalInsights);
  const driftAnalysis = buildDriftAnalysis(input.driftAnalysis);
  const riskIndicators = buildReleaseRiskIndicators({
    activeFindings,
    governanceScore: input.governanceScore,
    driftAnalysis: input.driftAnalysis,
    monitoringInsights: input.monitoringInsights,
  });

  return {
    reportId: `operational-intelligence:${generatedAt}`,
    generatedAt,
    operationalOverview: {
      monitoredExecutionCount: input.historicalExecutions.length,
      routeCount: new Set(input.historicalExecutions.map((snapshot) => snapshot.metadata.route)).size,
      activeFindingCount: activeFindings.length,
      ...(input.governanceScore ? { governanceQualityScore: input.governanceScore.score } : {}),
      releaseRisk: releaseRisk(riskIndicators, input.governanceScore?.score),
      releaseRiskIndicators: riskIndicators,
    },
    governanceTrends,
    recurringViolations: {
      totalRecurringViolationCount: input.historicalInsights?.recurringViolations.length ?? 0,
      totalRegressionCount: input.historicalInsights?.regressions.length ?? 0,
      topRecurringViolations: input.historicalInsights?.recurringViolations.slice(0, 10) ?? [],
    },
    routeHealth,
    accessibilityHealth,
    componentStability,
    driftAnalysis,
    executionMetrics: input.executionMetrics ?? [],
  };
}

function buildGovernanceTrends(input: OperationalIntelligenceReportInput): GovernanceTrendsSection {
  if (input.historicalInsights?.governanceScoreTrend) {
    return {
      direction: input.historicalInsights.governanceScoreTrend.direction,
      ...(input.historicalInsights.governanceScoreTrend.currentScore === undefined
        ? {}
        : { currentScore: input.historicalInsights.governanceScoreTrend.currentScore }),
      ...(input.historicalInsights.governanceScoreTrend.previousScore === undefined
        ? {}
        : { previousScore: input.historicalInsights.governanceScoreTrend.previousScore }),
      ...(input.historicalInsights.governanceScoreTrend.delta === undefined
        ? {}
        : { delta: input.historicalInsights.governanceScoreTrend.delta }),
      ...(input.historicalInsights.governanceScoreTrend.averageScore === undefined
        ? {}
        : { averageScore: input.historicalInsights.governanceScoreTrend.averageScore }),
      executionScores: input.historicalInsights.governanceScoreTrend.points,
    };
  }

  const scores = input.historicalExecutions
    .filter((snapshot) => snapshot.metadata.governanceScore !== undefined)
    .sort((a, b) => a.metadata.startedAt.localeCompare(b.metadata.startedAt))
    .map((snapshot) => ({
      runId: snapshot.metadata.runId,
      route: snapshot.metadata.route,
      startedAt: snapshot.metadata.startedAt,
      score: snapshot.metadata.governanceScore as number,
    }));
  const current = scores.at(-1);
  const previous = scores.at(-2);
  const delta = current && previous ? current.score - previous.score : undefined;

  return {
    direction: directionForDelta(delta),
    ...(current ? { currentScore: current.score } : {}),
    ...(previous ? { previousScore: previous.score } : {}),
    ...(delta === undefined ? {} : { delta }),
    averageScore: scores.length === 0 ? undefined : Math.round(scores.reduce((total, point) => total + point.score, 0) / scores.length),
    executionScores: scores,
  };
}

function buildAccessibilityHealth(
  findings: readonly VerifiedFinding[],
  driftAnalysis: DriftAnalysisReport | undefined,
): AccessibilityHealthSection {
  const accessibilityFindings = findings.filter((finding) =>
    [finding.id, finding.expected, finding.actual, ...finding.reasons].join(" ").toLowerCase().match(/accessib|aria|label|focus|keyboard|contrast/),
  );
  const topDrift = driftAnalysis?.accessibilityDrift[0];

  return {
    violationCount: accessibilityFindings.length,
    affectedRoutes: [...new Set(accessibilityFindings.map((finding) => finding.route))].sort(),
    affectedComponents: [...new Set(accessibilityFindings.map((finding) => finding.component))].sort(),
    ...(topDrift ? { driftScore: topDrift.driftScore, trendDirection: topDrift.violationTrend.direction } : {}),
  };
}

function buildComponentStability(insights: HistoricalInsights | undefined): ComponentStabilitySection {
  const components =
    insights?.componentFailureFrequency.map((component) => ({
      component: component.component,
      occurrenceCount: component.occurrenceCount,
      affectedRunCount: component.affectedRunCount,
      affectedRoutes: component.affectedRoutes,
      highestSeverity: component.highestSeverity,
    })) ?? [];

  return {
    unstableComponentCount: components.length,
    components: components.slice(0, 10),
  };
}

function buildDriftAnalysis(driftAnalysis: DriftAnalysisReport | undefined): DriftAnalysisSection {
  return {
    ...(driftAnalysis ? { overallDriftScore: driftAnalysis.overallDriftScore } : {}),
    governanceScoreDegraded: driftAnalysis?.governanceScoreDegradation.degraded ?? false,
    governanceScoreDegradationAmount: driftAnalysis?.governanceScoreDegradation.degradationAmount ?? 0,
    routeDriftCount: driftAnalysis?.routeDrift.length ?? 0,
    componentDriftCount: driftAnalysis?.componentDrift.length ?? 0,
    tokenDriftCount: driftAnalysis?.tokenDriftEvolution.length ?? 0,
    accessibilityDriftCount: driftAnalysis?.accessibilityDrift.length ?? 0,
    driftSummaries: driftAnalysis?.degradationIndicators.slice(0, 12) ?? [],
  };
}

function buildReleaseRiskIndicators(input: {
  readonly activeFindings: readonly VerifiedFinding[];
  readonly governanceScore?: GovernanceScore | undefined;
  readonly driftAnalysis?: DriftAnalysisReport | undefined;
  readonly monitoringInsights?: MonitoringInsights | undefined;
}): readonly string[] {
  const indicators: string[] = [];
  const criticalCount = input.activeFindings.filter((finding) => finding.severity === "critical").length;
  if (criticalCount > 0) {
    indicators.push(`${criticalCount} critical governance finding(s)`);
  }
  if (input.governanceScore && input.governanceScore.score < 70) {
    indicators.push(`governance quality score is ${input.governanceScore.score}`);
  }
  if (input.driftAnalysis?.governanceScoreDegradation.degraded) {
    indicators.push(`governance score degraded by ${input.driftAnalysis.governanceScoreDegradation.degradationAmount} point(s)`);
  }
  if ((input.monitoringInsights?.executionReliability.failedStageCount ?? 0) > 0) {
    indicators.push(`${input.monitoringInsights?.executionReliability.failedStageCount ?? 0} failed execution stage(s)`);
  }
  if ((input.monitoringInsights?.executionReliability.retryCount ?? 0) > 0) {
    indicators.push(`${input.monitoringInsights?.executionReliability.retryCount ?? 0} retry attempt(s) observed`);
  }
  return [...new Set(indicators)].sort();
}

function releaseRisk(indicators: readonly string[], score: number | undefined): OperationalOverviewSection["releaseRisk"] {
  if (indicators.some((indicator) => indicator.includes("critical")) || (score !== undefined && score < 40)) {
    return "critical";
  }
  if (indicators.length >= 3 || (score !== undefined && score < 70)) {
    return "high";
  }
  if (indicators.length > 0 || (score !== undefined && score < 85)) {
    return "medium";
  }
  return "low";
}

function directionForDelta(delta: number | undefined): GovernanceTrendsSection["direction"] {
  if (delta === undefined) {
    return "insufficient-data";
  }
  if (delta > 0) {
    return "improving";
  }
  if (delta < 0) {
    return "regressing";
  }
  return "stable";
}
