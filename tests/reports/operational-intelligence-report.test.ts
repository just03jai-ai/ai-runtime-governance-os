import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { DriftAnalysisReport, HistoricalInsights, MemoryExecutionSnapshot } from "../../src/agents/memory/types.js";
import type { MonitoringInsights } from "../../src/agents/monitoring/monitoring-agent.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import type { GovernanceScore } from "../../src/governance/scoring/governance-scoring-engine.js";
import {
  buildOperationalIntelligenceReport,
  OperationalIntelligenceReportGenerator,
} from "../../src/reports/operational-intelligence/index.js";

let tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  tempDirectories = [];
});

describe("operational intelligence reports", () => {
  it("builds operational intelligence sections from governance history", () => {
    const route = "https://example.test/checkout";
    const criticalFinding = finding("critical-a11y", route, "Button", "critical", "accessible label", "empty aria label");
    const report = buildOperationalIntelligenceReport({
      generatedAt: "2026-05-29T00:00:00.000Z",
      verifiedFindings: [criticalFinding],
      historicalExecutions: [
        snapshot("run-001", route, "2026-05-27T00:00:00.000Z", 94, []),
        snapshot("run-002", route, "2026-05-28T00:00:00.000Z", 82, [criticalFinding]),
      ],
      historicalInsights: historicalInsights(route),
      driftAnalysis: driftAnalysis(route),
      monitoringInsights: monitoringInsights(route),
      governanceScore: governanceScore(),
      executionMetrics: [
        {
          stage: "execution",
          status: "passed",
          startedAt: "2026-05-29T00:00:00.000Z",
          completedAt: "2026-05-29T00:00:01.000Z",
          durationMs: 800,
          attempts: 1,
        },
      ],
    });

    expect(report.operationalOverview).toEqual(
      expect.objectContaining({
        monitoredExecutionCount: 2,
        routeCount: 1,
        activeFindingCount: 1,
        governanceQualityScore: 62,
        releaseRisk: "critical",
      }),
    );
    expect(report.governanceTrends).toEqual(
      expect.objectContaining({
        direction: "regressing",
        currentScore: 82,
        previousScore: 94,
        delta: -12,
      }),
    );
    expect(report.recurringViolations.totalRecurringViolationCount).toBe(1);
    expect(report.routeHealth[0]?.route).toBe(route);
    expect(report.accessibilityHealth).toEqual(
      expect.objectContaining({
        violationCount: 1,
        affectedComponents: ["Button"],
        driftScore: 25,
      }),
    );
    expect(report.componentStability.components[0]).toEqual(
      expect.objectContaining({
        component: "Button",
        occurrenceCount: 2,
      }),
    );
    expect(report.driftAnalysis).toEqual(
      expect.objectContaining({
        overallDriftScore: 32,
        governanceScoreDegraded: true,
        governanceScoreDegradationAmount: 12,
        accessibilityDriftCount: 1,
      }),
    );
  });

  it("generates JSON and HTML operational reports", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "ops-intel-"));
    tempDirectories.push(outputDirectory);
    const route = "https://example.test/checkout";
    const findingInput = finding("critical-a11y", route, "Button", "critical", "accessible label", "empty aria label");

    const result = await new OperationalIntelligenceReportGenerator(undefined, undefined, { outputDirectory }).generate({
      generatedAt: "2026-05-29T00:00:00.000Z",
      verifiedFindings: [findingInput],
      historicalExecutions: [snapshot("run-001", route, "2026-05-29T00:00:00.000Z", 62, [findingInput])],
      historicalInsights: historicalInsights(route),
      driftAnalysis: driftAnalysis(route),
      monitoringInsights: monitoringInsights(route),
      governanceScore: governanceScore(),
    });

    const json = await readFile(result.jsonPath, "utf8");
    const html = await readFile(result.htmlPath, "utf8");

    expect(JSON.parse(json)).toEqual(
      expect.objectContaining({
        reportId: "operational-intelligence:2026-05-29T00:00:00.000Z",
      }),
    );
    expect(html).toContain("Operational Intelligence Report");
    expect(html).toContain("Governance Trends");
    expect(html).toContain("Drift Analysis");
  });
});

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

function snapshot(
  runId: string,
  route: string,
  startedAt: string,
  governanceScore: number,
  verifiedFindings: readonly VerifiedFinding[],
): MemoryExecutionSnapshot {
  return {
    metadata: {
      runId,
      route,
      startedAt,
      governanceScore,
      status: "passed",
    },
    verifiedFindings,
  };
}

