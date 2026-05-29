import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { SeverityLevel } from "../../shared/types/severity.js";
import {
  activeFindings,
  calculateTrend,
  clampScore,
  isAccessibilityFinding,
  isTokenFinding,
  scoreTrend,
  tokenNamesForFinding,
} from "./drift-utils.js";
import type {
  AccessibilityDriftInsight,
  ComponentDriftInsight,
  DriftAnalysisReport,
  DriftExecutionPoint,
  DriftTrend,
  ExecutionMetadata,
  HistoricalMemoryRepository,
  MemoryExecutionSnapshot,
  RouteDriftInsight,
  TokenDriftEvolution,
} from "./types.js";

export interface RuntimeDriftIntelligenceRequest {
  readonly verifiedFindings: readonly VerifiedFinding[];
  readonly executionMetadata: ExecutionMetadata;
  readonly historyLimit?: number | undefined;
}

const severityRank: Record<SeverityLevel, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export class RuntimeDriftIntelligenceEngine {
  constructor(private readonly repository: HistoricalMemoryRepository) {}

  async analyze(request: RuntimeDriftIntelligenceRequest): Promise<DriftAnalysisReport> {
    const currentSnapshot: MemoryExecutionSnapshot = {
      metadata: request.executionMetadata,
      verifiedFindings: request.verifiedFindings,
    };

    await this.repository.saveExecutionSnapshot(currentSnapshot);
    const historicalSnapshots = await this.repository.listExecutionSnapshots({ limit: request.historyLimit ?? 50 });
    const historyWithoutCurrent = historicalSnapshots.filter(
      (snapshot) => snapshot.metadata.runId !== request.executionMetadata.runId,
    );
    const timeline = [...historyWithoutCurrent, currentSnapshot].sort((a, b) =>
      a.metadata.startedAt.localeCompare(b.metadata.startedAt),
    );
    const executionTimeline = timeline.map((snapshot) => this.executionPoint(snapshot));
    const governanceScoreDegradation = this.governanceScoreDegradation(timeline);
    const routeDrift = this.routeDrift(timeline);
    const componentDrift = this.componentDrift(timeline);
    const tokenDriftEvolution = this.tokenDriftEvolution(timeline);
    const accessibilityDrift = this.accessibilityDrift(timeline);
    const degradationIndicators = [
      ...governanceScoreDegradationIndicators(governanceScoreDegradation),
      ...routeDrift.flatMap((drift) => drift.degradationIndicators),
      ...componentDrift.flatMap((drift) => drift.degradationIndicators),
      ...tokenDriftEvolution.flatMap((drift) => drift.degradationIndicators),
      ...accessibilityDrift.flatMap((drift) => drift.degradationIndicators),
    ];

    return {
      reportId: `drift:${request.executionMetadata.runId}`,
      runId: request.executionMetadata.runId,
      generatedAt: new Date().toISOString(),
      analyzedExecutionCount: timeline.length,
      overallDriftScore: this.overallDriftScore([
        governanceScoreDegradation.degradationAmount,
        ...routeDrift.map((drift) => drift.driftScore),
        ...componentDrift.map((drift) => drift.driftScore),
        ...tokenDriftEvolution.map((drift) => drift.driftScore),
        ...accessibilityDrift.map((drift) => drift.driftScore),
      ]),
      governanceScoreDegradation,
      executionTimeline,
      routeDrift,
      componentDrift,
      tokenDriftEvolution,
      accessibilityDrift,
      degradationIndicators: [...new Set(degradationIndicators)].sort(),
    };
  }

  private executionPoint(snapshot: MemoryExecutionSnapshot): DriftExecutionPoint {
    const findings = activeFindings(snapshot);
    return {
      runId: snapshot.metadata.runId,
      route: snapshot.metadata.route,
      startedAt: snapshot.metadata.startedAt,
      ...(snapshot.metadata.governanceScore === undefined ? {} : { governanceScore: snapshot.metadata.governanceScore }),
      violationCount: findings.length,
      accessibilityViolationCount: findings.filter(isAccessibilityFinding).length,
      tokenViolationCount: findings.filter(isTokenFinding).length,
      severity: {
        critical: findings.filter((finding) => finding.severity === "critical").length,
        warning: findings.filter((finding) => finding.severity === "warning").length,
        info: findings.filter((finding) => finding.severity === "info").length,
      },
    };
  }

  private governanceScoreDegradation(
    timeline: readonly MemoryExecutionSnapshot[],
  ): DriftAnalysisReport["governanceScoreDegradation"] {
    const scores = timeline
      .map((snapshot) => snapshot.metadata.governanceScore)
      .filter((score): score is number => score !== undefined);
    const trend = scoreTrend(scores);
    const degradationAmount = Math.max(0, -(trend.deltaFromBaseline ?? 0));
    return {
      trend,
      degraded: degradationAmount > 0,
      degradationAmount,
    };
  }

  private routeDrift(timeline: readonly MemoryExecutionSnapshot[]): readonly RouteDriftInsight[] {
    const grouped = groupBy(timeline, (snapshot) => snapshot.metadata.route);
    return [...grouped.entries()]
      .map(([route, snapshots]) => {
        const sorted = sortSnapshots(snapshots);
        const violationTrend = calculateTrend(sorted.map((snapshot) => activeFindings(snapshot).length));
        const scoreValues = sorted
          .map((snapshot) => snapshot.metadata.governanceScore)
          .filter((score): score is number => score !== undefined);
        const routeScoreTrend = scoreTrend(scoreValues);
        const degradationIndicators = routeIndicators(route, violationTrend, routeScoreTrend);
        return {
          route,
          executionCount: sorted.length,
          violationTrend,
          scoreTrend: routeScoreTrend,
          driftScore: driftScore(violationTrend, routeScoreTrend, 10),
          degradationIndicators,
        };
      })
      .filter((drift) => drift.executionCount > 1 || drift.driftScore > 0)
      .sort((a, b) => b.driftScore - a.driftScore || a.route.localeCompare(b.route));
  }

  private componentDrift(timeline: readonly MemoryExecutionSnapshot[]): readonly ComponentDriftInsight[] {
    const components = new Set(activeFindingsFromTimeline(timeline).map((finding) => finding.component));
    return [...components]
      .map((component) => {
        const counts = sortSnapshots(timeline).map(
          (snapshot) => activeFindings(snapshot).filter((finding) => finding.component === component).length,
        );
        const findings = activeFindingsFromTimeline(timeline).filter((finding) => finding.component === component);
        const latestSeverity = highestSeverity(findings.map((finding) => finding.severity));
        const trend = calculateTrend(counts);
        const degradationIndicators = componentIndicators(component, trend, latestSeverity);
        return {
          component,
          affectedRoutes: [...new Set(findings.map((finding) => finding.route))].sort(),
          violationTrend: trend,
          latestSeverity,
          driftScore: driftScore(trend, undefined, severityRank[latestSeverity] * 8),
          degradationIndicators,
        };
      })
      .filter((drift) => drift.violationTrend.currentValue !== 0)
      .sort((a, b) => b.driftScore - a.driftScore || a.component.localeCompare(b.component));
  }

  private tokenDriftEvolution(timeline: readonly MemoryExecutionSnapshot[]): readonly TokenDriftEvolution[] {
    const tokenNames = new Set(activeFindingsFromTimeline(timeline).flatMap(tokenNamesForFinding));
    return [...tokenNames]
      .map((tokenName) => {
        const sorted = sortSnapshots(timeline);
        const counts = sorted.map((snapshot) => {
          return activeFindings(snapshot).filter((finding) => tokenNamesForFinding(finding).includes(tokenName)).length;
        });
        const findings = activeFindingsFromTimeline(timeline).filter((finding) =>
          tokenNamesForFinding(finding).includes(tokenName),
        );
        const trend = calculateTrend(counts);
        const degradationIndicators = tokenIndicators(tokenName, trend);
        return {
          tokenName,
          affectedComponents: [...new Set(findings.map((finding) => finding.component))].sort(),
          occurrenceTrend: trend,
          driftScore: driftScore(trend, undefined, 6),
          degradationIndicators,
        };
      })
      .filter((drift) => drift.occurrenceTrend.currentValue !== 0)
      .sort((a, b) => b.driftScore - a.driftScore || a.tokenName.localeCompare(b.tokenName));
  }

  private accessibilityDrift(timeline: readonly MemoryExecutionSnapshot[]): readonly AccessibilityDriftInsight[] {
    const routes = new Set(timeline.map((snapshot) => snapshot.metadata.route));
    return [...routes]
      .map((route) => {
        const sorted = sortSnapshots(timeline.filter((snapshot) => snapshot.metadata.route === route));
        const counts = sorted.map((snapshot) => activeFindings(snapshot).filter(isAccessibilityFinding).length);
        const routeFindings = sorted.flatMap((snapshot) => activeFindings(snapshot).filter(isAccessibilityFinding));
        const trend = calculateTrend(counts);
        const degradationIndicators = accessibilityIndicators(route, trend);
        return {
          route,
          violationTrend: trend,
          affectedComponents: [...new Set(routeFindings.map((finding) => finding.component))].sort(),
          driftScore: driftScore(trend, undefined, 12),
          degradationIndicators,
        };
      })
      .filter((drift) => drift.violationTrend.currentValue !== 0)
      .sort((a, b) => b.driftScore - a.driftScore || a.route.localeCompare(b.route));
  }

  private overallDriftScore(scores: readonly number[]): number {
    if (scores.length === 0) {
      return 0;
    }

    const topScores = [...scores].sort((a, b) => b - a).slice(0, 5);
    return clampScore(topScores.reduce((total, score) => total + score, 0) / topScores.length);
  }
}

