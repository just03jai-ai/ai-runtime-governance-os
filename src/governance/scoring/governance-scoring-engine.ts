import type { MonitoringExecutionMetric } from "../../agents/monitoring/monitoring-agent.js";
import type { DriftAnalysisReport, HistoricalInsights, MemoryExecutionSnapshot } from "../../agents/memory/types.js";
import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { SeverityLevel } from "../../shared/types/severity.js";

export interface GovernanceScoringWeights {
  readonly criticalFinding: number;
  readonly warningFinding: number;
  readonly infoFinding: number;
  readonly accessibilityViolation: number;
  readonly tokenDrift: number;
  readonly componentMisuse: number;
  readonly recurringRegression: number;
  readonly lowVerificationConfidence: number;
  readonly failedExecutionStage: number;
  readonly retryAttempt: number;
  readonly scoreDegradationPoint: number;
  readonly driftScoreMultiplier: number;
}

export const defaultGovernanceScoringWeights: GovernanceScoringWeights = {
  criticalFinding: 14,
  warningFinding: 5,
  infoFinding: 1,
  accessibilityViolation: 8,
  tokenDrift: 4,
  componentMisuse: 3,
  recurringRegression: 8,
  lowVerificationConfidence: 6,
  failedExecutionStage: 10,
  retryAttempt: 3,
  scoreDegradationPoint: 1,
  driftScoreMultiplier: 0.25,
};

export interface GovernanceScoringRequest {
  readonly verifiedFindings: readonly VerifiedFinding[];
  readonly executionMetrics?: readonly MonitoringExecutionMetric[] | undefined;
  readonly historicalExecutions?: readonly MemoryExecutionSnapshot[] | undefined;
  readonly historicalInsights?: HistoricalInsights | undefined;
  readonly driftAnalysis?: DriftAnalysisReport | undefined;
  readonly weights?: Partial<GovernanceScoringWeights> | undefined;
}

export interface GovernanceScoreFactor {
  readonly factor:
    | "critical-findings"
    | "accessibility-violations"
    | "token-drift"
    | "component-misuse"
    | "recurring-regressions"
    | "verification-confidence"
    | "execution-stability"
    | "historical-degradation";
  readonly count: number;
  readonly penalty: number;
}

export interface GovernanceRouteScore {
  readonly route: string;
  readonly score: number;
  readonly findingCount: number;
  readonly severity: GovernanceSeverityDistribution;
  readonly averageConfidence?: number | undefined;
  readonly penalties: readonly GovernanceScoreFactor[];
}

export interface GovernanceExecutionScore {
  readonly score: number;
  readonly stageCount: number;
  readonly failedStageCount: number;
  readonly retryCount: number;
  readonly totalDurationMs: number;
  readonly penalties: readonly GovernanceScoreFactor[];
}

export interface GovernanceHistoricalTrendScore {
  readonly score: number;
  readonly direction: "improving" | "regressing" | "stable" | "insufficient-data";
  readonly currentScore?: number | undefined;
  readonly previousScore?: number | undefined;
  readonly delta?: number | undefined;
  readonly degradationPenalty: number;
}

export interface GovernanceSeverityDistribution {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly total: number;
}

export interface GovernanceScore {
  readonly score: number;
  readonly status: "excellent" | "good" | "watch" | "degraded" | "critical";
  readonly severity: GovernanceSeverityDistribution;
  readonly factors: readonly GovernanceScoreFactor[];
  readonly routeScores: readonly GovernanceRouteScore[];
  readonly executionScore: GovernanceExecutionScore;
  readonly historicalTrend: GovernanceHistoricalTrendScore;
  readonly degradationPenalties: readonly GovernanceScoreFactor[];
  readonly weights: GovernanceScoringWeights;
}

