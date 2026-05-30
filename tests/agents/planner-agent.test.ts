import { describe, expect, it } from "vitest";
import { PlannerAgent, type ExecutionPlan } from "../../src/agents/planner/index.js";
import type { MonitoringInsights } from "../../src/agents/monitoring/index.js";
import type { HistoricalInsights } from "../../src/agents/memory/types.js";
import type { OperationalLogger } from "../../src/shared/logger/index.js";
import type { PrioritizedRemediationPlan } from "../../src/intelligence/prioritization/index.js";
import type { ReleaseReadinessReport } from "../../src/intelligence/release-readiness/index.js";

describe("PlannerAgent", () => {
  it("creates a deterministic risk-aware governance execution plan", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const plan = new PlannerAgent({ logger: silentLogger }).plan({
      monitoringInsights: monitoringInsights(),
      historicalInsights: historicalInsights(),
      releaseReadinessReport: releaseReadinessReport(),
      prioritizedRemediationPlan: prioritizedPlan(),
      strategy: {
        strategy: "release-blocker-first",
        maxParallelRoutes: 1,
        auditCapacityPerCycle: 4,
      },
      generatedAt,
    });

    expect(plan).toEqual(
      expect.objectContaining({
        planId: "execution-plan:release-readiness:prioritized-remediation:root-cause:test",
        generatedAt,
        releaseDecision: "no-go",
        summary: "no-go release plan with 2 route(s), 4 audit focus area(s), and 4 scheduled phase(s).",
      }),
    );
    expect(plan.strategy).toEqual(
      expect.objectContaining({
        strategy: "release-blocker-first",
        maxParallelRoutes: 1,
        auditCapacityPerCycle: 4,
        includeMonitoringPhase: true,
      }),
    );
    expect(plan.routePriorities[0]).toEqual(
      expect.objectContaining({
        rank: 1,
        route: "https://example.test/checkout",
        riskLevel: expect.stringMatching(/high|critical/),
        evidence: expect.objectContaining({
          monitoringReportId: "monitoring:test",
          historicalRunId: "runtime-current",
          releaseReadinessReportId: "release-readiness:prioritized-remediation:root-cause:test",
          remediationPlanId: "prioritized-remediation:root-cause:test",
          findingIds: expect.arrayContaining(["verified:runtime-a11y:core.accessibility:Button"]),
          signals: expect.arrayContaining(["release-blockers:1"]),
        }),
      }),
    );
    expect(auditTypes(plan)).toEqual(["accessibility", "regression", "release-blocker", "token-drift"]);
    expect(plan.schedule.map((item) => item.phase)).toEqual(["stabilize", "remediate", "verify", "monitor"]);
    expect(plan.schedule[0]).toEqual(
      expect.objectContaining({
        ownerHint: "release-management",
        routes: ["https://example.test/checkout"],
      }),
    );
    expect(plan.resourceAllocations[0]?.team).toBe("engineering");
    expect(plan.resourceAllocations.every(hasEvidence)).toBe(true);
  });
});

const silentLogger: OperationalLogger = {
  start: () => ({ operation: "test", correlationId: "test", startedAt: "2026-05-30T00:00:00.000Z" }),
  complete: () => undefined,
  fail: () => undefined,
  event: () => undefined,
};

function monitoringInsights(): MonitoringInsights {
  return {
    reportId: "monitoring:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    monitoredExecutionCount: 3,
    governanceHealth: {
      score: 55,
      status: "degraded",
      averageGovernanceScore: 70,
      latestGovernanceScore: 55,
      degradationPenalty: 10,
      severityPenalty: 12,
      driftPenalty: 6,
    },
    executionReliability: {
      score: 72,
      status: "degraded",
      stageCount: 3,
      passedStageCount: 2,
      failedStageCount: 1,
      passRate: 0.67,
      retryCount: 1,
      totalDurationMs: 1200,
    },
    severityDistribution: {
      critical: 1,
      warning: 1,
      info: 0,
      total: 2,
    },
    routeHealth: [
      {
        route: "https://example.test/checkout",
        executionCount: 3,
        latestRunId: "runtime-current",
        latestStartedAt: "2026-05-30T00:00:00.000Z",
        status: "critical",
        healthScore: 32,
        averageGovernanceScore: 64,
        latestGovernanceScore: 52,
        severityDistribution: {
          critical: 1,
          warning: 1,
          info: 0,
          total: 2,
        },
        activeFindingCount: 2,
        driftScore: 48,
      },
      {
        route: "https://example.test/settings",
        executionCount: 2,
        latestRunId: "runtime-current",
        latestStartedAt: "2026-05-30T00:00:00.000Z",
        status: "watch",
        healthScore: 70,
        averageGovernanceScore: 76,
        latestGovernanceScore: 70,
        severityDistribution: {
          critical: 0,
          warning: 1,
          info: 0,
          total: 1,
        },
        activeFindingCount: 1,
      },
    ],
    operationalTrends: [
      {
        category: "governance-score",
        direction: "regressing",
        summary: "Governance score is regressing.",
        currentValue: 55,
        previousValue: 72,
        delta: -17,
      },
    ],
    monitoringSnapshots: [],
    observabilitySignals: ["governance-health", "route-health"],
  };
}

