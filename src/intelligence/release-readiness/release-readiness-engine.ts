import type { MonitoringInsights, MonitoringHealthStatus } from "../../agents/monitoring/index.js";
import type { DriftAnalysisReport } from "../../agents/memory/types.js";
import type { GovernanceScore } from "../../governance/scoring/index.js";
import type { PrioritizedRemediationItem, PrioritizedRemediationPlan } from "../prioritization/index.js";

export type ReleaseReadinessDecision = "go" | "conditional-go" | "no-go";

export interface ReleaseReadinessThresholds {
  readonly minimumGovernanceScore: number;
  readonly minimumGovernanceConfidenceScore: number;
  readonly maximumReleaseRiskScore: number;
  readonly maximumCriticalBlockingFindings: number;
  readonly maximumHighBlockingFindings: number;
  readonly maximumDriftScore: number;
  readonly minimumExecutionReliabilityScore: number;
  readonly blockOnCriticalGovernanceStatus: boolean;
  readonly blockOnRegressingTrend: boolean;
}

export const defaultReleaseReadinessThresholds: ReleaseReadinessThresholds = {
  minimumGovernanceScore: 75,
  minimumGovernanceConfidenceScore: 70,
  maximumReleaseRiskScore: 55,
  maximumCriticalBlockingFindings: 0,
  maximumHighBlockingFindings: 3,
  maximumDriftScore: 45,
  minimumExecutionReliabilityScore: 80,
  blockOnCriticalGovernanceStatus: true,
  blockOnRegressingTrend: false,
};

export interface ReleaseBlockingFinding {
  readonly findingId: string;
  readonly rank: number;
  readonly severity: PrioritizedRemediationItem["severity"];
  readonly priority: PrioritizedRemediationItem["priority"];
  readonly score: number;
  readonly component: string;
  readonly route: string;
  readonly reason: string;
}

export interface ReleaseReadinessTrendAnalysis {
  readonly governanceTrend: GovernanceScore["historicalTrend"]["direction"];
  readonly driftTrend: DriftAnalysisReport["governanceScoreDegradation"]["trend"]["direction"];
  readonly monitoringTrend: "improving" | "regressing" | "stable" | "insufficient-data";
  readonly degraded: boolean;
  readonly reasons: readonly string[];
}

export interface ReleaseReadinessReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly decision: ReleaseReadinessDecision;
  readonly releaseRiskScore: number;
  readonly governanceConfidenceScore: number;
  readonly blockingFindings: readonly ReleaseBlockingFinding[];
  readonly trendAnalysis: ReleaseReadinessTrendAnalysis;
  readonly thresholds: ReleaseReadinessThresholds;
  readonly reasoning: readonly string[];
  readonly evidence: {
    readonly governanceStatus: GovernanceScore["status"];
    readonly governanceScore: number;
    readonly driftScore: number;
    readonly monitoringHealthStatus: MonitoringHealthStatus;
    readonly executionReliabilityScore: number;
    readonly prioritizedPlanId: string;
  };
}

export interface ReleaseReadinessInput {
  readonly governanceScore: GovernanceScore;
  readonly driftAnalysis: DriftAnalysisReport;
  readonly monitoringInsights: MonitoringInsights;
  readonly prioritizedRemediationPlan: PrioritizedRemediationPlan;
  readonly thresholds?: Partial<ReleaseReadinessThresholds> | undefined;
  readonly generatedAt?: string | undefined;
}

export class ReleaseReadinessEngine {
  evaluate(input: ReleaseReadinessInput): ReleaseReadinessReport {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const thresholds = { ...defaultReleaseReadinessThresholds, ...(input.thresholds ?? {}) };
    const blockingFindings = blockingFindingsFor(input.prioritizedRemediationPlan, thresholds);
    const trendAnalysis = trendAnalysisFor(input.governanceScore, input.driftAnalysis, input.monitoringInsights);
    const releaseRiskScore = releaseRiskScoreFor(input, blockingFindings, trendAnalysis);
    const governanceConfidenceScore = governanceConfidenceScoreFor(input);
    const reasoning = reasoningFor({
      input,
      thresholds,
      blockingFindings,
      trendAnalysis,
      releaseRiskScore,
      governanceConfidenceScore,
    });
    const decision = decisionFor({
      input,
      thresholds,
      blockingFindings,
      trendAnalysis,
      releaseRiskScore,
      governanceConfidenceScore,
    });

    return {
      reportId: `release-readiness:${input.prioritizedRemediationPlan.planId}`,
      generatedAt,
      decision,
      releaseRiskScore,
      governanceConfidenceScore,
      blockingFindings,
      trendAnalysis,
      thresholds,
      reasoning,
      evidence: {
        governanceStatus: input.governanceScore.status,
        governanceScore: input.governanceScore.score,
        driftScore: input.driftAnalysis.overallDriftScore,
        monitoringHealthStatus: input.monitoringInsights.governanceHealth.status,
        executionReliabilityScore: input.monitoringInsights.executionReliability.score,
        prioritizedPlanId: input.prioritizedRemediationPlan.planId,
      },
    };
  }
}