function driftScore(violationTrend: DriftTrend, scoreDegradationTrend: DriftTrend | undefined, baseWeight: number): number {
  const violationIncrease = Math.max(0, violationTrend.deltaFromBaseline ?? 0) + Math.max(0, violationTrend.deltaFromPrevious ?? 0);
  const scoreDegradation =
    scoreDegradationTrend === undefined
      ? 0
      : Math.max(0, -(scoreDegradationTrend.deltaFromBaseline ?? 0)) +
        Math.max(0, -(scoreDegradationTrend.deltaFromPrevious ?? 0));

  return clampScore(violationIncrease * baseWeight + scoreDegradation * 2);
}

function governanceScoreDegradationIndicators(
  degradation: DriftAnalysisReport["governanceScoreDegradation"],
): readonly string[] {
  return degradation.degraded ? [`governance score degraded by ${degradation.degradationAmount} points`] : [];
}

function routeIndicators(route: string, violationTrend: DriftTrend, routeScoreTrend: DriftTrend): readonly string[] {
  const indicators: string[] = [];
  if ((violationTrend.deltaFromBaseline ?? 0) > 0) {
    indicators.push(`${route} violations increased by ${violationTrend.deltaFromBaseline}`);
  }
  if ((routeScoreTrend.deltaFromBaseline ?? 0) < 0) {
    indicators.push(`${route} governance score degraded by ${Math.abs(routeScoreTrend.deltaFromBaseline ?? 0)} points`);
  }
  return indicators;
}