function historicalInsights(): HistoricalInsights {
  return {
    runId: "runtime-current",
    generatedAt: "2026-05-30T00:00:00.000Z",
    analyzedExecutionCount: 3,
    recurringViolations: [
      {
        signature: "core.accessibility:Button",
        route: "https://example.test/checkout",
        component: "Button",
        severity: "critical",
        occurrenceCount: 3,
        affectedRunIds: ["runtime-001", "runtime-002", "runtime-current"],
        firstSeenAt: "2026-05-28T00:00:00.000Z",
        lastSeenAt: "2026-05-30T00:00:00.000Z",
        currentFindingIds: ["verified:runtime-a11y:core.accessibility:Button"],
      },
    ],
    regressions: [
      {
        signature: "checkout-accessibility",
        findingId: "verified:runtime-a11y:core.accessibility:Button",
        route: "https://example.test/checkout",
        component: "Button",
        severity: "critical",
        regressionType: "returned-after-clean-run",
      },
    ],
    governanceScoreTrend: {
      points: [],
      currentScore: 55,
      previousScore: 72,
      delta: -17,
      averageScore: 64,
      direction: "regressing",
    },
    routeHistory: [
      {
        route: "https://example.test/checkout",
        routeId: "checkout",
        executionCount: 3,
        latestRunId: "runtime-current",
        latestStartedAt: "2026-05-30T00:00:00.000Z",
        averageGovernanceScore: 64,
        totalVerifiedFindings: 6,
        recurringViolationCount: 2,
      },
      {
        route: "https://example.test/settings",
        routeId: "settings",
        executionCount: 2,
        latestRunId: "runtime-current",
        latestStartedAt: "2026-05-30T00:00:00.000Z",
        averageGovernanceScore: 76,
        totalVerifiedFindings: 2,
        recurringViolationCount: 1,
      },
    ],
    componentFailureFrequency: [],
  };
}

function releaseReadinessReport(): ReleaseReadinessReport {
  return {
    reportId: "release-readiness:prioritized-remediation:root-cause:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    decision: "no-go",
    releaseRiskScore: 72,
    governanceConfidenceScore: 61,
    blockingFindings: [
      {
        findingId: "verified:runtime-a11y:core.accessibility:Button",
        rank: 1,
        severity: "critical",
        priority: "critical",
        score: 92,
        component: "Button",
        route: "https://example.test/checkout",
        reason: "Critical remediation item ranked 1 blocks release readiness.",
      },
    ],
    trendAnalysis: {
      governanceTrend: "regressing",
      driftTrend: "increasing",
      monitoringTrend: "regressing",
      degraded: true,
      reasons: ["governance-trend:regressing"],
    },
    thresholds: {
      minimumGovernanceScore: 75,
      minimumGovernanceConfidenceScore: 70,
      maximumReleaseRiskScore: 55,
      maximumCriticalBlockingFindings: 0,
      maximumHighBlockingFindings: 3,
      maximumDriftScore: 45,
      minimumExecutionReliabilityScore: 80,
      blockOnCriticalGovernanceStatus: true,
      blockOnRegressingTrend: false,
    },
    reasoning: ["governance-score:62:minimum:75"],
    evidence: {
      governanceStatus: "degraded",
      governanceScore: 62,
      driftScore: 58,
      monitoringHealthStatus: "degraded",
      executionReliabilityScore: 72,
      prioritizedPlanId: "prioritized-remediation:root-cause:test",
    },
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
          componentIds: ["Button", "component-button-primary"],
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
        explanation: ["severity:warning:18", "token-drift"],
        evidence: {
          findingIds: ["verified:runtime-token:core.token-drift:Input"],
          componentIds: ["Input"],
          routes: ["https://example.test/settings"],
          rootCauseIds: ["root-cause:token:input"],
          factorSignals: ["root-causes:1", "token-drift"],
        },
        recommendation: "Fix token drift.",
      },
    ],
  };
}

function auditTypes(plan: ExecutionPlan): readonly string[] {
  return [...new Set(plan.auditPriorities.map((audit) => audit.auditType))].sort();
}

function hasEvidence(allocation: ExecutionPlan["resourceAllocations"][number]): boolean {
  return (
    allocation.evidence.monitoringReportId.length > 0 &&
    allocation.evidence.historicalRunId.length > 0 &&
    allocation.evidence.releaseReadinessReportId.length > 0 &&
    allocation.evidence.remediationPlanId.length > 0
  );
}
