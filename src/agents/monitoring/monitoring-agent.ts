import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type { SeverityLevel } from "../../shared/types/severity.js";
import type { DriftAnalysisReport, MemoryExecutionSnapshot } from "../memory/types.js";

export interface MonitoringExecutionMetric {
  readonly stage: string;
  readonly status: "passed" | "failed";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly attempts: number;
  readonly errorMessage?: string | undefined;
}

export interface MonitoringAgentRequest {
  readonly historicalExecutions: readonly MemoryExecutionSnapshot[];
  readonly executionMetrics: readonly MonitoringExecutionMetric[];
  readonly driftAnalysis?: DriftAnalysisReport | undefined;
  readonly generatedAt?: string | undefined;
}

export interface SeverityDistribution {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly total: number;
}

export interface GovernanceHealthScore {
  readonly score: number;
  readonly status: MonitoringHealthStatus;
  readonly averageGovernanceScore?: number | undefined;
  readonly latestGovernanceScore?: number | undefined;
  readonly degradationPenalty: number;
  readonly severityPenalty: number;
  readonly driftPenalty: number;
}

export interface ExecutionReliabilityScore {
  readonly score: number;
  readonly status: MonitoringHealthStatus;
  readonly stageCount: number;
  readonly passedStageCount: number;
  readonly failedStageCount: number;
  readonly passRate: number;
  readonly retryCount: number;
  readonly totalDurationMs: number;
}

export interface RouteHealthMonitoring {
  readonly route: string;
  readonly executionCount: number;
  readonly latestRunId: string;
  readonly latestStartedAt: string;
  readonly status: MonitoringHealthStatus;
  readonly healthScore: number;
  readonly averageGovernanceScore?: number | undefined;
  readonly latestGovernanceScore?: number | undefined;
  readonly severityDistribution: SeverityDistribution;
  readonly activeFindingCount: number;
  readonly driftScore?: number | undefined;
}

export interface OperationalTrendSummary {
  readonly category: "governance-score" | "findings" | "drift" | "execution-reliability";
  readonly direction: "improving" | "regressing" | "stable" | "insufficient-data";
  readonly summary: string;
  readonly currentValue?: number | undefined;
  readonly previousValue?: number | undefined;
  readonly delta?: number | undefined;
}

export interface MonitoringSnapshot {
  readonly runId: string;
  readonly route: string;
  readonly startedAt: string;
  readonly status?: "passed" | "failed" | undefined;
  readonly governanceScore?: number | undefined;
  readonly findingCount: number;
  readonly severityDistribution: SeverityDistribution;
}

export interface MonitoringInsights {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly monitoredExecutionCount: number;
  readonly governanceHealth: GovernanceHealthScore;
  readonly executionReliability: ExecutionReliabilityScore;
  readonly severityDistribution: SeverityDistribution;
  readonly routeHealth: readonly RouteHealthMonitoring[];
  readonly operationalTrends: readonly OperationalTrendSummary[];
  readonly monitoringSnapshots: readonly MonitoringSnapshot[];
  readonly observabilitySignals: readonly string[];
}

export type MonitoringHealthStatus = "healthy" | "watch" | "degraded" | "critical" | "insufficient-data";

export interface MonitoringAgentDependencies {
  readonly logger?: OperationalLogger | undefined;
}

const severityWeight: Record<SeverityLevel, number> = {
  critical: 12,
  warning: 4,
  info: 1,
};

