import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { SeverityLevel } from "../../shared/types/severity.js";
import type { ComponentHealthReport, ComponentIntelligenceProfile } from "../component-intelligence/index.js";
import type { RootCauseInsight, RootCauseReport } from "../root-cause/index.js";
import type { RouteHealthProfile, RouteHealthReport } from "../route-intelligence/index.js";

export interface PrioritizationEvidence {
  readonly findingIds: readonly string[];
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly rootCauseIds: readonly string[];
  readonly factorSignals: readonly string[];
}

export interface PrioritizationScoreBreakdown {
  readonly severity: number;
  readonly recurrence: number;
  readonly blastRadius: number;
  readonly routeCriticality: number;
  readonly componentUsage: number;
  readonly accessibilityImpact: number;
  readonly total: number;
}

export interface PrioritizedRemediationItem {
  readonly rank: number;
  readonly findingId: string;
  readonly severity: SeverityLevel;
  readonly component: string;
  readonly route: string;
  readonly priority: "low" | "medium" | "high" | "critical";
  readonly score: number;
  readonly scoreBreakdown: PrioritizationScoreBreakdown;
  readonly explanation: readonly string[];
  readonly evidence: PrioritizationEvidence;
  readonly recommendation: string;
}

export interface PrioritizedRemediationPlan {
  readonly planId: string;
  readonly generatedAt: string;
  readonly findingCount: number;
  readonly criticalItemCount: number;
  readonly highItemCount: number;
  readonly items: readonly PrioritizedRemediationItem[];
}

export interface PrioritizationEngineInput {
  readonly verifiedFindings: readonly VerifiedFinding[];
  readonly componentHealthReport: ComponentHealthReport;
  readonly routeHealthReport: RouteHealthReport;
  readonly rootCauseReport: RootCauseReport;
  readonly generatedAt?: string | undefined;
}

export class PrioritizationEngine {
  prioritize(input: PrioritizationEngineInput): PrioritizedRemediationPlan {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const activeFindings = input.verifiedFindings.filter((finding) => finding.status === "verified");
    const ranked = activeFindings
      .map((finding) => prioritizeFinding(finding, input))
      .sort(
        (left, right) =>
          right.score - left.score ||
          severityRank(right.severity) - severityRank(left.severity) ||
          left.route.localeCompare(right.route) ||
          left.component.localeCompare(right.component) ||
          left.findingId.localeCompare(right.findingId),
      )
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    return {
      planId: `prioritized-remediation:${input.rootCauseReport.reportId}`,
      generatedAt,
      findingCount: ranked.length,
      criticalItemCount: ranked.filter((item) => item.priority === "critical").length,
      highItemCount: ranked.filter((item) => item.priority === "high").length,
      items: ranked,
    };
  }
}

function prioritizeFinding(
  finding: VerifiedFinding,
  input: PrioritizationEngineInput,
): Omit<PrioritizedRemediationItem, "rank"> {
  const component = componentForFinding(finding, input.componentHealthReport);
  const route = routeForFinding(finding, input.routeHealthReport);
  const rootCauses = rootCausesForFinding(finding, input.rootCauseReport);
  const breakdown = scoreBreakdown({
    finding,
    component,
    route,
    rootCauses,
  });
  const factorSignals = factorSignalsFor({ finding, component, route, rootCauses, breakdown });
  const evidence: PrioritizationEvidence = {
    findingIds: unique([finding.id, ...rootCauses.flatMap((cause) => cause.evidence.findingIds)]),
    componentIds: unique([
      finding.component,
      stringEvidence(finding.evidence.componentId),
      ...(component ? [component.componentId] : []),
      ...rootCauses.flatMap((cause) => cause.evidence.componentIds),
    ]),
    routes: unique([finding.route, ...(route ? [route.route] : []), ...rootCauses.flatMap((cause) => cause.evidence.routes)]),
    rootCauseIds: rootCauses.map((cause) => cause.id),
    factorSignals,
  };

  return {
    findingId: finding.id,
    severity: finding.severity,
    component: component?.componentName ?? finding.component,
    route: route?.route ?? finding.route,
    priority: priorityForScore(breakdown.total),
    score: breakdown.total,
    scoreBreakdown: breakdown,
    explanation: explanationFor({ finding, component, route, rootCauses, breakdown }),
    evidence,
    recommendation: recommendationFor(finding, rootCauses, component, route),
  };
}

function scoreBreakdown(input: {
  readonly finding: VerifiedFinding;
  readonly component: ComponentIntelligenceProfile | undefined;
  readonly route: RouteHealthProfile | undefined;
  readonly rootCauses: readonly RootCauseInsight[];
}): PrioritizationScoreBreakdown {
  const severity = severityScore(input.finding.severity);
  const recurrence = Math.min(
    25,
    input.rootCauses.length * 8 +
      input.rootCauses.reduce((total, cause) => total + cause.evidence.historicalSignals.length, 0) * 3,
  );
  const blastRadius = Math.min(
    20,
    unique([
      input.finding.route,
      ...input.rootCauses.flatMap((cause) => cause.evidence.routes),
      ...(input.component?.routeDistribution ?? []),
    ]).length * 5 +
      unique([input.finding.component, ...(input.rootCauses.flatMap((cause) => cause.evidence.componentIds))]).length * 3,
  );
  const routeCriticality = routeCriticalityScore(input.route);
  const componentUsage = componentUsageScore(input.component);
  const accessibilityImpact = isAccessibilityFinding(input.finding) ? 15 : 0;
  const total = clampScore(severity + recurrence + blastRadius + routeCriticality + componentUsage + accessibilityImpact);

  return {
    severity,
    recurrence,
    blastRadius,
    routeCriticality,
    componentUsage,
    accessibilityImpact,
    total,
  };
}

