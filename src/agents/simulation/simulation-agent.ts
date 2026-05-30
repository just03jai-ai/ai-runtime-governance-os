import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type { HistoricalInsights } from "../memory/types.js";
import type { SimulationImpactEstimate, SimulationReport } from "../../intelligence/simulation/index.js";

export type SimulationForecastCategory = "release" | "regression" | "drift" | "governance-risk";
export type SimulationForecastDirection = "improving" | "stable" | "worsening";

export interface SimulationForecastEvidence {
  readonly simulationReportId: string;
  readonly historicalRunId: string;
  readonly changeIds: readonly string[];
  readonly findingIds: readonly string[];
  readonly routes: readonly string[];
  readonly components: readonly string[];
  readonly tokens: readonly string[];
  readonly policies: readonly string[];
  readonly historicalSignals: readonly string[];
}

export interface SimulationForecast {
  readonly id: string;
  readonly category: SimulationForecastCategory;
  readonly direction: SimulationForecastDirection;
  readonly riskScore: number;
  readonly confidence: number;
  readonly summary: string;
  readonly explanation: readonly string[];
  readonly evidence: SimulationForecastEvidence;
}

export interface SimulationInsights {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly overallRiskScore: number;
  readonly overallConfidence: number;
  readonly forecastCount: number;
  readonly forecasts: readonly SimulationForecast[];
  readonly summary: string;
}

export interface SimulationAgentRequest {
  readonly simulationReport: SimulationReport;
  readonly historicalInsights: HistoricalInsights;
  readonly generatedAt?: string | undefined;
}

export interface SimulationAgentDependencies {
  readonly logger?: OperationalLogger | undefined;
}

export class SimulationAgent {
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: SimulationAgentDependencies = {}) {
    this.logger = dependencies.logger ?? createAgentLogger("SimulationAgent");
  }

  analyze(request: SimulationAgentRequest): SimulationInsights {
    const generatedAt = request.generatedAt ?? new Date().toISOString();
    const trace = this.logger.start("simulation.forecast", {
      correlationId: `simulation:${generatedAt}`,
      metadata: {
        simulationReportId: request.simulationReport.reportId,
        changeCount: request.simulationReport.changeCount,
        historicalExecutionCount: request.historicalInsights.analyzedExecutionCount,
      },
    });

    try {
      const forecasts = [
        releaseForecast(request),
        regressionForecast(request),
        driftForecast(request),
        governanceRiskForecast(request),
      ].filter(hasEvidence)
        .sort((left, right) => right.riskScore - left.riskScore || left.id.localeCompare(right.id));
      const overallRiskScore = clampScore(average(forecasts.map((forecast) => forecast.riskScore)));
      const overallConfidence = Number(average(forecasts.map((forecast) => forecast.confidence * 100)) / 100);
      const insights = {
        reportId: `simulation-insights:${request.simulationReport.reportId}`,
        generatedAt,
        overallRiskScore,
        overallConfidence,
        forecastCount: forecasts.length,
        forecasts,
        summary: `Simulation forecasts ${riskLabel(overallRiskScore)} governance risk across ${request.simulationReport.changeCount} proposed change(s).`,
      };

      this.logger.complete(trace, {
        forecastCount: forecasts.length,
        overallRiskScore,
        overallConfidence,
      });

      return insights;
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }
}

function releaseForecast(request: SimulationAgentRequest): SimulationForecast {
  const highImpact = request.simulationReport.impactEstimates.filter((estimate) => estimate.releaseImpactScore >= 55);
  const estimates = highImpact.length > 0 ? highImpact : request.simulationReport.impactEstimates;
  const riskScore = clampScore(
    request.simulationReport.overallReleaseImpactScore +
      highImpact.length * 8 +
      (request.historicalInsights.governanceScoreTrend.direction === "regressing" ? 10 : 0),
  );
  return forecast({
    id: "simulation.forecast.release",
    category: "release",
    riskScore,
    estimates,
    request,
    summary: `Release impact forecast is ${riskLabel(riskScore)} with ${highImpact.length} high-impact simulated change(s).`,
    explanation: [
      `overall-release-impact:${request.simulationReport.overallReleaseImpactScore}`,
      `high-impact-changes:${highImpact.length}`,
      `governance-trend:${request.historicalInsights.governanceScoreTrend.direction}`,
    ],
  });
}

function regressionForecast(request: SimulationAgentRequest): SimulationForecast {
  const regressionEstimates = request.simulationReport.impactEstimates.filter((estimate) =>
    estimate.evidence.historicalSignals.some((signal) => signal.includes("regression")) ||
    estimate.evidence.findingIds.some((findingId) => request.historicalInsights.regressions.some((regression) => regression.findingId === findingId)),
  );
  const estimates = regressionEstimates.length > 0 ? regressionEstimates : request.simulationReport.impactEstimates;
  const riskScore = clampScore(
    average(estimates.map((estimate) => estimate.releaseImpactScore)) +
      request.historicalInsights.regressions.length * 10 +
      regressionEstimates.length * 8,
  );

  return forecast({
    id: "simulation.forecast.regression",
    category: "regression",
    riskScore,
    estimates,
    request,
    summary: `Regression forecast is ${riskLabel(riskScore)} based on ${request.historicalInsights.regressions.length} historical regression(s).`,
    explanation: [
      `historical-regressions:${request.historicalInsights.regressions.length}`,
      `regression-linked-changes:${regressionEstimates.length}`,
    ],
  });
}