function historicalInsights(route: string): HistoricalInsights {
  return {
    runId: "run-002",
    generatedAt: "2026-05-29T00:00:00.000Z",
    analyzedExecutionCount: 2,
    recurringViolations: [
      {
        signature: "Button:accessible-label",
        route,
        component: "Button",
        severity: "critical",
        occurrenceCount: 2,
        affectedRunIds: ["run-001", "run-002"],
        firstSeenAt: "2026-05-27T00:00:00.000Z",
        lastSeenAt: "2026-05-28T00:00:00.000Z",
        currentFindingIds: ["critical-a11y"],
      },
    ],
    regressions: [],
    governanceScoreTrend: {
      points: [
        { runId: "run-001", route, startedAt: "2026-05-27T00:00:00.000Z", score: 94 },
        { runId: "run-002", route, startedAt: "2026-05-28T00:00:00.000Z", score: 82 },
      ],
      currentScore: 82,
      previousScore: 94,
      delta: -12,
      averageScore: 88,
      direction: "regressing",
    },
    routeHistory: [],
    componentFailureFrequency: [
      {
        component: "Button",
        occurrenceCount: 2,
        affectedRunCount: 2,
        affectedRoutes: [route],
        highestSeverity: "critical",
        latestSeenAt: "2026-05-28T00:00:00.000Z",
      },
    ],
  };
}

function driftAnalysis(route: string): DriftAnalysisReport {
  return {
    reportId: "drift:run-002",
    runId: "run-002",
    generatedAt: "2026-05-29T00:00:00.000Z",
    analyzedExecutionCount: 2,
    overallDriftScore: 32,
    governanceScoreDegradation: {
      degraded: true,
      degradationAmount: 12,
      trend: {
        direction: "decreasing",
        firstValue: 94,
        previousValue: 94,
        currentValue: 82,
        deltaFromPrevious: -12,
        deltaFromBaseline: -12,
      },
    },
    executionTimeline: [],
    routeDrift: [],
    componentDrift: [],
    tokenDriftEvolution: [],
    accessibilityDrift: [
      {
        route,
        violationTrend: {
          direction: "increasing",
          firstValue: 0,
          previousValue: 0,
          currentValue: 1,
          deltaFromPrevious: 1,
          deltaFromBaseline: 1,
        },
        affectedComponents: ["Button"],
        driftScore: 25,
        degradationIndicators: [`${route} accessibility drift increased by 1`],
      },
    ],
    degradationIndicators: ["governance score degraded by 12 points"],
  };
}

function monitoringInsights(route: string): MonitoringInsights {
  return {
    reportId: "monitoring:test",
    generatedAt: "2026-05-29T00:00:00.000Z",
    monitoredExecutionCount: 2,
    governanceHealth: {
      score: 62,
      status: "degraded",
      latestGovernanceScore: 62,
      degradationPenalty: 12,
      severityPenalty: 12,
      driftPenalty: 8,
    },
    executionReliability: {
      score: 100,
      status: "healthy",
      stageCount: 1,
      passedStageCount: 1,
      failedStageCount: 0,
      passRate: 1,
      retryCount: 0,
      totalDurationMs: 800,
    },
    severityDistribution: {
      critical: 1,
      warning: 0,
      info: 0,
      total: 1,
    },
    routeHealth: [
      {
        route,
        executionCount: 2,
        latestRunId: "run-002",
        latestStartedAt: "2026-05-28T00:00:00.000Z",
        status: "degraded",
        healthScore: 62,
        latestGovernanceScore: 62,
        severityDistribution: {
          critical: 1,
          warning: 0,
          info: 0,
          total: 1,
        },
        activeFindingCount: 1,
        driftScore: 25,
      },
    ],
    operationalTrends: [],
    monitoringSnapshots: [],
    observabilitySignals: [],
  };
}

function governanceScore(): GovernanceScore {
  return {
    score: 62,
    status: "degraded",
    severity: {
      critical: 1,
      warning: 0,
      info: 0,
      total: 1,
    },
    factors: [],
    routeScores: [],
    executionScore: {
      score: 100,
      stageCount: 1,
      failedStageCount: 0,
      retryCount: 0,
      totalDurationMs: 800,
      penalties: [],
    },
    historicalTrend: {
      score: 62,
      direction: "regressing",
      currentScore: 62,
      previousScore: 74,
      delta: -12,
      degradationPenalty: 12,
    },
    degradationPenalties: [],
    weights: {
      criticalFinding: 14,
      warningFinding: 5,
      infoFinding: 1,
      accessibilityViolation: 8,
      tokenDrift: 4,
      componentMisuse: 3,
      recurringRegression: 8,
      lowVerificationConfidence: 6,
      failedExecutionStage: 10,
      retryAttempt: 3,
      scoreDegradationPoint: 1,
      driftScoreMultiplier: 0.25,
    },
  };
}
