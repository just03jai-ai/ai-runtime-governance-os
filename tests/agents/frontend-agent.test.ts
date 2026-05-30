import { describe, expect, it } from "vitest";
import { FrontendAgent, type FrontendInsightFinding } from "../../src/agents/frontend/index.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import {
  RuntimeEvidenceGraphBuilder,
  VerifiedFindingsGraphBuilder,
  mergeGraphs,
} from "../../src/intelligence/knowledge-graph/index.js";
import type { OperationalLogger } from "../../src/shared/logger/index.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("FrontendAgent", () => {
  it("generates deterministic implementation quality insights from graph evidence", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const runtimeGraph = new RuntimeEvidenceGraphBuilder().build(mockRuntimeEvidence, {
      releaseId: "release-001",
      generatedAt,
    });
    const findingsGraph = new VerifiedFindingsGraphBuilder().build(
      [
        componentMisuseFinding("component-001", "warning"),
        variantMisuseFinding("variant-001", "critical"),
        tokenMisuseFinding("token-001", "warning"),
      ],
      {
        releaseId: "release-001",
        generatedAt,
      },
    );
    const graph = mergeGraphs("frontend:test", [runtimeGraph, findingsGraph], generatedAt);

    const report = new FrontendAgent({ logger: silentLogger }).analyze({ graph, generatedAt });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "frontend-insights:frontend:test",
        generatedAt,
        implementationQualityScore: expect.any(Number),
        componentMisuseCount: 1,
        variantMisuseCount: 1,
        tokenMisuseCount: 1,
        highRiskComponentCount: expect.any(Number),
      }),
    );
    expect(report.implementationQualityScore).toBeLessThan(100);
    expect(categories(report.findings)).toEqual([
      "component-misuse",
      "implementation-risk",
      "token-misuse",
      "variant-misuse",
    ]);
    expect(report.findings.every(hasEvidence)).toBe(true);
    expect(report.findings.find((finding) => finding.category === "variant-misuse")).toEqual(
      expect.objectContaining({
        severity: "critical",
        evidence: expect.objectContaining({
          componentIds: ["Button"],
          findingIds: ["verified:runtime-variant-001:core.invalid-component-variant:Button"],
          policyIds: ["core.invalid-component-variant"],
        }),
      }),
    );
    expect(report.findings.find((finding) => finding.category === "token-misuse")).toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          findingIds: expect.arrayContaining(["verified:runtime-token-001:core.token-drift:Button"]),
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

function componentMisuseFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime-${id}:core.component-misuse:Button`,
    severity,
    expected: "approved component implementation",
    actual: "unsupported component misuse with inline style override",
  });
}

function variantMisuseFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime-${id}:core.invalid-component-variant:Button`,
    severity,
    expected: "primary variant uses required tokens",
    actual: "variant token evidence missing",
  });
}

function tokenMisuseFinding(id: string, severity: VerifiedFinding["severity"]): VerifiedFinding {
  return verifiedFinding({
    id: `verified:runtime-${id}:core.token-drift:Button`,
    severity,
    expected: "color.action.primary.background token",
    actual: "missing from runtime token evidence",
  });
}

function verifiedFinding(input: {
  readonly id: string;
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
    component: "Button",
    evidence: {
      componentName: "Button",
      componentId: "component-button-primary",
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

function categories(findings: readonly FrontendInsightFinding[]): readonly string[] {
  return [...new Set(findings.map((finding) => finding.category))].sort();
}

function hasEvidence(finding: FrontendInsightFinding): boolean {
  return (
    finding.evidence.nodeIds.length > 0 ||
    finding.evidence.componentIds.length > 0 ||
    finding.evidence.routes.length > 0 ||
    finding.evidence.findingIds.length > 0 ||
    finding.evidence.policyIds.length > 0 ||
    finding.evidence.tokenNames.length > 0
  );
}
