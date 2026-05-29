import { violationSignature } from "../../agents/memory/violation-signature.js";
import type { DriftAnalysisReport, MemoryExecutionSnapshot } from "../../agents/memory/types.js";
import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { SeverityLevel } from "../../shared/types/severity.js";

export interface ReleaseComparisonInput {
  readonly previousExecution: MemoryExecutionSnapshot;
  readonly currentExecution: MemoryExecutionSnapshot;
  readonly previousDriftAnalysis?: DriftAnalysisReport | undefined;
  readonly currentDriftAnalysis?: DriftAnalysisReport | undefined;
  readonly generatedAt?: string | undefined;
}

export interface ReleaseFindingDelta {
  readonly signature: string;
  readonly findingId: string;
  readonly route: string;
  readonly component: string;
  readonly severity: SeverityLevel;
  readonly expected: string;
  readonly actual: string;
}

export interface ReleaseRouteStability {
  readonly route: string;
  readonly previousFindingCount: number;
  readonly currentFindingCount: number;
  readonly findingDelta: number;
  readonly previousGovernanceScore?: number | undefined;
  readonly currentGovernanceScore?: number | undefined;
  readonly governanceScoreDelta?: number | undefined;
  readonly status: "improved" | "stable" | "degraded" | "new-route" | "resolved-route";
}

export interface ReleaseDriftComparison {
  readonly previousOverallDriftScore?: number | undefined;
  readonly currentOverallDriftScore?: number | undefined;
  readonly driftScoreDelta?: number | undefined;
  readonly worseningDrift: boolean;
  readonly improvedDrift: boolean;
  readonly previousGovernanceScoreDegradation?: number | undefined;
  readonly currentGovernanceScoreDegradation?: number | undefined;
}

export interface ReleaseComparisonReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly previousRunId: string;
  readonly currentRunId: string;
  readonly governanceRegressionDelta?: number | undefined;
  readonly improvedGovernance: boolean;
  readonly regressedGovernance: boolean;
  readonly newViolations: readonly ReleaseFindingDelta[];
  readonly resolvedFindings: readonly ReleaseFindingDelta[];
  readonly persistentViolations: readonly ReleaseFindingDelta[];
  readonly routeStability: readonly ReleaseRouteStability[];
  readonly driftComparison: ReleaseDriftComparison;
  readonly releaseRiskIndicators: readonly string[];
  readonly releaseRisk: "low" | "medium" | "high" | "critical";
}

export class ReleaseComparisonEngine {
  compare(input: ReleaseComparisonInput): ReleaseComparisonReport {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const previousFindings = activeFindings(input.previousExecution.verifiedFindings);
    const currentFindings = activeFindings(input.currentExecution.verifiedFindings);
    const previousBySignature = findingsBySignature(previousFindings);
    const currentBySignature = findingsBySignature(currentFindings);
    const newViolations = [...currentBySignature.entries()]
      .filter(([signature]) => !previousBySignature.has(signature))
      .map(([signature, finding]) => findingDelta(signature, finding));
    const resolvedFindings = [...previousBySignature.entries()]
      .filter(([signature]) => !currentBySignature.has(signature))
      .map(([signature, finding]) => findingDelta(signature, finding));
    const persistentViolations = [...currentBySignature.entries()]
      .filter(([signature]) => previousBySignature.has(signature))
      .map(([signature, finding]) => findingDelta(signature, finding));
    const governanceRegressionDelta = scoreDelta(
      input.previousExecution.metadata.governanceScore,
      input.currentExecution.metadata.governanceScore,
    );
    const routeStability = compareRoutes(input.previousExecution, input.currentExecution);
    const driftComparison = compareDrift(input.previousDriftAnalysis, input.currentDriftAnalysis);
    const releaseRiskIndicators = riskIndicators({
      newViolations,
      resolvedFindings,
      governanceRegressionDelta,
      routeStability,
      driftComparison,
    });

    return {
      reportId: `release-comparison:${input.previousExecution.metadata.runId}:${input.currentExecution.metadata.runId}`,
      generatedAt,
      previousRunId: input.previousExecution.metadata.runId,
      currentRunId: input.currentExecution.metadata.runId,
      ...(governanceRegressionDelta === undefined ? {} : { governanceRegressionDelta }),
      improvedGovernance: (governanceRegressionDelta ?? 0) > 0,
      regressedGovernance: (governanceRegressionDelta ?? 0) < 0,
      newViolations,
      resolvedFindings,
      persistentViolations,
      routeStability,
      driftComparison,
      releaseRiskIndicators,
      releaseRisk: releaseRisk(releaseRiskIndicators, newViolations),
    };
  }
}

