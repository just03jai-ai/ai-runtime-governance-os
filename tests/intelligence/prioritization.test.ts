import { describe, expect, it } from "vitest";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import type { ComponentHealthReport } from "../../src/intelligence/component-intelligence/index.js";
import {
  PrioritizationEngine,
  type PrioritizedRemediationItem,
} from "../../src/intelligence/prioritization/index.js";
import type { RootCauseReport } from "../../src/intelligence/root-cause/index.js";
import type { RouteHealthReport } from "../../src/intelligence/route-intelligence/index.js";

describe("PrioritizationEngine", () => {
  it("ranks governance findings by deterministic operational impact", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const findings = [
      finding({
        id: "verified:runtime-a11y:core.accessibility:Button",
        severity: "critical",
        component: "Button",
        route: "https://example.test/checkout",
        expected: "accessible label",
        actual: "empty aria label",
      }),
      finding({
        id: "verified:runtime-token:core.token-drift:Input",
        severity: "warning",
        component: "Input",
        route: "https://example.test/settings",
        expected: "color.action.primary.background token",
        actual: "missing token evidence",
      }),
      finding({
        id: "verified:runtime-info:core.copy:Card",
        severity: "info",
        component: "Card",
        route: "https://example.test/help",
        expected: "approved copy",
        actual: "minor copy mismatch",
      }),
    ];

    const plan = new PrioritizationEngine().prioritize({
      verifiedFindings: findings,
      componentHealthReport: componentHealthReport(),
      routeHealthReport: routeHealthReport(),
      rootCauseReport: rootCauseReport(),
      generatedAt,
    });

    expect(plan).toEqual(
      expect.objectContaining({
        planId: "prioritized-remediation:root-cause:test",
        generatedAt,
        findingCount: 3,
        criticalItemCount: 1,
        highItemCount: expect.any(Number),
      }),
    );
    expect(plan.items.map((item) => item.rank)).toEqual([1, 2, 3]);
    expect(plan.items[0]).toEqual(
      expect.objectContaining({
        findingId: "verified:runtime-a11y:core.accessibility:Button",
        priority: "critical",
        evidence: expect.objectContaining({
          findingIds: expect.arrayContaining(["verified:runtime-a11y:core.accessibility:Button"]),
          componentIds: expect.arrayContaining(["Button", "component-button-primary"]),
          routes: expect.arrayContaining(["https://example.test/checkout"]),
          rootCauseIds: expect.arrayContaining(["root-cause:component:button"]),
          factorSignals: expect.arrayContaining(["accessibility-impact", "route-risk:critical"]),
        }),
      }),
    );
    expect(plan.items[0]?.scoreBreakdown).toEqual(
      expect.objectContaining({
        severity: 35,
        accessibilityImpact: 15,
      }),
    );
    expect(plan.items.every(hasEvidence)).toBe(true);
    expect(plan.items[0]?.explanation).toEqual(
      expect.arrayContaining([
        expect.stringContaining("severity:critical"),
        expect.stringContaining("recurrence:"),
        expect.stringContaining("blast-radius:"),
        expect.stringContaining("route-criticality:critical"),
        expect.stringContaining("component-usage:"),
        expect.stringContaining("accessibility-impact:present"),
      ]),
    );
    expect(plan.items[0]?.score).toBeGreaterThan(plan.items[1]?.score ?? 0);
    expect(plan.items[1]?.score).toBeGreaterThan(plan.items[2]?.score ?? 0);
  });
});

function finding(input: {
  readonly id: string;
  readonly severity: VerifiedFinding["severity"];
  readonly component: string;
  readonly route: string;
  readonly expected: string;
  readonly actual: string;
}): VerifiedFinding {
  return {
    id: input.id,
    originalFindingId: input.id.replace("verified:", "original:"),
    status: "verified",
    severity: input.severity,
    route: input.route,
    component: input.component,
    evidence: {
      componentName: input.component,
      componentId: input.component === "Button" ? "component-button-primary" : `component-${input.component.toLowerCase()}`,
    },
    expected: input.expected,
    actual: input.actual,
    confidence: 0.95,
    integrity: {
      hasComponentEvidence: true,
      hasDomEvidence: true,
      hasScreenshotEvidence: true,
      routeMatches: true,
    },
    reasons: [],
  };
}