export class GovernanceScoringEngine {
  score(request: GovernanceScoringRequest): GovernanceScore {
    const weights = { ...defaultGovernanceScoringWeights, ...(request.weights ?? {}) };
    const activeFindings = request.verifiedFindings.filter((finding) => finding.status !== "rejected");
    const severity = severityDistribution(activeFindings);
    const factors = compactFactors([
      severityFactor("critical-findings", severity.critical, weights.criticalFinding),
      countFactor("accessibility-violations", activeFindings.filter(isAccessibilityFinding).length, weights.accessibilityViolation),
      countFactor("token-drift", activeFindings.filter(isTokenDriftFinding).length, weights.tokenDrift),
      countFactor("component-misuse", activeFindings.filter(isComponentMisuseFinding).length, weights.componentMisuse),
      countFactor(
        "recurring-regressions",
        (request.historicalInsights?.recurringViolations.length ?? 0) + (request.historicalInsights?.regressions.length ?? 0),
        weights.recurringRegression,
      ),
      confidenceFactor(activeFindings, weights.lowVerificationConfidence),
      historicalPenaltyFactor(request.driftAnalysis, weights),
    ]);
    const routeScores = this.routeScores(activeFindings, weights);
    const executionScore = this.executionScore(request.executionMetrics ?? [], weights);
    const historicalTrend = this.historicalTrend(request.historicalExecutions ?? [], request.driftAnalysis, weights);
    const degradationPenalties = compactFactors([
      historicalPenaltyFactor(request.driftAnalysis, weights),
      countFactor(
        "recurring-regressions",
        request.historicalInsights?.regressions.length ?? 0,
        weights.recurringRegression,
      ),
    ]);
    const findingPenalty = factors.reduce((total, factor) => total + factor.penalty, 0);
    const executionPenalty = 100 - executionScore.score;
    const historicalPenalty = 100 - historicalTrend.score;
    const score = clampScore(100 - findingPenalty - executionPenalty * 0.25 - historicalPenalty * 0.25);

    return {
      score,
      status: statusForScore(score),
      severity,
      factors,
      routeScores,
      executionScore,
      historicalTrend,
      degradationPenalties,
      weights,
    };
  }

  private routeScores(
    findings: readonly VerifiedFinding[],
    weights: GovernanceScoringWeights,
  ): readonly GovernanceRouteScore[] {
    return [...groupBy(findings, (finding) => finding.route).entries()]
      .map(([route, routeFindings]) => {
        const severity = severityDistribution(routeFindings);
        const penalties = compactFactors([
          severityFactor("critical-findings", severity.critical, weights.criticalFinding),
          countFactor(
            "accessibility-violations",
            routeFindings.filter(isAccessibilityFinding).length,
            weights.accessibilityViolation,
          ),
          countFactor("token-drift", routeFindings.filter(isTokenDriftFinding).length, weights.tokenDrift),
          countFactor(
            "component-misuse",
            routeFindings.filter(isComponentMisuseFinding).length,
            weights.componentMisuse,
          ),
          confidenceFactor(routeFindings, weights.lowVerificationConfidence),
        ]);
        const score = clampScore(100 - penalties.reduce((total, factor) => total + factor.penalty, 0));

        return {
          route,
          score,
          findingCount: routeFindings.length,
          severity,
          averageConfidence: average(routeFindings.map((finding) => finding.confidence)),
          penalties,
        };
      })
      .sort((a, b) => a.score - b.score || a.route.localeCompare(b.route));
  }

  private executionScore(
    metrics: readonly MonitoringExecutionMetric[],
    weights: GovernanceScoringWeights,
  ): GovernanceExecutionScore {
    const failedStageCount = metrics.filter((metric) => metric.status === "failed").length;
    const retryCount = metrics.reduce((total, metric) => total + Math.max(0, metric.attempts - 1), 0);
    const totalDurationMs = metrics.reduce((total, metric) => total + metric.durationMs, 0);
    const penalties = compactFactors([
      countFactor("execution-stability", failedStageCount, weights.failedExecutionStage),
      countFactor("execution-stability", retryCount, weights.retryAttempt),
    ]);

    return {
      score: metrics.length === 0 ? 100 : clampScore(100 - penalties.reduce((total, factor) => total + factor.penalty, 0)),
      stageCount: metrics.length,
      failedStageCount,
      retryCount,
      totalDurationMs,
      penalties,
    };
  }

