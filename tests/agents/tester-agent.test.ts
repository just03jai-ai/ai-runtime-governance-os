import { describe, expect, it } from "vitest";
import { TesterAgent, TestingScenarioEngine, type TestingInsightFinding } from "../../src/agents/tester/index.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import {
  RuntimeEvidenceGraphBuilder,
  VerifiedFindingsGraphBuilder,
  mergeGraphs,
} from "../../src/intelligence/knowledge-graph/index.js";
import type { OperationalLogger } from "../../src/shared/logger/index.js";
import type { RuntimeEvidence } from "../../src/shared/types/runtime-evidence.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("TesterAgent", () => {
  it("generates deterministic evidence-backed testing insights and reusable scenarios", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const runtimeEvidence = testingRuntimeEvidence();
    const runtimeGraph = new RuntimeEvidenceGraphBuilder().build(runtimeEvidence, {
      releaseId: "release-001",
      generatedAt,
    });
    const findingsGraph = new VerifiedFindingsGraphBuilder().build(
      [accessibilityFinding("accessibility-001", "critical"), tokenFinding("token-001", "warning")],
      {
        releaseId: "release-001",
        generatedAt,
      },
    );
    const graph = mergeGraphs("tester:test", [runtimeGraph, findingsGraph], generatedAt);

    const scenarioEngine = new TestingScenarioEngine();
    const scenarios = scenarioEngine.buildScenarios({ graph, runtimeEvidence, generatedAt });
    const report = new TesterAgent({ logger: silentLogger, scenarioEngine }).analyze({
      graph,
      runtimeEvidence,
      generatedAt,
    });

    expect(scenarios.length).toBeGreaterThan(0);
    expect(report).toEqual(
      expect.objectContaining({
        reportId: "testing-insights:tester:test:runtime_test_001",
        generatedAt,
        testingReadinessScore: expect.any(Number),
        scenarioCount: scenarios.length,
        highRiskScenarioCount: expect.any(Number),
      }),
    );
    expect(report.testingReadinessScore).toBeLessThan(100);
    expect(categories(report.findings)).toEqual([
      "accessibility-scenario-coverage",
      "edge-case-discovery",
      "interaction-coverage",
      "risk-prioritization",
      "state-coverage",
    ]);
    expect(report.findings.every(hasEvidence)).toBe(true);
    expect(report.scenarios.every((scenario) => scenario.evidence.scenarioIds.length > 0)).toBe(true);
    expect(report.findings.find((finding) => finding.category === "interaction-coverage")).toEqual(
      expect.objectContaining({
        severity: "critical",
        evidence: expect.objectContaining({
          componentIds: expect.arrayContaining(["component-button-primary"]),
          runtimeEvidenceIds: expect.arrayContaining(["component-button-primary"]),
        }),
      }),
    );
    expect(report.findings.find((finding) => finding.category === "accessibility-scenario-coverage")).toEqual(
      expect.objectContaining({
        severity: "critical",
        evidence: expect.objectContaining({
          findingIds: ["verified:runtime-accessibility-001:core.accessibility:Button"],
        }),
      }),
    );
  });
});

const silentLogger: OperationalLogger = {
  start: () => ({ operation: "test", correlationId: "test", startedAt: "2026-05-30T00:00:00.000Z" }),
  complete: () => undefined,
  fail: () => undefined,
  event: () => undefined,
};

function testingRuntimeEvidence(): RuntimeEvidence {
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
          "aria-invalid": "true",
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
    accessibilityFindings: [
      {
        id: "a11y-empty-label",
        ruleId: "button-name",
        severity: "critical",
        message: "Button must have accessible text",
        selectorHint: "button.primary.danger",
        deterministic: true,
      },
    ],
    telemetry: [
      {
        eventId: "telemetry-navigation",
        type: "page.navigation.completed",
        timestamp: "2026-05-28T00:00:01.000Z",
        metadata: {
          url: "https://example.test/checkout",
        },
      },
    ],
  };
}

function accessibilityFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime-${id}:core.accessibility:Button`,
    severity,
    expected: "accessible label and keyboard operation",
    actual: "empty aria label blocks keyboard announcement",
  });
}

function tokenFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime-${id}:core.token-drift:Input`,
    severity,
    component: "Input",
    componentId: "component-email-input",
    expected: "approved input state token",
    actual: "error state token missing",
  });
}

function verifiedFinding(input: {
  readonly id: string;
  readonly severity: VerifiedFinding["severity"];
  readonly expected: string;
  readonly actual: string;
  readonly component?: string | undefined;
  readonly componentId?: string | undefined;
}): VerifiedFinding {
  const component = input.component ?? "Button";
  const componentId = input.componentId ?? "component-button-primary";
  return {
    id: input.id,
    originalFindingId: input.id.replace("verified:", "original:"),
    status: "verified",
    severity: input.severity,
    route: "https://example.test/checkout",
    component,
    evidence: {
      componentName: component,
      componentId,
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

function categories(findings: readonly TestingInsightFinding[]): readonly string[] {
  return [...new Set(findings.map((finding) => finding.category))].sort();
}

function hasEvidence(finding: TestingInsightFinding): boolean {
  return (
    finding.evidence.nodeIds.length > 0 ||
    finding.evidence.componentIds.length > 0 ||
    finding.evidence.routes.length > 0 ||
    finding.evidence.findingIds.length > 0 ||
    finding.evidence.runtimeEvidenceIds.length > 0 ||
    finding.evidence.scenarioIds.length > 0
  );
}
