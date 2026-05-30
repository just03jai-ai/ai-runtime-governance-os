import { describe, expect, it } from "vitest";
import type { HistoricalInsights } from "../../src/agents/memory/types.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import type { DesignSystemRegistry } from "../../src/design-system-registry/index.js";
import {
  RuntimeEvidenceGraphBuilder,
  VerifiedFindingsGraphBuilder,
  mergeGraphs,
} from "../../src/intelligence/knowledge-graph/index.js";
import {
  GovernanceSimulationEngine,
  type SimulationImpactEstimate,
} from "../../src/intelligence/simulation/index.js";
import type { RuntimeEvidence } from "../../src/shared/types/runtime-evidence.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("GovernanceSimulationEngine", () => {
  it("predicts graph-backed governance impact for proposed changes", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const graph = mergeGraphs(
      "simulation:test",
      [
        new RuntimeEvidenceGraphBuilder().build(runtimeEvidence(), {
          releaseId: "release-002",
          generatedAt,
        }),
        new VerifiedFindingsGraphBuilder().build(
          [
            tokenFinding("button-token", "Button", "component-button-primary", "critical"),
            tokenFinding("input-token", "Input", "component-email-input", "warning"),
          ],
          {
            releaseId: "release-002",
            generatedAt,
          },
        ),
      ],
      generatedAt,
    );

    const report = new GovernanceSimulationEngine().simulate({
      graph,
      historicalInsights: historicalInsights(),
      designSystemRegistry: registry(),
      proposedChanges: [
        {
          type: "token-change",
          tokenName: "color.action.primary.background",
          proposedValue: "#111827",
        },
        {
          type: "component-migration",
          fromComponentId: "Button",
          toRegistryComponentId: "button",
        },
        {
          type: "policy-change",
          policyId: "core.token-drift",
          action: "modify",
          affectedComponentIds: ["Button", "Input"],
        },
      ],
      generatedAt,
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "simulation:simulation:test",
        generatedAt,
        graphId: "simulation:test",
        changeCount: 3,
        overallBlastRadiusScore: expect.any(Number),
        overallReleaseImpactScore: expect.any(Number),
      }),
    );
    expect(report.impactEstimates).toHaveLength(3);
    expect(report.impactEstimates.every(hasEvidence)).toBe(true);
    expect(report.impactEstimates.find((estimate) => estimate.changeType === "token-change")).toEqual(
      expect.objectContaining({
        changeId: "change-1:token:color-action-primary-background",
        evidence: expect.objectContaining({
          tokenNames: ["color.action.primary.background"],
          componentIds: expect.arrayContaining(["component-button-primary", "component-email-input"]),
          routes: ["https://example.test/checkout"],
          historicalSignals: expect.arrayContaining([
            "recurring-token:core.token-drift:color.action.primary.background:4",
          ]),
        }),
      }),
    );
    expect(report.impactEstimates.find((estimate) => estimate.changeType === "component-migration")).toEqual(
      expect.objectContaining({
        changeId: "change-2:component:button-to-button",
        evidence: expect.objectContaining({
          componentIds: expect.arrayContaining(["Button"]),
        }),
      }),
    );
    expect(report.impactEstimates.find((estimate) => estimate.changeType === "policy-change")).toEqual(
      expect.objectContaining({
        changeId: "change-3:policy:core-token-drift:modify",
        evidence: expect.objectContaining({
          policyIds: ["core.token-drift"],
          findingIds: expect.arrayContaining([
            "verified:runtime-button-token:core.token-drift:Button",
            "verified:runtime-input-token:core.token-drift:Input",
          ]),
        }),
      }),
    );
    expect(report.recommendations).toHaveLength(3);
  });
});

function runtimeEvidence(): RuntimeEvidence {
  return {
    ...mockRuntimeEvidence,
    componentInventory: [
      ...mockRuntimeEvidence.componentInventory,
      {
        id: "component-email-input",
        name: "Input",
        tagName: "input",
        role: "textbox",
        label: "Email",
        selectorHint: "input.email",
        attributes: {
          type: "email",
        },
        visible: true,
        boundingBox: {
          x: 24,
          y: 80,
          width: 320,
          height: 40,
        },
        source: "dom",
      },
    ],
    designTokens: [
      ...mockRuntimeEvidence.designTokens,
      {
        name: "color.action.primary.background",
        value: "#2563eb",
        category: "color",
        source: "computed-style",
      },
    ],
  };
}

function tokenFinding(
  id: string,
  component: string,
  componentId: string,
  severity: VerifiedFinding["severity"],
): VerifiedFinding {
  return {
    id: `verified:runtime-${id}:core.token-drift:${component}`,
    originalFindingId: `original:runtime-${id}:core.token-drift:${component}`,
    status: "verified",
    severity,
    route: "https://example.test/checkout",
    component,
    evidence: {
      componentName: component,
      componentId,
    },
    expected: "color.action.primary.background token",
    actual: "token usage is missing or inconsistent",
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

function historicalInsights(): HistoricalInsights {
  return {
    runId: "runtime-current",
    generatedAt: "2026-05-30T00:00:00.000Z",
    analyzedExecutionCount: 3,
    recurringViolations: [
      {
        signature: "core.token-drift:color.action.primary.background",
        route: "https://example.test/checkout",
        component: "Button",
        severity: "critical",
        occurrenceCount: 4,
        affectedRunIds: ["runtime-001", "runtime-002", "runtime-current"],
        firstSeenAt: "2026-05-28T00:00:00.000Z",
        lastSeenAt: "2026-05-30T00:00:00.000Z",
        currentFindingIds: ["verified:runtime-button-token:core.token-drift:Button"],
      },
    ],
    regressions: [
      {
        signature: "core.token-drift:Button",
        findingId: "verified:runtime-button-token:core.token-drift:Button",
        route: "https://example.test/checkout",
        component: "Button",
        severity: "critical",
        regressionType: "returned-after-clean-run",
      },
    ],
    governanceScoreTrend: {
      points: [],
      currentScore: 72,
      previousScore: 84,
      delta: -12,
      averageScore: 78,
      direction: "regressing",
    },
    routeHistory: [],
    componentFailureFrequency: [
      {
        component: "Button",
        occurrenceCount: 5,
        affectedRunCount: 3,
        affectedRoutes: ["https://example.test/checkout"],
        highestSeverity: "critical",
        latestSeenAt: "2026-05-30T00:00:00.000Z",
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
    tokens: [
      {
        name: "color.action.primary.background",
        category: "color",
        value: "#635bff",
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
          },
        ],
        requiredTokens: ["color.action.primary.background"],
        variants: [
          {
            name: "primary",
            requiredTokens: ["color.action.primary.background"],
          },
        ],
      },
      {
        id: "input",
        name: "Input",
        allowedMatchers: [
          {
            tagName: "input",
            role: "textbox",
          },
        ],
        requiredTokens: ["color.action.primary.background"],
      },
    ],
  };
}

function hasEvidence(estimate: SimulationImpactEstimate): boolean {
  return (
    estimate.evidence.nodeIds.length > 0 ||
    estimate.evidence.componentIds.length > 0 ||
    estimate.evidence.routes.length > 0 ||
    estimate.evidence.tokenNames.length > 0 ||
    estimate.evidence.policyIds.length > 0 ||
    estimate.evidence.findingIds.length > 0 ||
    estimate.evidence.releaseIds.length > 0 ||
    estimate.evidence.historicalSignals.length > 0
  );
}
