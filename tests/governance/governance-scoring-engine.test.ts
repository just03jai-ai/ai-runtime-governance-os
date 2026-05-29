import { describe, expect, it } from "vitest";
import {
  GovernanceScoringEngine,
  isAccessibilityFinding,
  isComponentMisuseFinding,
  isTokenDriftFinding,
} from "../../src/governance/scoring/governance-scoring-engine.js";
import type { MonitoringExecutionMetric } from "../../src/agents/monitoring/monitoring-agent.js";
import type { DriftAnalysisReport, HistoricalInsights, MemoryExecutionSnapshot } from "../../src/agents/memory/types.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";

describe("GovernanceScoringEngine", () => {
  it("produces weighted severity-aware operational governance scoring", () => {
    const checkoutRoute = "https://example.test/checkout";
    const dashboardRoute = "https://example.test/dashboard";
    const criticalA11y = finding({
      id: "critical-accessible-name",
      route: checkoutRoute,
      component: "Button",
      severity: "critical",
      expected: "accessible label",
      actual: "empty aria label",
      confidence: 0.96,
    });
    const tokenDrift = finding({
      id: "token-drift-spacing",
      route: checkoutRoute,
      component: "Card",
      severity: "warning",
      expected: "spacing.card.md token",
      actual: "13px",
      confidence: 0.7,
    });
    const componentMisuse = finding({
      id: "component-contract",
      route: dashboardRoute,
      component: "Link",
      severity: "warning",
      expected: "approved design-system component contract",
      actual: "raw anchor component",
      confidence: 0.9,
    });

    const score = new GovernanceScoringEngine().score({
      verifiedFindings: [criticalA11y, tokenDrift, componentMisuse],
      executionMetrics: [metric("execution", "passed", 400, 1), metric("verification", "failed", 20, 2)],
      historicalExecutions: [
        snapshot("run-001", checkoutRoute, "2026-05-27T00:00:00.000Z", 94, []),
        snapshot("run-002", checkoutRoute, "2026-05-28T00:00:00.000Z", 83, [tokenDrift]),
        snapshot("run-003", checkoutRoute, "2026-05-29T00:00:00.000Z", 71, [criticalA11y, tokenDrift]),
      ],
      historicalInsights: historicalInsights(),
      driftAnalysis: driftAnalysis(checkoutRoute),
    });

    expect(score.severity).toEqual({
      critical: 1,
      warning: 2,
      info: 0,
      total: 3,
    });
    expect(score.factors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factor: "critical-findings", count: 1, penalty: 14 }),
        expect.objectContaining({ factor: "accessibility-violations", count: 1, penalty: 8 }),
        expect.objectContaining({ factor: "token-drift", count: 1, penalty: 4 }),
        expect.objectContaining({ factor: "component-misuse", count: 1, penalty: 3 }),
        expect.objectContaining({ factor: "recurring-regressions", count: 3, penalty: 24 }),
        expect.objectContaining({ factor: "verification-confidence", count: 1, penalty: 6 }),
        expect.objectContaining({ factor: "historical-degradation", count: 1, penalty: 21 }),
      ]),
    );
    expect(score.executionScore).toEqual(
      expect.objectContaining({
        stageCount: 2,
        failedStageCount: 1,
        retryCount: 1,
        totalDurationMs: 420,
      }),
    );
    expect(score.historicalTrend).toEqual(
      expect.objectContaining({
        direction: "regressing",
        currentScore: 71,
        previousScore: 83,
        delta: -12,
        degradationPenalty: 21,
      }),
    );
    expect(score.routeScores[0]).toEqual(
      expect.objectContaining({
        route: checkoutRoute,
        findingCount: 2,
      }),
    );
    expect(score.score).toBeLessThan(40);
    expect(score.status).toBe("critical");
  });

  it("classifies governance scoring factors deterministically", () => {
    expect(
      isAccessibilityFinding(
        finding({
          id: "a11y",
          route: "https://example.test",
          component: "Input",
          severity: "critical",
          expected: "keyboard focus visible",
          actual: "focus missing",
          confidence: 1,
        }),
      ),
    ).toBe(true);
    expect(
      isTokenDriftFinding(
        finding({
          id: "spacing",
          route: "https://example.test",
          component: "Card",
          severity: "warning",
          expected: "spacing.card.md token",
          actual: "13px",
          confidence: 1,
        }),
      ),
    ).toBe(true);
    expect(
      isComponentMisuseFinding(
        finding({
          id: "contract",
          route: "https://example.test",
          component: "Link",
          severity: "warning",
          expected: "approved design-system component contract",
          actual: "raw anchor",
          confidence: 1,
        }),
      ),
    ).toBe(true);
  });
});

