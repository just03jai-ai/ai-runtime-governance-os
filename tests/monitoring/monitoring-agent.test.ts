import { describe, expect, it, vi } from "vitest";
import { MonitoringAgent, type MonitoringExecutionMetric } from "../../src/agents/monitoring/monitoring-agent.js";
import type { DriftAnalysisReport, MemoryExecutionSnapshot } from "../../src/agents/memory/types.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import type { OperationalLogger } from "../../src/shared/logger/index.js";

const noOpLogger: OperationalLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  start: vi.fn((operation: string, options: { correlationId: string; route?: string }) => ({
    operation,
    correlationId: options.correlationId,
    ...(options.route ? { route: options.route } : {}),
    startedAt: "2026-05-29T00:00:00.000Z",
    startTimeMs: Date.now(),
  })),
  complete: vi.fn(),
  fail: vi.fn(),
  child: vi.fn(() => noOpLogger),
};

describe("MonitoringAgent", () => {
  it("aggregates deterministic governance monitoring insights", () => {
    const checkoutRoute = "https://example.test/checkout";
    const dashboardRoute = "https://example.test/dashboard";
    const agent = new MonitoringAgent({ logger: noOpLogger });

    const insights = agent.monitor({
      generatedAt: "2026-05-29T00:00:00.000Z",
      historicalExecutions: [
        snapshot("run-001", checkoutRoute, "2026-05-27T00:00:00.000Z", 96, []),
        snapshot("run-002", checkoutRoute, "2026-05-28T00:00:00.000Z", 88, [
          finding("run-002-token", checkoutRoute, "Button", "warning"),
        ]),
        snapshot("run-003", checkoutRoute, "2026-05-29T00:00:00.000Z", 72, [
          finding("run-003-token", checkoutRoute, "Button", "warning"),
          finding("run-003-a11y", checkoutRoute, "Button", "critical"),
        ]),
        snapshot("run-004", dashboardRoute, "2026-05-29T00:01:00.000Z", 91, [
          finding("run-004-info", dashboardRoute, "Text", "info"),
        ]),
      ],
      driftAnalysis: driftAnalysis(checkoutRoute),
      executionMetrics: [
        metric("execution", "passed", 720, 1),
        metric("governance", "passed", 8, 1),
        metric("verification", "passed", 4, 2),
        metric("analysis", "failed", 2, 1),
      ],
    });

    expect(insights.reportId).toBe("monitoring:2026-05-29T00:00:00.000Z");
    expect(insights.monitoredExecutionCount).toBe(4);
    expect(insights.severityDistribution).toEqual({
      critical: 1,
      warning: 2,
      info: 1,
      total: 4,
    });
    expect(insights.executionReliability).toEqual(
      expect.objectContaining({
        stageCount: 4,
        passedStageCount: 3,
        failedStageCount: 1,
        retryCount: 1,
        totalDurationMs: 734,
      }),
    );
    expect(insights.governanceHealth).toEqual(
      expect.objectContaining({
        latestGovernanceScore: 91,
        degradationPenalty: 24,
        driftPenalty: 9,
      }),
    );
    expect(insights.routeHealth[0]).toEqual(
      expect.objectContaining({
        route: checkoutRoute,
        executionCount: 3,
        latestGovernanceScore: 72,
        driftScore: 42,
      }),
    );
    expect(insights.operationalTrends).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "governance-score",
          direction: "improving",
          currentValue: 91,
          previousValue: 72,
          delta: 19,
        }),
        expect.objectContaining({
          category: "drift",
          direction: "regressing",
          currentValue: 36,
        }),
      ]),
    );
    expect(insights.monitoringSnapshots).toHaveLength(4);
    expect(insights.observabilitySignals).toEqual(
      expect.arrayContaining([
        "1 critical finding(s) active",
        "1 execution stage(s) failed",
        "1 retry attempt(s) observed",
        "governance score degraded by 24 point(s)",
      ]),
    );
  });

  it("returns insufficient data scores without history or metrics", () => {
    const insights = new MonitoringAgent({ logger: noOpLogger }).monitor({
      generatedAt: "2026-05-29T00:00:00.000Z",
      historicalExecutions: [],
      executionMetrics: [],
    });

    expect(insights.governanceHealth.status).toBe("insufficient-data");
    expect(insights.executionReliability.status).toBe("insufficient-data");
    expect(insights.operationalTrends.every((trend) => trend.direction === "insufficient-data")).toBe(true);
    expect(insights.monitoringSnapshots).toEqual([]);
  });
});

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
      governanceScore,
      status: "passed",
      startedAt,
    },
    verifiedFindings,
  };
}

function finding(
  id: string,
  route: string,
  component: string,
  severity: VerifiedFinding["severity"],
): VerifiedFinding {
  return {
    id,
    originalFindingId: id,
    status: "verified",
    severity,
    route,
    component,
    evidence: { componentId: component },
    expected: "expected governance contract",
    actual: "runtime mismatch",
    confidence: 1,
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
    startedAt: "2026-05-29T00:00:00.000Z",
    completedAt: "2026-05-29T00:00:01.000Z",
    durationMs,
    attempts,
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
      degradationAmount: 24,
      trend: {
        direction: "decreasing",
        firstValue: 96,
        previousValue: 88,
        currentValue: 72,
        deltaFromPrevious: -16,
        deltaFromBaseline: -24,
      },
    },
    executionTimeline: [],
    routeDrift: [
      {
        route,
        executionCount: 3,
        driftScore: 42,
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
          firstValue: 96,
          previousValue: 88,
          currentValue: 72,
          deltaFromPrevious: -16,
          deltaFromBaseline: -24,
        },
        degradationIndicators: [`${route} governance score degraded by 24 points`],
      },
    ],
    componentDrift: [],
    tokenDriftEvolution: [],
    accessibilityDrift: [],
    degradationIndicators: ["governance score degraded by 24 points"],
  };
}
