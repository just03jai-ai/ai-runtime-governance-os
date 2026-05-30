import { describe, expect, it } from "vitest";
import type { DesignSystemRegistry } from "../../src/design-system-registry/index.js";
import type { PrioritizedRemediationPlan } from "../../src/intelligence/prioritization/index.js";
import {
  RemediationRecommendationEngine,
  type RemediationRecommendation,
} from "../../src/intelligence/remediation/index.js";
import type { RootCauseReport } from "../../src/intelligence/root-cause/index.js";

describe("RemediationRecommendationEngine", () => {
  it("generates deterministic evidence-backed remediation guidance from priority and registry data", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const report = new RemediationRecommendationEngine().recommend({
      prioritizedRemediationPlan: prioritizedPlan(),
      rootCauseReport: rootCauseReport(),
      designSystemRegistry: registry(),
      generatedAt,
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "remediation-recommendations:prioritized-remediation:root-cause:test",
        generatedAt,
        recommendationCount: expect.any(Number),
      }),
    );
    expect(types(report.recommendations)).toEqual([
      "accessibility-fix",
      "component-migration",
      "governance-policy-fix",
      "token-correction",
      "variant-correction",
    ]);
    expect(report.recommendations.every(hasEvidence)).toBe(true);
    expect(report.recommendations.find((item) => item.type === "token-correction")).toEqual(
      expect.objectContaining({
        priority: "critical",
        evidence: expect.objectContaining({
          tokenNames: ["color.action.primary.background"],
          registryComponentIds: ["button"],
          rootCauseIds: expect.arrayContaining(["root-cause:token:color-action-primary-background"]),
        }),
        steps: expect.arrayContaining([
          "Use color.action.primary.background (#635bff) for color styling.",
        ]),
      }),
    );
    expect(report.recommendations.find((item) => item.type === "variant-correction")).toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          variantNames: ["primary"],
          tokenNames: ["color.action.primary.background"],
        }),
      }),
    );
    expect(report.recommendations.find((item) => item.type === "accessibility-fix")).toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          policyIds: expect.arrayContaining(["accessibility", "core.accessibility"]),
        }),
      }),
    );
  });
});

function prioritizedPlan(): PrioritizedRemediationPlan {
  return {
    planId: "prioritized-remediation:root-cause:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    findingCount: 1,
    criticalItemCount: 1,
    highItemCount: 0,
    items: [
      {
        rank: 1,
        findingId: "verified:runtime-a11y:core.accessibility:Button",
        severity: "critical",
        component: "Button",
        route: "https://example.test/checkout",
        priority: "critical",
        score: 94,
        scoreBreakdown: {
          severity: 35,
          recurrence: 20,
          blastRadius: 12,
          routeCriticality: 12,
          componentUsage: 0,
          accessibilityImpact: 15,
          total: 94,
        },
        explanation: [
          "severity:critical:35",
          "recurrence:2 root cause(s):20",
          "route-criticality:critical:12",
          "accessibility-impact:present:15",
        ],
        evidence: {
          findingIds: ["verified:runtime-a11y:core.accessibility:Button"],
          componentIds: ["Button", "component-button-primary"],
          routes: ["https://example.test/checkout"],
          rootCauseIds: [
            "root-cause:component:button",
            "root-cause:token:color-action-primary-background",
            "root-cause:policy:core-accessibility",
          ],
          factorSignals: ["accessibility-impact", "route-risk:critical", "component-health:38"],
        },
        recommendation: "Fix Button accessibility at the component level before route-specific work.",
      },
    ],
  };
}

function rootCauseReport(): RootCauseReport {
  return {
    reportId: "root-cause:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    analyzedFindingCount: 1,
    clusterCount: 3,
    systemicCauseCount: 3,
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
        id: "root-cause:token:color-action-primary-background",
        category: "token",
        severity: "warning",
        confidence: 0.88,
        summary: "Primary button token drift is recurring.",
        contributingClusterIds: ["cluster:token"],
        evidence: {
          nodeIds: ["token:color.action.primary.background"],
          findingIds: ["verified:runtime-a11y:core.accessibility:Button"],
          componentIds: ["Button"],
          routes: ["https://example.test/checkout"],
          tokenNames: ["color.action.primary.background"],
          policyIds: ["core.token-drift", "core.invalid-component-variant"],
          releaseIds: ["release-002"],
          historicalSignals: ["recurring:token"],
        },
        recommendation: "Align Button token usage.",
      },
      {
        id: "root-cause:policy:core-accessibility",
        category: "policy",
        severity: "critical",
        confidence: 0.84,
        summary: "Accessibility policy repeatedly fails for Button.",
        contributingClusterIds: ["cluster:policy"],
        evidence: {
          nodeIds: ["policy:core.accessibility"],
          findingIds: ["verified:runtime-a11y:core.accessibility:Button"],
          componentIds: ["Button"],
          routes: ["https://example.test/checkout"],
          tokenNames: [],
          policyIds: ["core.accessibility"],
          releaseIds: ["release-002"],
          historicalSignals: ["recurring-policy:core.accessibility"],
        },
        recommendation: "Tighten accessibility policy ownership.",
      },
    ],
  };
}

function registry(): DesignSystemRegistry {
  return {
    registryId: "acme",
    name: "Acme Design System",
    version: {
      version: "1.2.0",
      createdAt: "2026-05-29T00:00:00.000Z",
    },
    owner: {
      team: "Design Systems",
      contact: "design@example.test",
    },
    tokens: [
      {
        name: "color.action.primary.background",
        category: "color",
        value: "#635bff",
      },
      {
        name: "radius.control.default",
        category: "radius",
        value: "8px",
      },
    ],
    components: [
      {
        id: "button",
        name: "Button",
        allowedMatchers: [
          {
            tagName: "button",
            role: "button",
            selectorIncludes: ".btn",
          },
        ],
        forbiddenMatchers: [
          {
            selectorIncludes: ".legacy-button",
          },
        ],
        requiredTokens: ["radius.control.default"],
        variants: [
          {
            name: "primary",
            selectorIncludes: ".primary",
            requiredTokens: ["color.action.primary.background"],
          },
        ],
        accessibility: {
          requireAccessibleLabel: true,
          requireRole: "button",
        },
      },
    ],
  };
}

function types(recommendations: readonly RemediationRecommendation[]): readonly string[] {
  return [...new Set(recommendations.map((recommendation) => recommendation.type))].sort();
}

function hasEvidence(recommendation: RemediationRecommendation): boolean {
  return (
    recommendation.evidence.findingIds.length > 0 ||
    recommendation.evidence.rootCauseIds.length > 0 ||
    recommendation.evidence.prioritizedRanks.length > 0 ||
    recommendation.evidence.componentIds.length > 0 ||
    recommendation.evidence.routes.length > 0 ||
    recommendation.evidence.tokenNames.length > 0 ||
    recommendation.evidence.variantNames.length > 0 ||
    recommendation.evidence.policyIds.length > 0 ||
    recommendation.evidence.registryComponentIds.length > 0
  );
}