export class MonitoringAgent {
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: MonitoringAgentDependencies = {}) {
    this.logger = dependencies.logger ?? createAgentLogger("MonitoringAgent");
  }

  monitor(request: MonitoringAgentRequest): MonitoringInsights {
    const generatedAt = request.generatedAt ?? new Date().toISOString();
    const trace = this.logger.start("monitoring.analysis", {
      correlationId: `monitoring:${generatedAt}`,
      metadata: {
        executionCount: request.historicalExecutions.length,
        metricCount: request.executionMetrics.length,
        hasDriftAnalysis: request.driftAnalysis !== undefined,
      },
    });

    try {
      const snapshots = sortSnapshots(request.historicalExecutions).map(toMonitoringSnapshot);
      const severityDistribution = aggregateSeverity(snapshots.map((snapshot) => snapshot.severityDistribution));
      const governanceHealth = this.governanceHealth(snapshots, severityDistribution, request.driftAnalysis);
      const executionReliability = this.executionReliability(request.executionMetrics);
      const routeHealth = this.routeHealth(snapshots, request.driftAnalysis);
      const operationalTrends = this.operationalTrends(snapshots, request.driftAnalysis, executionReliability);
      const observabilitySignals = this.observabilitySignals({
        governanceHealth,
        executionReliability,
        severityDistribution,
        routeHealth,
        driftAnalysis: request.driftAnalysis,
      });

      this.logger.complete(trace, {
        monitoredExecutionCount: snapshots.length,
        governanceHealthScore: governanceHealth.score,
        executionReliabilityScore: executionReliability.score,
      });

      return {
        reportId: `monitoring:${generatedAt}`,
        generatedAt,
        monitoredExecutionCount: snapshots.length,
        governanceHealth,
        executionReliability,
        severityDistribution,
        routeHealth,
        operationalTrends,
        monitoringSnapshots: snapshots,
        observabilitySignals,
      };
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }

  private governanceHealth(
    snapshots: readonly MonitoringSnapshot[],
    severityDistribution: SeverityDistribution,
    driftAnalysis: DriftAnalysisReport | undefined,
  ): GovernanceHealthScore {
    const scores = snapshots
      .map((snapshot) => snapshot.governanceScore)
      .filter((score): score is number => score !== undefined);
    const averageGovernanceScore = average(scores);
    const latestGovernanceScore = scores.at(-1);
    const baselineScore = latestGovernanceScore ?? averageGovernanceScore ?? 0;
    const degradationPenalty = driftAnalysis?.governanceScoreDegradation.degradationAmount ?? 0;
    const severityPenalty =
      severityDistribution.critical * severityWeight.critical +
      severityDistribution.warning * severityWeight.warning +
      severityDistribution.info * severityWeight.info;
    const driftPenalty = Math.round((driftAnalysis?.overallDriftScore ?? 0) * 0.25);
    const score =
      snapshots.length === 0 ? 0 : clamp(Math.round(baselineScore - degradationPenalty - severityPenalty - driftPenalty));

    return {
      score,
      status: snapshots.length === 0 ? "insufficient-data" : statusForScore(score),
      ...(averageGovernanceScore === undefined ? {} : { averageGovernanceScore }),
      ...(latestGovernanceScore === undefined ? {} : { latestGovernanceScore }),
      degradationPenalty,
      severityPenalty,
      driftPenalty,
    };
  }

  private executionReliability(metrics: readonly MonitoringExecutionMetric[]): ExecutionReliabilityScore {
    const stageCount = metrics.length;
    const passedStageCount = metrics.filter((metric) => metric.status === "passed").length;
    const failedStageCount = stageCount - passedStageCount;
    const retryCount = metrics.reduce((total, metric) => total + Math.max(0, metric.attempts - 1), 0);
    const totalDurationMs = metrics.reduce((total, metric) => total + metric.durationMs, 0);
    const passRate = stageCount === 0 ? 0 : passedStageCount / stageCount;
    const retryPenalty = retryCount * 6;
    const score = stageCount === 0 ? 0 : clamp(Math.round(passRate * 100 - retryPenalty));

    return {
      score,
      status: stageCount === 0 ? "insufficient-data" : statusForScore(score),
      stageCount,
      passedStageCount,
      failedStageCount,
      passRate,
      retryCount,
      totalDurationMs,
    };
  }

  private routeHealth(
    snapshots: readonly MonitoringSnapshot[],
    driftAnalysis: DriftAnalysisReport | undefined,
  ): readonly RouteHealthMonitoring[] {
    const driftByRoute = new Map(driftAnalysis?.routeDrift.map((drift) => [drift.route, drift.driftScore]) ?? []);
    const grouped = groupBy(snapshots, (snapshot) => snapshot.route);

    return [...grouped.entries()]
      .map(([route, routeSnapshots]) => {
        const sorted = [...routeSnapshots].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        const latest = sorted.at(-1);
        if (!latest) {
          throw new Error(`Cannot monitor empty route group: ${route}`);
        }

        const scores = sorted
          .map((snapshot) => snapshot.governanceScore)
          .filter((score): score is number => score !== undefined);
        const averageGovernanceScore = average(scores);
        const latestGovernanceScore = latest.governanceScore;
        const severityDistribution = aggregateSeverity(sorted.map((snapshot) => snapshot.severityDistribution));
        const driftScore = driftByRoute.get(route);
        const healthScore = clamp(
          Math.round(
            (latestGovernanceScore ?? averageGovernanceScore ?? 0) -
              severityDistribution.critical * 10 -
              severityDistribution.warning * 3 -
              (driftScore ?? 0) * 0.2,
          ),
        );

        return {
          route,
          executionCount: sorted.length,
          latestRunId: latest.runId,
          latestStartedAt: latest.startedAt,
          status: statusForScore(healthScore),
          healthScore,
          ...(averageGovernanceScore === undefined ? {} : { averageGovernanceScore }),
          ...(latestGovernanceScore === undefined ? {} : { latestGovernanceScore }),
          severityDistribution,
          activeFindingCount: severityDistribution.total,
          ...(driftScore === undefined ? {} : { driftScore }),
        };
      })
      .sort((a, b) => a.healthScore - b.healthScore || a.route.localeCompare(b.route));
  }

  private operationalTrends(
    snapshots: readonly MonitoringSnapshot[],
    driftAnalysis: DriftAnalysisReport | undefined,
    executionReliability: ExecutionReliabilityScore,
  ): readonly OperationalTrendSummary[] {
    const scores = snapshots
      .map((snapshot) => snapshot.governanceScore)
      .filter((score): score is number => score !== undefined);
    const findingCounts = snapshots.map((snapshot) => snapshot.findingCount);
    const scoreTrend = numericTrend(scores, true);
    const findingTrend = numericTrend(findingCounts, false);
    const driftDirection = driftAnalysis
      ? driftAnalysis.overallDriftScore > 0
        ? "regressing"
        : "stable"
      : "insufficient-data";

    return [
      {
        category: "governance-score",
        ...scoreTrend,
        summary: trendSummary("Governance score", scoreTrend),
      },
      {
        category: "findings",
        ...findingTrend,
        summary: trendSummary("Finding volume", findingTrend),
      },
      {
        category: "drift",
        direction: driftDirection,
        summary:
          driftAnalysis === undefined
            ? "Drift analysis is not available."
            : `Overall drift score is ${driftAnalysis.overallDriftScore}.`,
        ...(driftAnalysis === undefined ? {} : { currentValue: driftAnalysis.overallDriftScore }),
      },
      {
        category: "execution-reliability",
        direction:
          executionReliability.status === "insufficient-data"
            ? "insufficient-data"
            : executionReliability.failedStageCount > 0 || executionReliability.retryCount > 0
              ? "regressing"
              : "stable",
        summary: `Execution reliability score is ${executionReliability.score}.`,
        currentValue: executionReliability.score,
      },
    ];
  }

  private observabilitySignals(input: {
    readonly governanceHealth: GovernanceHealthScore;
    readonly executionReliability: ExecutionReliabilityScore;
    readonly severityDistribution: SeverityDistribution;
    readonly routeHealth: readonly RouteHealthMonitoring[];
    readonly driftAnalysis?: DriftAnalysisReport | undefined;
  }): readonly string[] {
    const signals: string[] = [];

    if (input.governanceHealth.status === "critical" || input.governanceHealth.status === "degraded") {
      signals.push(`governance health is ${input.governanceHealth.status}`);
    }
    if (input.executionReliability.failedStageCount > 0) {
      signals.push(`${input.executionReliability.failedStageCount} execution stage(s) failed`);
    }
    if (input.executionReliability.retryCount > 0) {
      signals.push(`${input.executionReliability.retryCount} retry attempt(s) observed`);
    }
    if (input.severityDistribution.critical > 0) {
      signals.push(`${input.severityDistribution.critical} critical finding(s) active`);
    }
    if (input.driftAnalysis?.governanceScoreDegradation.degraded) {
      signals.push(
        `governance score degraded by ${input.driftAnalysis.governanceScoreDegradation.degradationAmount} point(s)`,
      );
    }

    const weakestRoute = input.routeHealth[0];
    if (weakestRoute && (weakestRoute.status === "critical" || weakestRoute.status === "degraded")) {
      signals.push(`${weakestRoute.route} route health is ${weakestRoute.status}`);
    }

    return [...new Set(signals)].sort();
  }
}