function componentHealthReport(): ComponentHealthReport {
  return {
    reportId: "component-health:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    componentCount: 3,
    unhealthyComponentCount: 1,
    averageHealthScore: 72,
    averageStabilityScore: 74,
    components: [
      {
        componentId: "Button",
        componentName: "Button",
        frequency: 4,
        routeDistribution: ["https://example.test/checkout", "https://example.test/cart"],
        tokenUsage: [],
        policyViolations: [
          {
            policyId: "core.accessibility",
            findingCount: 2,
            highestSeverity: "critical",
          },
        ],
        accessibilityIssueCount: 2,
        violationFrequency: 3,
        driftHistory: [],
        healthScore: 38,
        stabilityScore: 42,
        trend: "regressing",
      },
      {
        componentId: "Input",
        componentName: "Input",
        frequency: 2,
        routeDistribution: ["https://example.test/settings"],
        tokenUsage: [],
        policyViolations: [],
        accessibilityIssueCount: 0,
        violationFrequency: 1,
        driftHistory: [],
        healthScore: 72,
        stabilityScore: 76,
        trend: "stable",
      },
      {
        componentId: "Card",
        componentName: "Card",
        frequency: 1,
        routeDistribution: ["https://example.test/help"],
        tokenUsage: [],
        policyViolations: [],
        accessibilityIssueCount: 0,
        violationFrequency: 1,
        driftHistory: [],
        healthScore: 91,
        stabilityScore: 94,
        trend: "stable",
      },
    ],
  };
}

function routeHealthReport(): RouteHealthReport {
  return {
    reportId: "route-health:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    routeCount: 3,
    degradedRouteCount: 1,
    averageGovernanceScore: 74,
    routes: [
      {
        route: "https://example.test/checkout",
        routeId: "checkout",
        title: "Checkout",
        complexity: 78,
        governanceScore: 44,
        violationDensity: 2.5,
        accessibilityHealthScore: 40,
        componentConcentration: 0.8,
        historicalDegradation: [],
        degradationTrend: "regressing",
        riskRank: 1,
        riskLevel: "critical",
        componentCount: 4,
        findingCount: 5,
        severity: {
          critical: 2,
          warning: 3,
          info: 0,
          total: 5,
        },
      },
      {
        route: "https://example.test/settings",
        routeId: "settings",
        title: "Settings",
        complexity: 34,
        governanceScore: 74,
        violationDensity: 1,
        accessibilityHealthScore: 100,
        componentConcentration: 0.4,
        historicalDegradation: [],
        degradationTrend: "stable",
        riskRank: 2,
        riskLevel: "medium",
        componentCount: 2,
        findingCount: 1,
        severity: {
          critical: 0,
          warning: 1,
          info: 0,
          total: 1,
        },
      },
      {
        route: "https://example.test/help",
        routeId: "help",
        title: "Help",
        complexity: 12,
        governanceScore: 94,
        violationDensity: 0.2,
        accessibilityHealthScore: 100,
        componentConcentration: 0.2,
        historicalDegradation: [],
        degradationTrend: "stable",
        riskRank: 3,
        riskLevel: "low",
        componentCount: 1,
        findingCount: 1,
        severity: {
          critical: 0,
          warning: 0,
          info: 1,
          total: 1,
        },
      },
    ],
  };
}

function rootCauseReport(): RootCauseReport {
  return {
    reportId: "root-cause:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    analyzedFindingCount: 3,
    clusterCount: 2,
    systemicCauseCount: 2,
    clusters: [],
    rootCauses: [
      {
        id: "root-cause:component:button",
        category: "component",
        severity: "critical",
        confidence: 0.92,
        summary: "Button is a recurring source of accessibility issues.",
        contributingClusterIds: ["cluster:button-a11y"],
        evidence: {
          nodeIds: ["component:button"],
          findingIds: ["verified:runtime-a11y:core.accessibility:Button"],
          componentIds: ["Button"],
          routes: ["https://example.test/checkout", "https://example.test/cart"],
          tokenNames: [],
          policyIds: ["core.accessibility"],
          releaseIds: ["release-002"],
          historicalSignals: ["component-history:occurrences:5", "regression:button-a11y"],
        },
        recommendation: "Fix Button accessibility at the component level before route-specific work.",
      },
      {
        id: "root-cause:token:color-action-primary-background",
        category: "token",
        severity: "warning",
        confidence: 0.8,
        summary: "Primary action token is repeatedly missing.",
        contributingClusterIds: ["cluster:token"],
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
        recommendation: "Align token capture for primary action usage.",
      },
    ],
  };
}

function hasEvidence(item: PrioritizedRemediationItem): boolean {
  return (
    item.evidence.findingIds.length > 0 ||
    item.evidence.componentIds.length > 0 ||
    item.evidence.routes.length > 0 ||
    item.evidence.rootCauseIds.length > 0 ||
    item.evidence.factorSignals.length > 0
  );
}