function componentIndicators(component: string, trend: DriftTrend, severity: SeverityLevel): readonly string[] {
  if ((trend.deltaFromBaseline ?? 0) <= 0) {
    return [];
  }
  return [`${component} ${severity} failures increased by ${trend.deltaFromBaseline}`];
}

function tokenIndicators(tokenName: string, trend: DriftTrend): readonly string[] {
  if ((trend.deltaFromBaseline ?? 0) <= 0) {
    return [];
  }
  return [`${tokenName} token drift increased by ${trend.deltaFromBaseline}`];
}

function accessibilityIndicators(route: string, trend: DriftTrend): readonly string[] {
  if ((trend.deltaFromBaseline ?? 0) <= 0) {
    return [];
  }
  return [`${route} accessibility drift increased by ${trend.deltaFromBaseline}`];
}

function activeFindingsFromTimeline(timeline: readonly MemoryExecutionSnapshot[]): readonly VerifiedFinding[] {
  return timeline.flatMap(activeFindings);
}

function highestSeverity(severities: readonly SeverityLevel[]): SeverityLevel {
  return severities.reduce<SeverityLevel>((highest, severity) => {
    return severityRank[severity] > severityRank[highest] ? severity : highest;
  }, "info");
}

function groupBy<T>(items: readonly T[], keyForItem: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = keyForItem(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function sortSnapshots(snapshots: readonly MemoryExecutionSnapshot[]): readonly MemoryExecutionSnapshot[] {
  return [...snapshots].sort((a, b) => a.metadata.startedAt.localeCompare(b.metadata.startedAt));
}