function componentForFinding(
  finding: VerifiedFinding,
  report: ComponentHealthReport,
): ComponentIntelligenceProfile | undefined {
  const componentId = stringEvidence(finding.evidence.componentId);
  return report.components.find(
    (component) =>
      component.componentId === finding.component ||
      component.componentId === componentId ||
      component.componentName === finding.component,
  );
}

function routeForFinding(finding: VerifiedFinding, report: RouteHealthReport): RouteHealthProfile | undefined {
  return report.routes.find((route) => route.route === finding.route || route.routeId === finding.route);
}

function rootCausesForFinding(finding: VerifiedFinding, report: RootCauseReport): readonly RootCauseInsight[] {
  return report.rootCauses.filter((cause) => cause.evidence.findingIds.includes(finding.id));
}

function severityScore(severity: SeverityLevel): number {
  if (severity === "critical") {
    return 35;
  }
  if (severity === "warning") {
    return 18;
  }
  return 6;
}

function routeCriticalityScore(route: RouteHealthProfile | undefined): number {
  if (!route) {
    return 0;
  }
  const riskScore = route.riskLevel === "critical" ? 15 : route.riskLevel === "high" ? 11 : route.riskLevel === "medium" ? 6 : 2;
  const governancePenalty = Math.max(0, 80 - route.governanceScore) * 0.15;
  const degradationPenalty = route.degradationTrend === "regressing" ? 5 : 0;
  return Math.min(20, Math.round(riskScore + governancePenalty + degradationPenalty));
}

function componentUsageScore(component: ComponentIntelligenceProfile | undefined): number {
  if (!component) {
    return 0;
  }
  const frequencyScore = Math.min(8, component.frequency * 3);
  const healthPenalty = Math.max(0, 80 - component.healthScore) * 0.1;
  const stabilityPenalty = Math.max(0, 80 - component.stabilityScore) * 0.08;
  const trendPenalty = component.trend === "regressing" ? 4 : 0;
  return Math.min(15, Math.round(frequencyScore + healthPenalty + stabilityPenalty + trendPenalty));
}

function explanationFor(input: {
  readonly finding: VerifiedFinding;
  readonly component: ComponentIntelligenceProfile | undefined;
  readonly route: RouteHealthProfile | undefined;
  readonly rootCauses: readonly RootCauseInsight[];
  readonly breakdown: PrioritizationScoreBreakdown;
}): readonly string[] {
  return [
    `severity:${input.finding.severity}:${input.breakdown.severity}`,
    input.rootCauses.length > 0
      ? `recurrence:${input.rootCauses.length} root cause(s):${input.breakdown.recurrence}`
      : `recurrence:none:${input.breakdown.recurrence}`,
    `blast-radius:${input.breakdown.blastRadius}`,
    input.route
      ? `route-criticality:${input.route.riskLevel}:${input.breakdown.routeCriticality}`
      : `route-criticality:unknown:${input.breakdown.routeCriticality}`,
    input.component
      ? `component-usage:${input.component.frequency} route(s):${input.breakdown.componentUsage}`
      : `component-usage:unknown:${input.breakdown.componentUsage}`,
    isAccessibilityFinding(input.finding)
      ? `accessibility-impact:present:${input.breakdown.accessibilityImpact}`
      : `accessibility-impact:none:${input.breakdown.accessibilityImpact}`,
  ];
}

function factorSignalsFor(input: {
  readonly finding: VerifiedFinding;
  readonly component: ComponentIntelligenceProfile | undefined;
  readonly route: RouteHealthProfile | undefined;
  readonly rootCauses: readonly RootCauseInsight[];
  readonly breakdown: PrioritizationScoreBreakdown;
}): readonly string[] {
  return unique([
    `severity:${input.finding.severity}`,
    ...(input.rootCauses.length > 0 ? [`root-causes:${input.rootCauses.length}`] : []),
    ...(input.route ? [`route-risk:${input.route.riskLevel}`, `route-score:${input.route.governanceScore}`] : []),
    ...(input.component ? [`component-frequency:${input.component.frequency}`, `component-health:${input.component.healthScore}`] : []),
    ...(isAccessibilityFinding(input.finding) ? ["accessibility-impact"] : []),
    `score:${input.breakdown.total}`,
  ]);
}

function recommendationFor(
  finding: VerifiedFinding,
  rootCauses: readonly RootCauseInsight[],
  component: ComponentIntelligenceProfile | undefined,
  route: RouteHealthProfile | undefined,
): string {
  const rootCause = rootCauses[0];
  if (rootCause) {
    return rootCause.recommendation;
  }
  if (isAccessibilityFinding(finding)) {
    return "Prioritize accessibility remediation and add regression coverage for the affected interaction path.";
  }
  if (component && component.healthScore < 70) {
    return "Fix the affected component contract and verify it across every route where the component appears.";
  }
  if (route && (route.riskLevel === "high" || route.riskLevel === "critical")) {
    return "Remediate this finding as part of the route-level risk reduction plan.";
  }
  return "Remediate the verified finding and preserve evidence for the next governance comparison.";
}

function priorityForScore(score: number): PrioritizedRemediationItem["priority"] {
  if (score >= 80) {
    return "critical";
  }
  if (score >= 60) {
    return "high";
  }
  if (score >= 35) {
    return "medium";
  }
  return "low";
}

function isAccessibilityFinding(finding: VerifiedFinding): boolean {
  return [finding.id, finding.originalFindingId, finding.expected, finding.actual, finding.component]
    .join(" ")
    .toLowerCase()
    .match(/accessib|aria|label|focus|keyboard|contrast/) !== null;
}

function severityRank(severity: SeverityLevel): number {
  return severity === "critical" ? 3 : severity === "warning" ? 2 : 1;
}

function stringEvidence(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