function toMonitoringSnapshot(snapshot: MemoryExecutionSnapshot): MonitoringSnapshot {
  const severityDistribution = severityForSnapshot(snapshot);
  return {
    runId: snapshot.metadata.runId,
    route: snapshot.metadata.route,
    startedAt: snapshot.metadata.startedAt,
    ...(snapshot.metadata.status === undefined ? {} : { status: snapshot.metadata.status }),
    ...(snapshot.metadata.governanceScore === undefined ? {} : { governanceScore: snapshot.metadata.governanceScore }),
    findingCount: severityDistribution.total,
    severityDistribution,
  };
}

function severityForSnapshot(snapshot: MemoryExecutionSnapshot): SeverityDistribution {
  const activeFindings = snapshot.verifiedFindings.filter((finding) => finding.status !== "rejected");
  return {
    critical: activeFindings.filter((finding) => finding.severity === "critical").length,
    warning: activeFindings.filter((finding) => finding.severity === "warning").length,
    info: activeFindings.filter((finding) => finding.severity === "info").length,
    total: activeFindings.length,
  };
}

function aggregateSeverity(distributions: readonly SeverityDistribution[]): SeverityDistribution {
  return distributions.reduce(
    (total, distribution) => ({
      critical: total.critical + distribution.critical,
      warning: total.warning + distribution.warning,
      info: total.info + distribution.info,
      total: total.total + distribution.total,
    }),
    { critical: 0, warning: 0, info: 0, total: 0 },
  );
}