  private historicalTrend(
    history: readonly MemoryExecutionSnapshot[],
    driftAnalysis: DriftAnalysisReport | undefined,
    weights: GovernanceScoringWeights,
  ): GovernanceHistoricalTrendScore {
    const scores = [...history]
      .sort((a, b) => a.metadata.startedAt.localeCompare(b.metadata.startedAt))
      .map((snapshot) => snapshot.metadata.governanceScore)
      .filter((score): score is number => score !== undefined);
    const currentScore = scores.at(-1);
    const previousScore = scores.at(-2);
    const delta = currentScore !== undefined && previousScore !== undefined ? currentScore - previousScore : undefined;
    const degradationPenalty =
      (driftAnalysis?.governanceScoreDegradation.degradationAmount ?? Math.max(0, -(delta ?? 0))) *
        weights.scoreDegradationPoint +
      (driftAnalysis?.overallDriftScore ?? 0) * weights.driftScoreMultiplier;
    const score = currentScore === undefined ? 100 : clampScore(currentScore - degradationPenalty);

    return {
      score,
      direction: directionForDelta(delta),
      ...(currentScore === undefined ? {} : { currentScore }),
      ...(previousScore === undefined ? {} : { previousScore }),
      ...(delta === undefined ? {} : { delta }),
      degradationPenalty: Math.round(degradationPenalty),
    };
  }
}

export function severityDistribution(findings: readonly VerifiedFinding[]): GovernanceSeverityDistribution {
  return {
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
    total: findings.length,
  };
}

export function isAccessibilityFinding(finding: VerifiedFinding): boolean {
  return includesAny(finding, ["accessib", "aria", "label", "contrast", "keyboard", "focus"]);
}

export function isTokenDriftFinding(finding: VerifiedFinding): boolean {
  return includesAny(finding, ["token", "color.", "spacing.", "typography.", "radius.", "shadow."]);
}

export function isComponentMisuseFinding(finding: VerifiedFinding): boolean {
  return includesAny(finding, ["component", "contract", "unauthorized", "approved design-system"]);
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function severityFactor(
  factor: GovernanceScoreFactor["factor"],
  count: number,
  weight: number,
): GovernanceScoreFactor | undefined {
  return countFactor(factor, count, weight);
}

function countFactor(
  factor: GovernanceScoreFactor["factor"],
  count: number,
  weight: number,
): GovernanceScoreFactor | undefined {
  if (count <= 0) {
    return undefined;
  }
  return {
    factor,
    count,
    penalty: Math.round(count * weight),
  };
}

function confidenceFactor(
  findings: readonly VerifiedFinding[],
  weight: number,
): GovernanceScoreFactor | undefined {
  const lowConfidenceCount = findings.filter((finding) => finding.confidence < 0.75).length;
  return countFactor("verification-confidence", lowConfidenceCount, weight);
}

function historicalPenaltyFactor(
  driftAnalysis: DriftAnalysisReport | undefined,
  weights: GovernanceScoringWeights,
): GovernanceScoreFactor | undefined {
  if (!driftAnalysis) {
    return undefined;
  }
  const degradationPenalty =
    driftAnalysis.governanceScoreDegradation.degradationAmount * weights.scoreDegradationPoint +
    driftAnalysis.overallDriftScore * weights.driftScoreMultiplier;
  if (degradationPenalty <= 0) {
    return undefined;
  }
  return {
    factor: "historical-degradation",
    count: 1,
    penalty: Math.round(degradationPenalty),
  };
}

function compactFactors(
  factors: readonly (GovernanceScoreFactor | undefined)[],
): readonly GovernanceScoreFactor[] {
  return factors.filter((factor): factor is GovernanceScoreFactor => factor !== undefined && factor.penalty > 0);
}

function includesAny(finding: VerifiedFinding, needles: readonly string[]): boolean {
  const haystack = [
    finding.id,
    finding.originalFindingId,
    finding.component,
    finding.expected,
    finding.actual,
    ...finding.reasons,
  ]
    .join(" ")
    .toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function groupBy<T>(items: readonly T[], keyFor: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFor(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  return Number((values.reduce((total, value) => total + value, 0) / values.length).toFixed(2));
}

function directionForDelta(delta: number | undefined): GovernanceHistoricalTrendScore["direction"] {
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

function statusForScore(score: number): GovernanceScore["status"] {
  if (score >= 95) {
    return "excellent";
  }
  if (score >= 85) {
    return "good";
  }
  if (score >= 70) {
    return "watch";
  }
  if (score >= 40) {
    return "degraded";
  }
  return "critical";
}
