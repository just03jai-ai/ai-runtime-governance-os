import { describe, expect, it } from "vitest";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import {
  RouteIntelligenceEngine,
} from "../../src/intelligence/route-intelligence/index.js";
import {
  RuntimeEvidenceGraphBuilder,
  VerifiedFindingsGraphBuilder,
  mergeGraphs,
} from "../../src/intelligence/knowledge-graph/index.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("RouteIntelligenceEngine", () => {
  it("generates route-level governance intelligence and risk ranking", () => {
    const runtimeGraph = new RuntimeEvidenceGraphBuilder().build(mockRuntimeEvidence, {
      releaseId: "release-001",
      generatedAt: "2026-05-29T00:00:00.000Z",
    });
    const previousFindingsGraph = new VerifiedFindingsGraphBuilder().build([tokenFinding("previous-token")], {
      releaseId: "release-001",
      generatedAt: "2026-05-29T00:00:00.000Z",
    });
    const currentFindingsGraph = new VerifiedFindingsGraphBuilder().build(
      [tokenFinding("current-token"), accessibilityFinding()],
      {
        releaseId: "release-002",
        generatedAt: "2026-05-29T00:00:00.000Z",
      },
    );
    const graph = mergeGraphs(
      "route-intelligence:test",
      [runtimeGraph, previousFindingsGraph, currentFindingsGraph],
      "2026-05-29T00:00:00.000Z",
    );

    const report = new RouteIntelligenceEngine().analyze(graph, {
      generatedAt: "2026-05-29T00:00:00.000Z",
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "route-health:route-intelligence:test",
        generatedAt: "2026-05-29T00:00:00.000Z",
        routeCount: 1,
        degradedRouteCount: 1,
      }),
    );
    expect(report.routes[0]).toEqual(
      expect.objectContaining({
        route: "https://example.test/checkout",
        componentCount: 2,
        findingCount: 3,
        violationDensity: 1.5,
        degradationTrend: "regressing",
        riskRank: 1,
        riskLevel: expect.stringMatching(/high|critical/),
        severity: {
          critical: 1,
          warning: 2,
          info: 0,
          total: 3,
        },
      }),
    );
    expect(report.routes[0]?.historicalDegradation).toEqual([
      expect.objectContaining({
        releaseId: "release-001",
        findingCount: 1,
      }),
      expect.objectContaining({
        releaseId: "release-002",
        findingCount: 2,
      }),
    ]);
    expect(report.routes[0]?.accessibilityHealthScore).toBeLessThan(100);
    expect(report.averageGovernanceScore).toBe(report.routes[0]?.governanceScore);
  });
});

function accessibilityFinding(): VerifiedFinding {
  return {
    id: "verified:runtime-002:core.accessibility:Button",
    originalFindingId: "original:runtime-002:core.accessibility:Button",
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

function tokenFinding(id: string): VerifiedFinding {
  return {
    id: `verified:runtime:core.token-drift:Button:${id}`,
    originalFindingId: `original:runtime:core.token-drift:Button:${id}`,
    status: "verified",
    severity: "warning",
    route: "https://example.test/checkout",
    component: "Button",
    evidence: {
      componentName: "Button",
      componentId: "component-button-primary",
    },
    expected: "color.action.primary.background token",
    actual: `missing token evidence ${id}`,
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
