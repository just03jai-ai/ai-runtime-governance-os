import { describe, expect, it } from "vitest";
import type { MonitoringInsights } from "../../src/agents/monitoring/index.js";
import type { DriftAnalysisReport } from "../../src/agents/memory/types.js";
import type { GovernanceScore } from "../../src/governance/scoring/index.js";
import type { PrioritizedRemediationPlan } from "../../src/intelligence/prioritization/index.js";
import { ReleaseReadinessEngine } from "../../src/intelligence/release-readiness/index.js";

describe("ReleaseReadinessEngine", () => {
  it("returns no-go with explainable blocking evidence when thresholds are violated", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const report = new ReleaseReadinessEngine().evaluate({
      governanceScore: governanceScore({ score: 62, status: "degraded", trend: "regressing" }),
      driftAnalysis: driftAnalysis({ driftScore: 58, degraded: true }),
      monitoringInsights: monitoringInsights({ governanceHealthScore: 55, reliabilityScore: 72, trend: "regressing" }),
      prioritizedRemediationPlan: prioritizedPlan(),
      generatedAt,
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "release-readiness:prioritized-remediation:root-cause:test",
        generatedAt,
        decision: "no-go",
        releaseRiskScore: expect.any(Number),
        governanceConfidenceScore: expect.any(Number),
        thresholds: expect.objectContaining({
          minimumGovernanceScore: 75,
          maximumCriticalBlockingFindings: 0,
        }),
        evidence: expect.objectContaining({
          governanceScore: 62,
          driftScore: 58,
          executionReliabilityScore: 72,
          prioritizedPlanId: "prioritized-remediation:root-cause:test",
        }),
      }),
    );
    expect(report.releaseRiskScore).toBeGreaterThan(0);
    expect(report.blockingFindings).toEqual([
      expect.objectContaining({
        findingId: "verified:runtime-a11y:core.accessibility:Button",
        rank: 1,
        priority: "critical",
      }),
      expect.objectContaining({
        findingId: "verified:runtime-token:core.token-drift:Input",
        rank: 2,
        priority: "high",
      }),
    ]);
    expect(report.trendAnalysis).toEqual(
      expect.objectContaining({
        governanceTrend: "regressing",
        driftTrend: "increasing",
        monitoringTrend: "regressing",
        degraded: true,
      }),
    );
    expect(report.reasoning).toEqual(
      expect.arrayContaining([
        "governance-score:62:minimum:75",
        "critical-blockers:1:maximum:0",
        "drift-score:58:maximum:45",
        "execution-reliability:72:minimum:80",
        "governance-trend:regressing",
      ]),
    );
  });

  it("supports configurable thresholds for conditional release readiness", () => {
    const report = new ReleaseReadinessEngine().evaluate({
      governanceScore: governanceScore({ score: 82, status: "good", trend: "stable" }),
      driftAnalysis: driftAnalysis({ driftScore: 20, degraded: false }),
      monitoringInsights: monitoringInsights({ governanceHealthScore: 82, reliabilityScore: 94, trend: "stable" }),
      prioritizedRemediationPlan: {
        ...prioritizedPlan(),
        criticalItemCount: 0,
        highItemCount: 1,
        items: [
          {
            ...prioritizedPlan().items[1]!,
            rank: 1,
          },
        ],
      },
      thresholds: {
        maximumHighBlockingFindings: 2,
        maximumReleaseRiskScore: 70,
      },
      generatedAt: "2026-05-30T00:00:00.000Z",
    });

    expect(report.decision).toBe("conditional-go");
    expect(report.blockingFindings).toHaveLength(1);
    expect(report.reasoning).toEqual(expect.arrayContaining(["high-blockers:1:maximum:2"]));
  });
});

function governanceScore(input: {
  readonly score: number;
  readonly status: GovernanceScore["status"];
  readonly trend: GovernanceScore["historicalTrend"]["direction"];
}): GovernanceScore {
  return {
    score: input.score,
    status: input.status,
    severity: {
      critical: 1,
      warning: 2,
      info: 0,
      total: 3,
    },
    factors: [],
    routeScores: [
      {
        route: "https://example.test/checkout",
        score: input.score,
        findingCount: 2,
        severity: {
          critical: 1,
          warning: 1,
          info: 0,
          total: 2,
        },
        averageConfidence: 0.92,
        penalties: [],
      },
    ],
    executionScore: {
      score: 90,
      stageCount: 3,
      failedStageCount: 0,
      retryCount: 0,
      totalDurationMs: 1200,
      penalties: [],
    },
    historicalTrend: {
      score: input.score,
      direction: input.trend,
      currentScore: input.score,
      previousScore: input.trend === "regressing" ? input.score + 12 : input.score,
      delta: input.trend === "regressing" ? -12 : 0,
      degradationPenalty: input.trend === "regressing" ? 12 : 0,
    },
    degradationPenalties: [],
    weights: {
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
    },
  };
}

