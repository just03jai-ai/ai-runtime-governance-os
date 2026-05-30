import { describe, expect, it } from "vitest";
import type { HistoricalInsights } from "../../src/agents/memory/types.js";
import { SimulationAgent, type SimulationForecast } from "../../src/agents/simulation/index.js";
import type { OperationalLogger } from "../../src/shared/logger/index.js";
import type { SimulationReport } from "../../src/intelligence/simulation/index.js";

describe("SimulationAgent", () => {
  it("creates evidence-backed governance forecasts from simulation output", () => {
    const generatedAt = "2026-05-30T00:00:00.000Z";
    const insights = new SimulationAgent({ logger: silentLogger }).analyze({
      simulationReport: simulationReport(),
      historicalInsights: historicalInsights(),
      generatedAt,
    });

    expect(insights).toEqual(
      expect.objectContaining({
        reportId: "simulation-insights:simulation:simulation:test",
        generatedAt,
        overallRiskScore: expect.any(Number),
        overallConfidence: expect.any(Number),
        forecastCount: 4,
      }),
    );
    expect(categories(insights.forecasts)).toEqual(["drift", "governance-risk", "regression", "release"]);
    expect(insights.forecasts.every(hasEvidence)).toBe(true);
    expect(insights.forecasts.find((forecast) => forecast.category === "regression")).toEqual(
      expect.objectContaining({
        direction: expect.stringMatching(/stable|worsening/),
        evidence: expect.objectContaining({
          changeIds: expect.arrayContaining(["change-1:token:color-action-primary-background"]),
          historicalSignals: expect.arrayContaining(["regression:core.token-drift:Button"]),
        }),
      }),
    );
    expect(insights.forecasts.find((forecast) => forecast.category === "drift")).toEqual(
      expect.objectContaining({
        evidence: expect.objectContaining({
          tokens: ["color.action.primary.background"],
        }),
        explanation: expect.arrayContaining(["token-signals:1"]),
      }),
    );
    expect(insights.summary).toContain("governance risk");
  });
});

const silentLogger: OperationalLogger = {
  start: () => ({ operation: "test", correlationId: "test", startedAt: "2026-05-30T00:00:00.000Z" }),
  complete: () => undefined,
  fail: () => undefined,
  event: () => undefined,
};

function simulationReport(): SimulationReport {
  return {
    reportId: "simulation:simulation:test",
    generatedAt: "2026-05-30T00:00:00.000Z",
    graphId: "simulation:test",
    changeCount: 3,
    overallBlastRadiusScore: 44,
    overallReleaseImpactScore: 58,
    recommendations: [
      "change-1:token:color-action-primary-background: require release readiness review before implementation.",
    ],
    impactEstimates: [
      {
        changeId: "change-1:token:color-action-primary-background",
        changeType: "token-change",
        blastRadiusScore: 62,
        releaseImpactScore: 74,
        confidence: 0.9,
        summary: "Changing token color.action.primary.background affects two components.",
        explanation: ["token:color.action.primary.background", "historical-signals:2"],
        evidence: {
          nodeIds: ["token:color.action.primary.background"],
          componentIds: ["Button", "Input"],
          routes: ["https://example.test/checkout"],
          tokenNames: ["color.action.primary.background"],
          policyIds: ["core.token-drift"],
          findingIds: ["verified:runtime-button-token:core.token-drift:Button"],
          releaseIds: ["release-002"],
          historicalSignals: [
            "recurring-token:core.token-drift:color.action.primary.background:4",
            "regression-token:core.token-drift:Button",
          ],
        },
      },
      {
        changeId: "change-2:component:button-to-button",
        changeType: "component-migration",
        blastRadiusScore: 35,
        releaseImpactScore: 47,
        confidence: 0.82,
        summary: "Migrating Button affects checkout.",
        explanation: ["from-component:Button"],
        evidence: {
          nodeIds: ["component:button"],
          componentIds: ["Button"],
          routes: ["https://example.test/checkout"],
          tokenNames: [],
          policyIds: ["core.accessibility"],
          findingIds: ["verified:runtime-a11y:core.accessibility:Button"],
          releaseIds: ["release-002"],
          historicalSignals: ["component-history:Button:5"],
        },
      },
    ],
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

function categories(forecasts: readonly SimulationForecast[]): readonly string[] {
  return [...new Set(forecasts.map((forecast) => forecast.category))].sort();
}

function hasEvidence(forecast: SimulationForecast): boolean {
  return (
    forecast.evidence.simulationReportId.length > 0 &&
    forecast.evidence.historicalRunId.length > 0 &&
    (forecast.evidence.changeIds.length > 0 ||
      forecast.evidence.findingIds.length > 0 ||
      forecast.evidence.routes.length > 0 ||
      forecast.evidence.components.length > 0 ||
      forecast.evidence.tokens.length > 0 ||
      forecast.evidence.policies.length > 0 ||
      forecast.evidence.historicalSignals.length > 0)
  );
}