function sortSnapshots(snapshots: readonly MemoryExecutionSnapshot[]): readonly MemoryExecutionSnapshot[] {
  return [...snapshots].sort((a, b) => a.metadata.startedAt.localeCompare(b.metadata.startedAt));
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
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function numericTrend(
  values: readonly number[],
  higherIsBetter: boolean,
): Omit<OperationalTrendSummary, "category" | "summary"> {
  if (values.length < 2) {
    return { direction: "insufficient-data" };
  }

  const previousValue = values.at(-2)!;
  const currentValue = values.at(-1)!;
  const delta = currentValue - previousValue;
  const normalizedDelta = higherIsBetter ? delta : -delta;
  const direction = normalizedDelta > 0 ? "improving" : normalizedDelta < 0 ? "regressing" : "stable";
  return {
    direction,
    currentValue,
    previousValue,
    delta,
  };
}

function trendSummary(label: string, trend: Omit<OperationalTrendSummary, "category" | "summary">): string {
  if (trend.direction === "insufficient-data") {
    return `${label} has insufficient history.`;
  }
  if (trend.delta === 0) {
    return `${label} is stable.`;
  }
  return `${label} changed by ${trend.delta}.`;
}

function statusForScore(score: number): MonitoringHealthStatus {
  if (score >= 85) {
    return "healthy";
  }
  if (score >= 70) {
    return "watch";
  }
  if (score >= 40) {
    return "degraded";
  }
  return "critical";
}

function clamp(score: number): number {
  return Math.max(0, Math.min(100, score));
}