function driftAnalysis(input: { readonly driftScore: number; readonly degraded: boolean }): DriftAnalysisReport {
  return {
    reportId: "drift:test",
    runId: "runtime-current",
    generatedAt: "2026-05-30T00:00:00.000Z",
    analyzedExecutionCount: 3,
    overallDriftScore: input.driftScore,
    governanceScoreDegradation: {
      degraded: input.degraded,
      degradationAmount: input.degraded ? 14 : 0,
      trend: {
        direction: input.degraded ? "increasing" : "stable",
        firstValue: 0,
        previousValue: input.degraded ? 4 : 0,
        currentValue: input.degraded ? 14 : 0,
        deltaFromPrevious: input.degraded ? 10 : 0,
        deltaFromBaseline: input.degraded ? 14 : 0,
      },
    },
    executionTimeline: [],
    routeDrift: [],
    componentDrift: [],
    tokenDriftEvolution: [],
    accessibilityDrift: [],
    degradationIndicators: input.degraded ? ["governance score degraded"] : [],
  };
}

function monitoringInsights(input: {
  readonly governanceHealthScore: number;
  readonly reliabilityScore: number;
  readonly trend: "regressing" | "stable";
}): MonitoringInsights {
  return {
    reportId: "monitoring:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    monitoredExecutionCount: 3,
    governanceHealth: {
      score: input.governanceHealthScore,
      status: input.governanceHealthScore < 60 ? "degraded" : "healthy",
      averageGovernanceScore: input.governanceHealthScore,
      latestGovernanceScore: input.governanceHealthScore,
      degradationPenalty: 0,
      severityPenalty: 0,
      driftPenalty: 0,
    },
    executionReliability: {
      score: input.reliabilityScore,
      status: input.reliabilityScore < 80 ? "degraded" : "healthy",
      stageCount: 3,
      passedStageCount: input.reliabilityScore < 80 ? 2 : 3,
      failedStageCount: input.reliabilityScore < 80 ? 1 : 0,
      passRate: input.reliabilityScore < 80 ? 0.67 : 1,
      retryCount: 0,
      totalDurationMs: 900,
    },
    severityDistribution: {
      critical: 1,
      warning: 1,
      info: 0,
      total: 2,
    },
    routeHealth: [],
    operationalTrends: [
      {
        category: "governance-score",
        direction: input.trend,
        summary: `${input.trend} governance trend`,
        currentValue: input.governanceHealthScore,
        previousValue: input.trend === "regressing" ? input.governanceHealthScore + 10 : input.governanceHealthScore,
        delta: input.trend === "regressing" ? -10 : 0,
      },
    ],
    monitoringSnapshots: [],
    observabilitySignals: ["governance-health", "execution-reliability"],
  };
}

function prioritizedPlan(): PrioritizedRemediationPlan {
  return {
    planId: "prioritized-remediation:root-cause:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    findingCount: 2,
    criticalItemCount: 1,
    highItemCount: 1,
    items: [
      {
        rank: 1,
        findingId: "verified:runtime-a11y:core.accessibility:Button",
        severity: "critical",
        component: "Button",
        route: "https://example.test/checkout",
        priority: "critical",
        score: 92,
        scoreBreakdown: {
          severity: 35,
          recurrence: 20,
          blastRadius: 10,
          routeCriticality: 12,
          componentUsage: 0,
          accessibilityImpact: 15,
          total: 92,
        },
        explanation: ["severity:critical:35", "accessibility-impact:present:15"],
        evidence: {
          findingIds: ["verified:runtime-a11y:core.accessibility:Button"],
          componentIds: ["Button"],
          routes: ["https://example.test/checkout"],
          rootCauseIds: ["root-cause:component:button"],
          factorSignals: ["accessibility-impact"],
        },
        recommendation: "Fix Button accessibility.",
      },
      {
        rank: 2,
        findingId: "verified:runtime-token:core.token-drift:Input",
        severity: "warning",
        component: "Input",
        route: "https://example.test/settings",
        priority: "high",
        score: 66,
        scoreBreakdown: {
          severity: 18,
          recurrence: 12,
          blastRadius: 8,
          routeCriticality: 10,
          componentUsage: 8,
          accessibilityImpact: 0,
          total: 66,
        },
        explanation: ["severity:warning:18"],
        evidence: {
          findingIds: ["verified:runtime-token:core.token-drift:Input"],
          componentIds: ["Input"],
          routes: ["https://example.test/settings"],
          rootCauseIds: ["root-cause:token:input"],
          factorSignals: ["root-causes:1"],
        },
        recommendation: "Fix token drift.",
      },
    ],
  };
}