function activeFindings(findings: readonly VerifiedFinding[]): readonly VerifiedFinding[] {
  return findings.filter((finding) => finding.status !== "rejected");
}

function findingsBySignature(findings: readonly VerifiedFinding[]): Map<string, VerifiedFinding> {
  const map = new Map<string, VerifiedFinding>();
  for (const finding of findings) {
    map.set(violationSignature(finding), finding);
  }
  return map;
}

function findingDelta(signature: string, finding: VerifiedFinding): ReleaseFindingDelta {
  return {
    signature,
    findingId: finding.id,
    route: finding.route,
    component: finding.component,
    severity: finding.severity,
    expected: finding.expected,
    actual: finding.actual,
  };
}

function scoreDelta(previousScore: number | undefined, currentScore: number | undefined): number | undefined {
  if (previousScore === undefined || currentScore === undefined) {
    return undefined;
  }
  return currentScore - previousScore;
}

function compareRoutes(
  previousExecution: MemoryExecutionSnapshot,
  currentExecution: MemoryExecutionSnapshot,
): readonly ReleaseRouteStability[] {
  const previousRoutes = routeSummary(previousExecution);
  const currentRoutes = routeSummary(currentExecution);
  const routes = [...new Set([...previousRoutes.keys(), ...currentRoutes.keys()])].sort();

  return routes.map((route) => {
    const previous = previousRoutes.get(route);
    const current = currentRoutes.get(route);
    const findingDelta = (current?.findingCount ?? 0) - (previous?.findingCount ?? 0);
    const governanceScoreDelta = scoreDelta(previous?.governanceScore, current?.governanceScore);
    const status = routeStatus(previous, current, findingDelta, governanceScoreDelta);

    return {
      route,
      previousFindingCount: previous?.findingCount ?? 0,
      currentFindingCount: current?.findingCount ?? 0,
      findingDelta,
      ...(previous?.governanceScore === undefined ? {} : { previousGovernanceScore: previous.governanceScore }),
      ...(current?.governanceScore === undefined ? {} : { currentGovernanceScore: current.governanceScore }),
      ...(governanceScoreDelta === undefined ? {} : { governanceScoreDelta }),
      status,
    };
  });
}

function routeSummary(snapshot: MemoryExecutionSnapshot): Map<string, { findingCount: number; governanceScore?: number }> {
  const findings = activeFindings(snapshot.verifiedFindings);
  const routes = new Map<string, { findingCount: number; governanceScore?: number }>();
  const routeSet = new Set([snapshot.metadata.route, ...findings.map((finding) => finding.route)]);

  for (const route of routeSet) {
    routes.set(route, {
      findingCount: findings.filter((finding) => finding.route === route).length,
      ...(snapshot.metadata.governanceScore === undefined ? {} : { governanceScore: snapshot.metadata.governanceScore }),
    });
  }

  return routes;
}

