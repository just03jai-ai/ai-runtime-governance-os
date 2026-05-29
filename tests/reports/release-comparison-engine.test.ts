import { describe, expect, it } from "vitest";
import type { DriftAnalysisReport, MemoryExecutionSnapshot } from "../../src/agents/memory/types.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import { ReleaseComparisonEngine } from "../../src/reports/release-comparison/index.js";

describe("ReleaseComparisonEngine", () => {
  it("compares release governance posture deterministically", () => {
    const route = "https://example.test/checkout";
    const resolved = finding("resolved-token", route, "Card", "warning", "spacing.card.md token", "13px");
    const persistentPrevious = finding("persistent-a11y-prev", route, "Button", "critical", "accessible label", "empty aria label");
    const persistentCurrent = finding("persistent-a11y-current", route, "Button", "critical", "accessible label", "empty aria label");
    const newlyIntroduced = finding("new-contract", route, "Link", "warning", "approved component contract", "raw anchor");

    const report = new ReleaseComparisonEngine().compare({
      generatedAt: "2026-05-29T00:00:00.000Z",
      previousExecution: snapshot("release-001", route, 88, [resolved, persistentPrevious]),
      currentExecution: snapshot("release-002", route, 72, [persistentCurrent, newlyIntroduced]),
      previousDriftAnalysis: drift("release-001", 12, 4),
      currentDriftAnalysis: drift("release-002", 28, 16),
    });

    expect(report).toEqual(
      expect.objectContaining({
        reportId: "release-comparison:release-001:release-002",
        previousRunId: "release-001",
        currentRunId: "release-002",
        governanceRegressionDelta: -16,
        improvedGovernance: false,
        regressedGovernance: true,
        releaseRisk: "high",
      }),
    );
    expect(report.newViolations).toEqual([
      expect.objectContaining({
        findingId: "new-contract",
        component: "Link",
      }),
    ]);
    expect(report.resolvedFindings).toEqual([
      expect.objectContaining({
        findingId: "resolved-token",
        component: "Card",
      }),
    ]);
    expect(report.persistentViolations).toEqual([
      expect.objectContaining({
        component: "Button",
        severity: "critical",
      }),
    ]);
    expect(report.routeStability).toEqual([
      expect.objectContaining({
        route,
        previousFindingCount: 2,
        currentFindingCount: 2,
        findingDelta: 0,
        governanceScoreDelta: -16,
        status: "degraded",
      }),
    ]);
    expect(report.driftComparison).toEqual(
      expect.objectContaining({
        previousOverallDriftScore: 12,
        currentOverallDriftScore: 28,
        driftScoreDelta: 16,
        worseningDrift: true,
        improvedDrift: false,
      }),
    );
    expect(report.releaseRiskIndicators).toEqual(
      expect.arrayContaining([
        "1 new violation(s) introduced",
        "1 route(s) degraded",
        "1 violation(s) resolved",
        "drift worsened by 16 point(s)",
        "governance score regressed by 16 point(s)",
      ]),
    );
  });

  it("detects improved governance when findings are resolved and score increases", () => {
    const route = "https://example.test/settings";
    const report = new ReleaseComparisonEngine().compare({
      previousExecution: snapshot("release-001", route, 70, [
        finding("old-critical", route, "Input", "critical", "accessible label", "empty label"),
      ]),
      currentExecution: snapshot("release-002", route, 94, []),
      previousDriftAnalysis: drift("release-001", 30, 20),
      currentDriftAnalysis: drift("release-002", 8, 0),
    });

    expect(report.improvedGovernance).toBe(true);
    expect(report.regressedGovernance).toBe(false);
    expect(report.resolvedFindings).toHaveLength(1);
    expect(report.newViolations).toEqual([]);
    expect(report.routeStability[0]).toEqual(expect.objectContaining({ status: "improved" }));
    expect(report.driftComparison.improvedDrift).toBe(true);
    expect(report.releaseRisk).toBe("low");
    expect(report.releaseRiskIndicators).toEqual(expect.arrayContaining(["release improved governance posture"]));
  });
});

function snapshot(
  runId: string,
  route: string,
  governanceScore: number,
  verifiedFindings: readonly VerifiedFinding[],
): MemoryExecutionSnapshot {
  return {
    metadata: {
      runId,
      route,
      governanceScore,
      status: "passed",
      startedAt: "2026-05-29T00:00:00.000Z",
    },
    verifiedFindings,
  };
}

function finding(
  id: string,
  route: string,
  component: string,
  severity: VerifiedFinding["severity"],
  expected: string,
  actual: string,
): VerifiedFinding {
  return {
    id,
    originalFindingId: id,
    status: "verified",
    severity,
    route,
    component,
    evidence: { componentId: component },
    expected,
    actual,
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

function drift(runId: string, overallDriftScore: number, degradationAmount: number): DriftAnalysisReport {
  return {
    reportId: `drift:${runId}`,
    runId,
    generatedAt: "2026-05-29T00:00:00.000Z",
    analyzedExecutionCount: 1,
    overallDriftScore,
    governanceScoreDegradation: {
      degraded: degradationAmount > 0,
      degradationAmount,
      trend: {
        direction: degradationAmount > 0 ? "decreasing" : "stable",
        currentValue: degradationAmount,
      },
    },
    executionTimeline: [],
    routeDrift: [],
    componentDrift: [],
    tokenDriftEvolution: [],
    accessibilityDrift: [],
    degradationIndicators: [],
  };
}