function finding(input: {
  readonly id: string;
  readonly route: string;
  readonly component: string;
  readonly severity: VerifiedFinding["severity"];
  readonly expected: string;
  readonly actual: string;
  readonly confidence: number;
}): VerifiedFinding {
  return {
    id: input.id,
    originalFindingId: input.id,
    status: "verified",
    severity: input.severity,
    route: input.route,
    component: input.component,
    evidence: { componentId: input.component },
    expected: input.expected,
    actual: input.actual,
    confidence: input.confidence,
    integrity: {
      hasComponentEvidence: true,
      hasDomEvidence: true,
      hasScreenshotEvidence: true,
      routeMatches: true,
    },
    reasons: [],
  };
}

function metric(
  stage: string,
  status: MonitoringExecutionMetric["status"],
  durationMs: number,
  attempts: number,
): MonitoringExecutionMetric {
  return {
    stage,
    status,
    durationMs,
    attempts,
    startedAt: "2026-05-29T00:00:00.000Z",
    completedAt: "2026-05-29T00:00:01.000Z",
  };
}

function snapshot(
  runId: string,
  route: string,
  startedAt: string,
  governanceScore: number,
  verifiedFindings: readonly VerifiedFinding[],
): MemoryExecutionSnapshot {
  return {
    metadata: {
      runId,
      route,
      startedAt,
      governanceScore,
      status: "passed",
    },
    verifiedFindings,
  };
}

function historicalInsights(): HistoricalInsights {
  return {
    runId: "run-003",
    generatedAt: "2026-05-29T00:00:00.000Z",
    analyzedExecutionCount: 3,
    recurringViolations: [
      {
        signature: "Button:accessible-name",
        route: "https://example.test/checkout",
        component: "Button",
        severity: "critical",
        occurrenceCount: 2,
        affectedRunIds: ["run-001", "run-003"],
        firstSeenAt: "2026-05-27T00:00:00.000Z",
        lastSeenAt: "2026-05-29T00:00:00.000Z",
        currentFindingIds: ["critical-accessible-name"],
      },
    ],
    regressions: [
      {
        signature: "Button:accessible-name",
        findingId: "critical-accessible-name",
        route: "https://example.test/checkout",
        component: "Button",
        severity: "critical",
        regressionType: "returned-after-clean-run",
      },
      {
        signature: "Card:spacing",
        findingId: "token-drift-spacing",
        route: "https://example.test/checkout",
        component: "Card",
        severity: "warning",
        regressionType: "new-violation",
      },
    ],
    governanceScoreTrend: {
      points: [],
      direction: "regressing",
    },
    routeHistory: [],
    componentFailureFrequency: [],
  };
}

function driftAnalysis(route: string): DriftAnalysisReport {
  return {
    reportId: "drift:run-003",
    runId: "run-003",
    generatedAt: "2026-05-29T00:00:00.000Z",
    analyzedExecutionCount: 3,
    overallDriftScore: 36,
    governanceScoreDegradation: {
      degraded: true,
      degradationAmount: 12,
      trend: {
        direction: "decreasing",
        firstValue: 94,
        previousValue: 83,
        currentValue: 71,
        deltaFromPrevious: -12,
        deltaFromBaseline: -23,
      },
    },
    executionTimeline: [],
    routeDrift: [
      {
        route,
        executionCount: 3,
        driftScore: 36,
        violationTrend: {
          direction: "increasing",
          firstValue: 0,
          previousValue: 1,
          currentValue: 2,
          deltaFromPrevious: 1,
          deltaFromBaseline: 2,
        },
        scoreTrend: {
          direction: "decreasing",
          firstValue: 94,
          previousValue: 83,
          currentValue: 71,
          deltaFromPrevious: -12,
          deltaFromBaseline: -23,
        },
        degradationIndicators: ["route degraded"],
      },
    ],
    componentDrift: [],
    tokenDriftEvolution: [],
    accessibilityDrift: [],
    degradationIndicators: ["governance score degraded by 12 points"],
  };
}