function blockingFindingsFor(
  plan: PrioritizedRemediationPlan,
  thresholds: ReleaseReadinessThresholds,
): readonly ReleaseBlockingFinding[] {
  return plan.items
    .filter((item) => item.priority === "critical" || item.priority === "high" || item.score >= thresholds.maximumReleaseRiskScore)
    .map((item) => ({
      findingId: item.findingId,
      rank: item.rank,
      severity: item.severity,
      priority: item.priority,
      score: item.score,
      component: item.component,
      route: item.route,
      reason: blockingReason(item),
    }))
    .sort((left, right) => left.rank - right.rank || right.score - left.score);
}

function releaseRiskScoreFor(
  input: ReleaseReadinessInput,
  blockingFindings: readonly ReleaseBlockingFinding[],
  trendAnalysis: ReleaseReadinessTrendAnalysis,
): number {
  const governanceRisk = 100 - input.governanceScore.score;
  const driftRisk = input.driftAnalysis.overallDriftScore;
  const monitoringRisk = 100 - input.monitoringInsights.governanceHealth.score;
  const reliabilityRisk = 100 - input.monitoringInsights.executionReliability.score;
  const remediationRisk = Math.min(
    100,
    input.prioritizedRemediationPlan.criticalItemCount * 25 +
      input.prioritizedRemediationPlan.highItemCount * 10 +
      blockingFindings.length * 4,
  );
  const trendPenalty = trendAnalysis.degraded ? 10 : 0;

  return clampScore(
    governanceRisk * 0.28 +
      driftRisk * 0.22 +
      monitoringRisk * 0.2 +
      reliabilityRisk * 0.15 +
      remediationRisk * 0.15 +
      trendPenalty,
  );
}

function governanceConfidenceScoreFor(input: ReleaseReadinessInput): number {
  const verificationConfidence =
    input.governanceScore.routeScores.length === 0
      ? 100
      : average(input.governanceScore.routeScores.map((route) => Math.round((route.averageConfidence ?? 1) * 100)));
  const observabilityBonus = Math.min(10, input.monitoringInsights.observabilitySignals.length * 2);
  const trendPenalty = input.governanceScore.historicalTrend.direction === "insufficient-data" ? 12 : 0;
  const driftPenalty = input.driftAnalysis.analyzedExecutionCount < 2 ? 8 : 0;

  return clampScore(
    input.governanceScore.score * 0.45 +
      input.monitoringInsights.executionReliability.score * 0.25 +
      verificationConfidence * 0.2 +
      observabilityBonus -
      trendPenalty -
      driftPenalty,
  );
}

function trendAnalysisFor(
  governanceScore: GovernanceScore,
  driftAnalysis: DriftAnalysisReport,
  monitoringInsights: MonitoringInsights,
): ReleaseReadinessTrendAnalysis {
  const monitoringTrend = monitoringTrendFor(monitoringInsights);
  const reasons = [
    `governance-trend:${governanceScore.historicalTrend.direction}`,
    `drift-trend:${driftAnalysis.governanceScoreDegradation.trend.direction}`,
    `monitoring-trend:${monitoringTrend}`,
    ...(driftAnalysis.governanceScoreDegradation.degraded
      ? [`governance-score-degraded:${driftAnalysis.governanceScoreDegradation.degradationAmount}`]
      : []),
    ...monitoringInsights.operationalTrends
      .filter((trend) => trend.direction === "regressing")
      .map((trend) => `regressing-operational-trend:${trend.category}`),
  ];
  const degraded =
    governanceScore.historicalTrend.direction === "regressing" ||
    driftAnalysis.governanceScoreDegradation.degraded ||
    monitoringTrend === "regressing";

  return {
    governanceTrend: governanceScore.historicalTrend.direction,
    driftTrend: driftAnalysis.governanceScoreDegradation.trend.direction,
    monitoringTrend,
    degraded,
    reasons,
  };
}

