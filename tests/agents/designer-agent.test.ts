import { describe, expect, it } from "vitest";
import { DesignerAgent, type DesignerInsightFinding } from "../../src/agents/designer/index.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import { ComponentIntelligenceEngine } from "../../src/intelligence/component-intelligence/index.js";
import {
  RuntimeEvidenceGraphBuilder,
  VerifiedFindingsGraphBuilder,
  mergeGraphs,
} from "../../src/intelligence/knowledge-graph/index.js";
import { RouteIntelligenceEngine } from "../../src/intelligence/route-intelligence/index.js";
import type { OperationalLogger } from "../../src/shared/logger/index.js";
import type { RuntimeEvidence } from "../../src/shared/types/runtime-evidence.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("DesignerAgent", () => {
  it("generates deterministic evidence-backed design quality insights", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const runtimeGraph = new RuntimeEvidenceGraphBuilder().build(designRuntimeEvidence(), {
      releaseId: "release-001",
      generatedAt,
    });
    const findingGraph = new VerifiedFindingsGraphBuilder().build(
      [
        typographyFinding("typography-001", "warning"),
        spacingFinding("spacing-001", "warning"),
        accessibilityFinding("accessibility-001", "critical"),
        tokenFinding("token-001", "warning"),
      ],
      {
        releaseId: "release-001",
        generatedAt,
      },
    );
    const graph = mergeGraphs("designer:test", [runtimeGraph, findingGraph], generatedAt);
    const componentHealthReport = new ComponentIntelligenceEngine().analyze(graph, { generatedAt });
    const routeHealthReport = new RouteIntelligenceEngine().analyze(graph, { generatedAt });

    const report = new DesignerAgent({ logger: silentLogger }).analyze({
      graph,
      componentHealthReport,
      routeHealthReport,
      generatedAt,
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "designer-insights:designer:test",
        generatedAt,
        visualGovernanceScore: expect.any(Number),
        typographyScore: expect.any(Number),
        spacingScore: expect.any(Number),
        tokenAdoptionScore: expect.any(Number),
        hierarchyConsistencyScore: expect.any(Number),
        designSystemComplianceScore: expect.any(Number),
      }),
    );
    expect(report.visualGovernanceScore).toBeLessThan(100);
    expect(categories(report.findings)).toEqual([
      "design-system-compliance",
      "hierarchy",
      "spacing",
      "token-adoption",
      "typography",
    ]);
    expect(report.findings.every(hasEvidence)).toBe(true);
    expect(report.findings.find((finding) => finding.category === "typography")).toEqual(
      expect.objectContaining({
        severity: "warning",
        evidence: expect.objectContaining({
          findingIds: ["verified:runtime:core.visual-typography:Heading:typography-001"],
          componentIds: ["Heading"],
        }),
      }),
    );
    expect(report.findings.find((finding) => finding.category === "spacing")).toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          findingIds: ["verified:runtime:core.visual-spacing:Card:spacing-001"],
          componentIds: ["Card"],
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

function designRuntimeEvidence(): RuntimeEvidence {
  return {
    ...mockRuntimeEvidence,
    componentInventory: [
      ...(mockRuntimeEvidence.componentInventory ?? []),
      {
        id: "component-heading-primary",
        name: "Heading",
        tagName: "h1",
        role: "heading",
        label: "Checkout",
        selectorHint: "h1.checkout-title",
        attributes: {
          class: "checkout-title",
        },
        visible: true,
        boundingBox: {
          x: 24,
          y: 20,
          width: 480,
          height: 48,
        },
        source: "dom",
      },
      {
        id: "component-card-summary",
        name: "Card",
        tagName: "section",
        role: "region",
        label: "Summary",
        selectorHint: "section.summary-card",
        attributes: {
          class: "summary-card custom-spacing",
        },
        visible: true,
        boundingBox: {
          x: 24,
          y: 96,
          width: 640,
          height: 360,
        },
        source: "dom",
      },
    ],
    designTokens: [
      {
        name: "font.body",
        value: "Inter",
        category: "typography",
        source: "computed-style",
      },
      {
        name: "color.action.primary.background",
        value: "#2563eb",
        category: "color",
        source: "computed-style",
      },
    ],
  };
}

function typographyFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime:core.visual-typography:Heading:${id}`,
    severity,
    component: "Heading",
    componentId: "component-heading-primary",
    expected: "approved typography.heading token and line-height scale",
    actual: "font size and line-height are manually overridden",
  });
}

function spacingFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime:core.visual-spacing:Card:${id}`,
    severity,
    component: "Card",
    componentId: "component-card-summary",
    expected: "approved spacing.container.padding token",
    actual: "custom margin and padding values outside spacing scale",
  });
}

function accessibilityFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime:core.accessibility:Button:${id}`,
    severity,
    component: "Button",
    componentId: "component-button-primary",
    expected: "accessible label",
    actual: "empty aria label",
  });
}

function tokenFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime:core.token-drift:Button:${id}`,
    severity,
    component: "Button",
    componentId: "component-button-primary",
    expected: "approved design token usage",
    actual: "missing token evidence",
  });
}

function verifiedFinding(input: {
  readonly id: string;
  readonly severity: VerifiedFinding["severity"];
  readonly component: string;
  readonly componentId: string;
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

function categories(findings: readonly DesignerInsightFinding[]): readonly string[] {
  return [...new Set(findings.map((finding) => finding.category))].sort();
}

function hasEvidence(finding: DesignerInsightFinding): boolean {
  return (
    finding.evidence.nodeIds.length > 0 ||
    finding.evidence.componentIds.length > 0 ||
    finding.evidence.routes.length > 0 ||
    finding.evidence.findingIds.length > 0
  );
}
