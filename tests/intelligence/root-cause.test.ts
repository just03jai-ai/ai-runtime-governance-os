import { describe, expect, it } from "vitest";
import type { HistoricalInsights } from "../../src/agents/memory/types.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import {
  RuntimeEvidenceGraphBuilder,
  VerifiedFindingsGraphBuilder,
  mergeGraphs,
} from "../../src/intelligence/knowledge-graph/index.js";
import { RootCauseAnalysisEngine, type RootCauseInsight } from "../../src/intelligence/root-cause/index.js";
import type { RuntimeEvidence } from "../../src/shared/types/runtime-evidence.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("RootCauseAnalysisEngine", () => {
  it("identifies graph-backed systemic causes with historical correlation", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const verifiedFindings = [
      tokenFinding("button-token", "Button", "component-button-primary", "critical"),
      accessibilityFinding("button-a11y", "Button", "component-button-primary", "warning"),
      tokenFinding("input-token", "Input", "component-email-input", "warning"),
    ];
    const runtimeGraph = new RuntimeEvidenceGraphBuilder().build(runtimeEvidence(), {
      releaseId: "release-002",
      generatedAt,
    });
    const findingsGraph = new VerifiedFindingsGraphBuilder().build(verifiedFindings, {
      releaseId: "release-002",
      generatedAt,
    });
    const graph = mergeGraphs("root-cause:test", [runtimeGraph, findingsGraph], generatedAt);

    const report = new RootCauseAnalysisEngine().analyze({
      graph,
      verifiedFindings,
      historicalInsights: historicalInsights(),
      generatedAt,
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "root-cause:root-cause:test",
        generatedAt,
        analyzedFindingCount: 3,
        clusterCount: 3,
        systemicCauseCount: expect.any(Number),
      }),
    );
    expect(categories(report.rootCauses)).toEqual(["component", "policy", "release", "route", "token"]);
    expect(report.clusters.every((cluster) => hasEvidence(cluster.evidence))).toBe(true);
    expect(report.rootCauses.every((cause) => hasEvidence(cause.evidence))).toBe(true);
    expect(report.rootCauses.find((cause) => cause.category === "token")).toEqual(
      expect.objectContaining({
        id: "root-cause:token:color-action-primary-background",
        evidence: expect.objectContaining({
          tokenNames: ["color.action.primary.background"],
          findingIds: expect.arrayContaining([
            "verified:runtime-button-token:core.token-drift:Button",
            "verified:runtime-input-token:core.token-drift:Input",
          ]),
        }),
      }),
    );
    expect(report.rootCauses.find((cause) => cause.category === "component")).toEqual(
      expect.objectContaining({
        id: "root-cause:component:button",
        evidence: expect.objectContaining({
          componentIds: expect.arrayContaining(["Button"]),
          historicalSignals: expect.arrayContaining(["component-history:occurrences:5"]),
        }),
      }),
    );
    expect(report.rootCauses.find((cause) => cause.category === "release")).toEqual(
      expect.objectContaining({
        severity: "critical",
        evidence: expect.objectContaining({
          releaseIds: ["release-002"],
          historicalSignals: expect.arrayContaining(["score-trend:regressing"]),
        }),
      }),
    );
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
  return verifiedFinding({
    id: `verified:runtime-${id}:core.token-drift:${component}`,
    component,
    componentId,
    severity,
    expected: "color.action.primary.background token",
    actual: "token usage is missing or inconsistent",
  });
}

function accessibilityFinding(
  id: string,
  component: string,
  componentId: string,
  severity: VerifiedFinding["severity"],
): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime-${id}:core.accessibility:${component}`,
    component,
    componentId,
    severity,
    expected: "accessible label and focus state",
    actual: "aria label and keyboard focus evidence missing",
  });
}

function verifiedFinding(input: {
  readonly id: string;
  readonly component: string;
  readonly componentId: string;
  readonly severity: VerifiedFinding["severity"];
  readonly expected: string;
  readonly actual: string;
}): VerifiedFinding {
  return {
    id: input.id,
    originalFindingId: input.id.replace("verified:", "original:"),
    status: "verified",
    severity: input.severity,
    route: "https://example.test/checkout",
    component: input.component,
    evidence: {
      componentName: input.component,
      componentId: input.componentId,
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
        signature: "checkout-regression",
        findingId: "verified:runtime-button-token:core.token-drift:Button",
        route: "https://example.test/checkout",
        component: "Button",
        severity: "critical",
        regressionType: "returned-after-clean-run",
        previousCleanRunId: "runtime-001",
        lastSeenRunId: "runtime-002",
      },
    ],
    governanceScoreTrend: {
      points: [
        {
          runId: "runtime-001",
          route: "https://example.test/checkout",
          startedAt: "2026-05-28T00:00:00.000Z",
          score: 92,
        },
        {
          runId: "runtime-current",
          route: "https://example.test/checkout",
          startedAt: "2026-05-30T00:00:00.000Z",
          score: 71,
        },
      ],
      currentScore: 71,
      previousScore: 92,
      delta: -21,
      averageScore: 81.5,
      direction: "regressing",
    },
    routeHistory: [
      {
        route: "https://example.test/checkout",
        routeId: "checkout",
        executionCount: 3,
        latestRunId: "runtime-current",
        latestStartedAt: "2026-05-30T00:00:00.000Z",
        averageGovernanceScore: 81.5,
        totalVerifiedFindings: 8,
        recurringViolationCount: 2,
      },
    ],
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

function categories(rootCauses: readonly RootCauseInsight[]): readonly string[] {
  return [...new Set(rootCauses.map((cause) => cause.category))].sort();
}

function hasEvidence(evidence: {
  readonly nodeIds: readonly string[];
  readonly findingIds: readonly string[];
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly tokenNames: readonly string[];
  readonly policyIds: readonly string[];
  readonly releaseIds: readonly string[];
  readonly historicalSignals: readonly string[];
}): boolean {
  return (
    evidence.nodeIds.length > 0 ||
    evidence.findingIds.length > 0 ||
    evidence.componentIds.length > 0 ||
    evidence.routes.length > 0 ||
    evidence.tokenNames.length > 0 ||
    evidence.policyIds.length > 0 ||
    evidence.releaseIds.length > 0 ||
    evidence.historicalSignals.length > 0
  );
}