function monitoringTrendFor(monitoringInsights: MonitoringInsights): ReleaseReadinessTrendAnalysis["monitoringTrend"] {
  if (monitoringInsights.operationalTrends.some((trend) => trend.direction === "regressing")) {
    return "regressing";
  }
  if (monitoringInsights.operationalTrends.some((trend) => trend.direction === "improving")) {
    return "improving";
  }
  if (monitoringInsights.operationalTrends.some((trend) => trend.direction === "stable")) {
    return "stable";
  }
  return "insufficient-data";
}

function decisionFor(input: {
  readonly input: ReleaseReadinessInput;
  readonly thresholds: ReleaseReadinessThresholds;
  readonly blockingFindings: readonly ReleaseBlockingFinding[];
  readonly trendAnalysis: ReleaseReadinessTrendAnalysis;
  readonly releaseRiskScore: number;
  readonly governanceConfidenceScore: number;
}): ReleaseReadinessDecision {
  const criticalBlockers = input.blockingFindings.filter((finding) => finding.priority === "critical").length;
  const highBlockers = input.blockingFindings.filter((finding) => finding.priority === "high").length;
  const hardBlock =
    input.input.governanceScore.score < input.thresholds.minimumGovernanceScore ||
    input.governanceConfidenceScore < input.thresholds.minimumGovernanceConfidenceScore ||
    input.releaseRiskScore > input.thresholds.maximumReleaseRiskScore ||
    criticalBlockers > input.thresholds.maximumCriticalBlockingFindings ||
    highBlockers > input.thresholds.maximumHighBlockingFindings ||
    input.input.driftAnalysis.overallDriftScore > input.thresholds.maximumDriftScore ||
    input.input.monitoringInsights.executionReliability.score < input.thresholds.minimumExecutionReliabilityScore ||
    (input.thresholds.blockOnCriticalGovernanceStatus && input.input.governanceScore.status === "critical") ||
    (input.thresholds.blockOnRegressingTrend && input.trendAnalysis.degraded);

  if (hardBlock) {
    return "no-go";
  }
  if (input.blockingFindings.length > 0 || input.trendAnalysis.degraded || input.input.governanceScore.status === "watch") {
    return "conditional-go";
  }
  return "go";
}

function reasoningFor(input: {
  readonly input: ReleaseReadinessInput;
  readonly thresholds: ReleaseReadinessThresholds;
  readonly blockingFindings: readonly ReleaseBlockingFinding[];
  readonly trendAnalysis: ReleaseReadinessTrendAnalysis;
  readonly releaseRiskScore: number;
  readonly governanceConfidenceScore: number;
}): readonly string[] {
  const criticalBlockers = input.blockingFindings.filter((finding) => finding.priority === "critical").length;
  const highBlockers = input.blockingFindings.filter((finding) => finding.priority === "high").length;
  return [
    `governance-score:${input.input.governanceScore.score}:minimum:${input.thresholds.minimumGovernanceScore}`,
    `governance-status:${input.input.governanceScore.status}`,
    `release-risk-score:${input.releaseRiskScore}:maximum:${input.thresholds.maximumReleaseRiskScore}`,
    `governance-confidence-score:${input.governanceConfidenceScore}:minimum:${input.thresholds.minimumGovernanceConfidenceScore}`,
    `critical-blockers:${criticalBlockers}:maximum:${input.thresholds.maximumCriticalBlockingFindings}`,
    `high-blockers:${highBlockers}:maximum:${input.thresholds.maximumHighBlockingFindings}`,
    `drift-score:${input.input.driftAnalysis.overallDriftScore}:maximum:${input.thresholds.maximumDriftScore}`,
    `execution-reliability:${input.input.monitoringInsights.executionReliability.score}:minimum:${input.thresholds.minimumExecutionReliabilityScore}`,
    ...input.trendAnalysis.reasons,
  ];
}

function blockingReason(item: PrioritizedRemediationItem): string {
  if (item.priority === "critical") {
    return `Critical remediation item ranked ${item.rank} blocks release readiness.`;
  }
  if (item.priority === "high") {
    return `High-priority remediation item ranked ${item.rank} contributes release risk.`;
  }
  return `Remediation score ${item.score} exceeds release risk threshold.`;
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