function routeStatus(
  previous: { findingCount: number; governanceScore?: number } | undefined,
  current: { findingCount: number; governanceScore?: number } | undefined,
  findingDelta: number,
  governanceScoreDelta: number | undefined,
): ReleaseRouteStability["status"] {
  if (!previous && current) {
    return "new-route";
  }
  if (previous && !current) {
    return "resolved-route";
  }
  if (findingDelta > 0 || (governanceScoreDelta ?? 0) < 0) {
    return "degraded";
  }
  if (findingDelta < 0 || (governanceScoreDelta ?? 0) > 0) {
    return "improved";
  }
  return "stable";
}

function compareDrift(
  previousDriftAnalysis: DriftAnalysisReport | undefined,
  currentDriftAnalysis: DriftAnalysisReport | undefined,
): ReleaseDriftComparison {
  const driftScoreDelta = scoreDelta(previousDriftAnalysis?.overallDriftScore, currentDriftAnalysis?.overallDriftScore);
  return {
    ...(previousDriftAnalysis === undefined ? {} : { previousOverallDriftScore: previousDriftAnalysis.overallDriftScore }),
    ...(currentDriftAnalysis === undefined ? {} : { currentOverallDriftScore: currentDriftAnalysis.overallDriftScore }),
    ...(driftScoreDelta === undefined ? {} : { driftScoreDelta }),
    worseningDrift: (driftScoreDelta ?? 0) > 0,
    improvedDrift: (driftScoreDelta ?? 0) < 0,
    ...(previousDriftAnalysis === undefined
      ? {}
      : { previousGovernanceScoreDegradation: previousDriftAnalysis.governanceScoreDegradation.degradationAmount }),
    ...(currentDriftAnalysis === undefined
      ? {}
      : { currentGovernanceScoreDegradation: currentDriftAnalysis.governanceScoreDegradation.degradationAmount }),
  };
}

function riskIndicators(input: {
  readonly newViolations: readonly ReleaseFindingDelta[];
  readonly resolvedFindings: readonly ReleaseFindingDelta[];
  readonly governanceRegressionDelta?: number | undefined;
  readonly routeStability: readonly ReleaseRouteStability[];
  readonly driftComparison: ReleaseDriftComparison;
}): readonly string[] {
  const indicators: string[] = [];
  const newCriticalCount = input.newViolations.filter((finding) => finding.severity === "critical").length;
  if (newCriticalCount > 0) {
    indicators.push(`${newCriticalCount} new critical violation(s)`);
  }
  if (input.newViolations.length > 0) {
    indicators.push(`${input.newViolations.length} new violation(s) introduced`);
  }
  if (input.resolvedFindings.length > 0) {
    indicators.push(`${input.resolvedFindings.length} violation(s) resolved`);
  }
  if ((input.governanceRegressionDelta ?? 0) < 0) {
    indicators.push(`governance score regressed by ${Math.abs(input.governanceRegressionDelta ?? 0)} point(s)`);
  }
  const degradedRouteCount = input.routeStability.filter((route) => route.status === "degraded").length;
  if (degradedRouteCount > 0) {
    indicators.push(`${degradedRouteCount} route(s) degraded`);
  }
  if (input.driftComparison.worseningDrift) {
    indicators.push(`drift worsened by ${input.driftComparison.driftScoreDelta} point(s)`);
  }
  if ((input.governanceRegressionDelta ?? 0) > 0 && input.resolvedFindings.length > input.newViolations.length) {
    indicators.push("release improved governance posture");
  }
  return [...new Set(indicators)].sort();
}

function releaseRisk(
  indicators: readonly string[],
  newViolations: readonly ReleaseFindingDelta[],
): ReleaseComparisonReport["releaseRisk"] {
  if (newViolations.some((finding) => finding.severity === "critical")) {
    return "critical";
  }
  if (indicators.some((indicator) => indicator.includes("regressed") || indicator.includes("degraded"))) {
    return "high";
  }
  if (newViolations.length > 0 || indicators.some((indicator) => indicator.includes("worsened"))) {
    return "medium";
  }
  return "low";
}
