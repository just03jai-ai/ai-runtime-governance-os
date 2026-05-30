import { describe, expect, it } from "vitest";
import { PMAgent, type PMInsight } from "../../src/agents/pm/index.js";
import type { OperationalLogger } from "../../src/shared/logger/index.js";
import type { PrioritizedRemediationPlan } from "../../src/intelligence/prioritization/index.js";
import type { ReleaseReadinessReport } from "../../src/intelligence/release-readiness/index.js";
import type { RootCauseReport } from "../../src/intelligence/root-cause/index.js";

describe("PMAgent", () => {
  it("translates governance intelligence into deterministic PM insights", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const report = new PMAgent({ logger: silentLogger }).analyze({
      releaseReadinessReport: releaseReadinessReport(),
      rootCauseReport: rootCauseReport(),
      prioritizedRemediationPlan: prioritizedPlan(),
      generatedAt,
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "pm-insights:release-readiness:prioritized-remediation:root-cause:test",
        generatedAt,
        releaseDecision: "no-go",
        executiveSummary: "Release recommendation is no-go with risk score 72 and 1 blocking governance item(s).",
        releaseRiskSummary: expect.stringContaining("Release risk score is 72"),
        governanceReadinessSummary: expect.stringContaining("Governance confidence is 61"),
        prioritizationSummary: "2 remediation item(s) ranked; 1 critical and 1 high priority item(s).",
        businessImpactSummary: "2 route(s) and 3 component(s) have release-relevant governance impact.",
      }),
    );
    expect(categories(report.insights)).toEqual([
      "business-impact",
      "governance-readiness",
      "prioritization",
      "release-risk",
      "stakeholder-reporting",
    ]);
    expect(report.insights.every(hasEvidence)).toBe(true);
    expect(report.insights.find((insight) => insight.category === "release-risk")).toEqual(
      expect.objectContaining({
        severity: "critical",
        audience: "executive",
        evidence: expect.objectContaining({
          releaseDecision: "no-go",
          findingIds: expect.arrayContaining(["verified:runtime-a11y:core.accessibility:Button"]),
          rootCauseIds: expect.arrayContaining(["root-cause:component:button"]),
        }),
      }),
    );
    expect(report.insights.find((insight) => insight.category === "stakeholder-reporting")?.summary).toContain(
      "top root cause",
    );
  });
});

const silentLogger: OperationalLogger = {
  start: () => ({ operation: "test", correlationId: "test", startedAt: "2026-05-30T00:00:00.000Z" }),
  complete: () => undefined,
  fail: () => undefined,
  event: () => undefined,
};

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

function rootCauseReport(): RootCauseReport {
  return {
    reportId: "root-cause:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    analyzedFindingCount: 2,
    clusterCount: 2,
    systemicCauseCount: 2,
    clusters: [],
    rootCauses: [
      {
        id: "root-cause:component:button",
        category: "component",
        severity: "critical",
        confidence: 0.95,
        summary: "Button is a recurring source of accessibility issues.",
        contributingClusterIds: ["cluster:button"],
        evidence: {
          nodeIds: ["component:button"],
          findingIds: ["verified:runtime-a11y:core.accessibility:Button"],
          componentIds: ["Button"],
          routes: ["https://example.test/checkout"],
          tokenNames: [],
          policyIds: ["core.accessibility"],
          releaseIds: ["release-002"],
          historicalSignals: ["component-history:occurrences:5"],
        },
        recommendation: "Fix Button accessibility at the component level.",
      },
      {
        id: "root-cause:token:input",
        category: "token",
        severity: "warning",
        confidence: 0.8,
        summary: "Input token drift affects settings.",
        contributingClusterIds: ["cluster:input"],
        evidence: {
          nodeIds: ["token:color.action.primary.background"],
          findingIds: ["verified:runtime-token:core.token-drift:Input"],
          componentIds: ["Input"],
          routes: ["https://example.test/settings"],
          tokenNames: ["color.action.primary.background"],
          policyIds: ["core.token-drift"],
          releaseIds: ["release-002"],
          historicalSignals: ["recurring:token"],
        },
        recommendation: "Fix token evidence.",
      },
    ],
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
        explanation: ["severity:critical:35"],
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

function categories(insights: readonly PMInsight[]): readonly string[] {
  return [...new Set(insights.map((insight) => insight.category))].sort();
}

function hasEvidence(insight: PMInsight): boolean {
  return (
    insight.evidence.readinessReportId.length > 0 &&
    insight.evidence.rootCauseReportId.length > 0 &&
    insight.evidence.remediationPlanId.length > 0 &&
    (insight.evidence.findingIds.length > 0 ||
      insight.evidence.rootCauseIds.length > 0 ||
      insight.evidence.routes.length > 0 ||
      insight.evidence.components.length > 0)
  );
}