function driftForecast(request: SimulationAgentRequest): SimulationForecast {
  const driftEstimates = request.simulationReport.impactEstimates.filter((estimate) =>
    estimate.changeType === "token-change" ||
    estimate.evidence.historicalSignals.some((signal) => signal.includes("token") || signal.includes("drift")),
  );
  const estimates = driftEstimates.length > 0 ? driftEstimates : request.simulationReport.impactEstimates;
  const tokenSignalCount = unique(estimates.flatMap((estimate) => estimate.evidence.tokenNames)).length;
  const riskScore = clampScore(
    average(estimates.map((estimate) => estimate.blastRadiusScore)) +
      tokenSignalCount * 8 +
      request.historicalInsights.recurringViolations.filter((violation) => violation.signature.includes("token")).length * 8,
  );

  return forecast({
    id: "simulation.forecast.drift",
    category: "drift",
    riskScore,
    estimates,
    request,
    summary: `Drift forecast is ${riskLabel(riskScore)} across ${tokenSignalCount} token signal(s).`,
    explanation: [
      `token-signals:${tokenSignalCount}`,
      `drift-linked-changes:${driftEstimates.length}`,
      `recurring-token-violations:${request.historicalInsights.recurringViolations.filter((violation) => violation.signature.includes("token")).length}`,
    ],
  });
}

function governanceRiskForecast(request: SimulationAgentRequest): SimulationForecast {
  const estimates = request.simulationReport.impactEstimates;
  const recurringCount = request.historicalInsights.recurringViolations.length;
  const componentFailureCount = request.historicalInsights.componentFailureFrequency.length;
  const riskScore = clampScore(
    request.simulationReport.overallReleaseImpactScore * 0.55 +
      request.simulationReport.overallBlastRadiusScore * 0.35 +
      recurringCount * 5 +
      componentFailureCount * 4,
  );

  return forecast({
    id: "simulation.forecast.governance-risk",
    category: "governance-risk",
    riskScore,
    estimates,
    request,
    summary: `Governance risk forecast is ${riskLabel(riskScore)} with ${recurringCount} recurring historical signal(s).`,
    explanation: [
      `overall-release-impact:${request.simulationReport.overallReleaseImpactScore}`,
      `overall-blast-radius:${request.simulationReport.overallBlastRadiusScore}`,
      `recurring-violations:${recurringCount}`,
      `component-failure-frequency:${componentFailureCount}`,
    ],
  });
}

function forecast(input: {
  readonly id: string;
  readonly category: SimulationForecastCategory;
  readonly riskScore: number;
  readonly estimates: readonly SimulationImpactEstimate[];
  readonly request: SimulationAgentRequest;
  readonly summary: string;
  readonly explanation: readonly string[];
}): SimulationForecast {
  const evidence = evidenceFor(input.request, input.estimates);
  return {
    id: input.id,
    category: input.category,
    direction: directionFor(input.riskScore),
    riskScore: input.riskScore,
    confidence: confidenceFor(input.estimates, input.request.historicalInsights),
    summary: input.summary,
    explanation: input.explanation,
    evidence,
  };
}

function evidenceFor(
  request: SimulationAgentRequest,
  estimates: readonly SimulationImpactEstimate[],
): SimulationForecastEvidence {
  return {
    simulationReportId: request.simulationReport.reportId,
    historicalRunId: request.historicalInsights.runId,
    changeIds: unique(estimates.map((estimate) => estimate.changeId)),
    findingIds: unique(estimates.flatMap((estimate) => estimate.evidence.findingIds)),
    routes: unique(estimates.flatMap((estimate) => estimate.evidence.routes)),
    components: unique(estimates.flatMap((estimate) => estimate.evidence.componentIds)),
    tokens: unique(estimates.flatMap((estimate) => estimate.evidence.tokenNames)),
    policies: unique(estimates.flatMap((estimate) => estimate.evidence.policyIds)),
    historicalSignals: unique([
      ...estimates.flatMap((estimate) => estimate.evidence.historicalSignals),
      ...request.historicalInsights.recurringViolations.map((violation) => `recurring:${violation.signature}:${violation.occurrenceCount}`),
      ...request.historicalInsights.regressions.map((regression) => `regression:${regression.signature}`),
    ]),
  };
}

function confidenceFor(estimates: readonly SimulationImpactEstimate[], historicalInsights: HistoricalInsights): number {
  const simulationConfidence = estimates.length === 0 ? 0 : average(estimates.map((estimate) => estimate.confidence * 100)) / 100;
  const historyConfidence = historicalInsights.analyzedExecutionCount >= 3 ? 0.15 : historicalInsights.analyzedExecutionCount > 0 ? 0.08 : 0;
  const signalConfidence = Math.min(0.12, (historicalInsights.recurringViolations.length + historicalInsights.regressions.length) * 0.03);
  return Number(Math.min(1, simulationConfidence * 0.75 + historyConfidence + signalConfidence).toFixed(2));
}

function directionFor(riskScore: number): SimulationForecastDirection {
  if (riskScore >= 60) {
    return "worsening";
  }
  if (riskScore >= 30) {
    return "stable";
  }
  return "improving";
}

function riskLabel(riskScore: number): string {
  if (riskScore >= 75) {
    return "critical";
  }
  if (riskScore >= 55) {
    return "high";
  }
  if (riskScore >= 30) {
    return "moderate";
  }
  return "low";
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

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
