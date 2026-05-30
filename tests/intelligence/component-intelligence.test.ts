import { describe, expect, it } from "vitest";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import { ComponentIntelligenceEngine } from "../../src/intelligence/component-intelligence/index.js";
import {
  RuntimeEvidenceGraphBuilder,
  VerifiedFindingsGraphBuilder,
  mergeGraphs,
} from "../../src/intelligence/knowledge-graph/index.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("ComponentIntelligenceEngine", () => {
  it("generates component-level operational intelligence from the knowledge graph", () => {
    const runtimeGraph = new RuntimeEvidenceGraphBuilder().build(mockRuntimeEvidence, {
      releaseId: "release-001",
      generatedAt: "2026-05-29T00:00:00.000Z",
    });
    const findingGraph = new VerifiedFindingsGraphBuilder().build([accessibilityFinding(), tokenFinding()], {
      releaseId: "release-001",
      generatedAt: "2026-05-29T00:00:00.000Z",
    });
    const graph = mergeGraphs("component-intelligence:test", [runtimeGraph, findingGraph], "2026-05-29T00:00:00.000Z");

    const report = new ComponentIntelligenceEngine().analyze(graph, {
      generatedAt: "2026-05-29T00:00:00.000Z",
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "component-health:component-intelligence:test",
        generatedAt: "2026-05-29T00:00:00.000Z",
        componentCount: 2,
        unhealthyComponentCount: 1,
      }),
    );

    const button = report.components.find((component) => component.componentId === "Button");
    expect(button).toEqual(
      expect.objectContaining({
        componentId: "Button",
        componentName: "Button",
        frequency: 1,
        routeDistribution: ["https://example.test/checkout"],
        accessibilityIssueCount: 1,
        violationFrequency: 2,
        healthScore: expect.any(Number),
        stabilityScore: expect.any(Number),
        trend: "insufficient-data",
      }),
    );
    expect(button?.tokenUsage).toEqual([]);
    expect(button?.policyViolations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          policyId: "core.accessibility",
          findingCount: 2,
          highestSeverity: "critical",
        }),
      ]),
    );

    const runtimeComponent = report.components.find((component) => component.componentId === "component-button-primary");
    expect(runtimeComponent).toEqual(
      expect.objectContaining({
        componentName: "Button",
        tokenUsage: [
          expect.objectContaining({
            tokenName: "font.body",
            category: "typography",
          }),
        ],
      }),
    );
  });
});

function accessibilityFinding(): VerifiedFinding {
  return {
    id: "verified:runtime-001:core.accessibility:Button",
    originalFindingId: "original:runtime-001:core.accessibility:Button",
    status: "verified",
    severity: "critical",
    route: "https://example.test/checkout",
    component: "Button",
    evidence: {
      componentName: "Button",
      componentId: "component-button-primary",
    },
    expected: "accessible label",
    actual: "empty aria label",
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

function tokenFinding(): VerifiedFinding {
  return {
    id: "verified:runtime-001:core.token-drift:Button",
    originalFindingId: "original:runtime-001:core.token-drift:Button",
    status: "verified",
    severity: "warning",
    route: "https://example.test/checkout",
    component: "Button",
    evidence: {
      componentName: "Button",
      componentId: "component-button-primary",
    },
    expected: "color.action.primary.background token",
    actual: "missing token evidence",
    confidence: 0.9,
    integrity: {
      hasComponentEvidence: true,
      hasDomEvidence: true,
      hasScreenshotEvidence: true,
      routeMatches: true,
    },
    reasons: [],
  };
}
