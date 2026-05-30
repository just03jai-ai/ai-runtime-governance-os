import type { SeverityLevel } from "../../shared/types/severity.js";
import { GovernanceKnowledgeGraphQueryEngine } from "../knowledge-graph/governance-knowledge-graph-query-engine.js";
import type {
  ComponentGraphNode,
  DesignTokenGraphNode,
  FindingGraphNode,
  GovernanceKnowledgeGraph,
  PolicyGraphNode,
  ReleaseGraphNode,
  RouteGraphNode,
} from "../knowledge-graph/types.js";

export interface ComponentIntelligenceProfile {
  readonly componentId: string;
  readonly componentName: string;
  readonly frequency: number;
  readonly routeDistribution: readonly string[];
  readonly tokenUsage: readonly {
    readonly tokenName: string;
    readonly category: string;
    readonly value?: string | undefined;
  }[];
  readonly policyViolations: readonly {
    readonly policyId: string;
    readonly findingCount: number;
    readonly highestSeverity: SeverityLevel;
  }[];
  readonly accessibilityIssueCount: number;
  readonly violationFrequency: number;
  readonly driftHistory: readonly {
    readonly releaseId: string;
    readonly findingCount: number;
    readonly severity: ComponentSeverityDistribution;
  }[];
  readonly healthScore: number;
  readonly stabilityScore: number;
  readonly trend: "improving" | "regressing" | "stable" | "insufficient-data";
}

export interface ComponentSeverityDistribution {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly total: number;
}

export interface ComponentHealthReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly componentCount: number;
  readonly unhealthyComponentCount: number;
  readonly averageHealthScore: number;
  readonly averageStabilityScore: number;
  readonly components: readonly ComponentIntelligenceProfile[];
}

export interface ComponentIntelligenceEngineOptions {
  readonly generatedAt?: string | undefined;
}

export class ComponentIntelligenceEngine {
  analyze(graph: GovernanceKnowledgeGraph, options: ComponentIntelligenceEngineOptions = {}): ComponentHealthReport {
    const query = new GovernanceKnowledgeGraphQueryEngine(graph);
    const components = query.nodes("component").filter((node): node is ComponentGraphNode => node.type === "component");
    const profiles = components.map((component) => this.componentProfile(graph, query, component));
    const averageHealthScore = average(profiles.map((profile) => profile.healthScore));
    const averageStabilityScore = average(profiles.map((profile) => profile.stabilityScore));

    return {
      reportId: `component-health:${graph.graphId}`,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      componentCount: profiles.length,
      unhealthyComponentCount: profiles.filter((profile) => profile.healthScore < 70).length,
      averageHealthScore,
      averageStabilityScore,
      components: profiles.sort(
        (left, right) =>
          left.healthScore - right.healthScore ||
          right.violationFrequency - left.violationFrequency ||
          left.componentName.localeCompare(right.componentName),
      ),
    };
  }

  private componentProfile(
    graph: GovernanceKnowledgeGraph,
    query: GovernanceKnowledgeGraphQueryEngine,
    component: ComponentGraphNode,
  ): ComponentIntelligenceProfile {
    const routeDistribution = routesForComponent(graph, component.id).map((route) => route.route).sort();
    const tokenUsage = query.tokensForComponent(component.id).map(tokenSummary);
    const findings = query.findingsForComponent(component.id);
    const severity = severityDistribution(findings);
    const policyViolations = policyViolationsForComponent(graph, component.id, findings);
    const accessibilityIssueCount = findings.filter(isAccessibilityFinding).length;
    const driftHistory = driftHistoryForComponent(graph, component.id, findings);
    const healthScore = componentHealthScore({
      severity,
      accessibilityIssueCount,
      tokenCount: tokenUsage.length,
      policyViolationCount: policyViolations.reduce((total, policy) => total + policy.findingCount, 0),
    });
    const stabilityScore = componentStabilityScore(driftHistory, healthScore);

    return {
      componentId: component.componentId,
      componentName: component.componentName,
      frequency: routeDistribution.length,
      routeDistribution,
      tokenUsage,
      policyViolations,
      accessibilityIssueCount,
      violationFrequency: severity.total,
      driftHistory,
      healthScore,
      stabilityScore,
      trend: trendFromHistory(driftHistory),
    };
  }
}

function routesForComponent(graph: GovernanceKnowledgeGraph, componentNodeId: string): readonly RouteGraphNode[] {
  return graph.edges
    .filter((edge) => edge.type === "route_contains_component" && edge.to === componentNodeId)
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is RouteGraphNode => node?.type === "route");
}

function policyViolationsForComponent(
  graph: GovernanceKnowledgeGraph,
  componentNodeId: string,
  findings: readonly FindingGraphNode[],
): readonly ComponentIntelligenceProfile["policyViolations"][number][] {
  const policies = graph.edges
    .filter((edge) => edge.type === "policy_validates_component" && edge.to === componentNodeId)
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is PolicyGraphNode => node?.type === "policy");
  const highestSeverity = highestSeverityForFindings(findings);

  return policies.map((policy) => ({
    policyId: policy.policyId,
    findingCount: findings.length,
    highestSeverity,
  }));
}

function driftHistoryForComponent(
  graph: GovernanceKnowledgeGraph,
  componentNodeId: string,
  findings: readonly FindingGraphNode[],
): readonly ComponentIntelligenceProfile["driftHistory"][number][] {
  const releaseRoutes = graph.edges
    .filter((edge) => edge.type === "route_contains_component" && edge.to === componentNodeId)
    .flatMap((edge) =>
      graph.edges
        .filter((releaseEdge) => releaseEdge.type === "release_contains_route" && releaseEdge.to === edge.from)
        .flatMap((releaseEdge) => graph.nodes.find((node) => node.id === releaseEdge.from)),
    )
    .filter((node): node is ReleaseGraphNode => node?.type === "release");

  if (releaseRoutes.length === 0) {
    return [];
  }

  const severity = severityDistribution(findings);
  return releaseRoutes
    .map((release) => ({
      releaseId: release.releaseId,
      findingCount: severity.total,
      severity,
    }))
    .sort((a, b) => a.releaseId.localeCompare(b.releaseId));
}

function severityDistribution(findings: readonly FindingGraphNode[]): ComponentSeverityDistribution {
  return {
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
    total: findings.length,
  };
}

function highestSeverityForFindings(findings: readonly FindingGraphNode[]): SeverityLevel {
  if (findings.some((finding) => finding.severity === "critical")) {
    return "critical";
  }
  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }
  return "info";
}

function isAccessibilityFinding(finding: FindingGraphNode): boolean {
  return [finding.findingId, finding.expected, finding.actual]
    .join(" ")
    .toLowerCase()
    .match(/accessib|aria|label|focus|keyboard|contrast/) !== null;
}

function tokenSummary(token: DesignTokenGraphNode): ComponentIntelligenceProfile["tokenUsage"][number] {
  return {
    tokenName: token.tokenName,
    category: token.category,
    ...(token.value === undefined ? {} : { value: token.value }),
  };
}

function componentHealthScore(input: {
  readonly severity: ComponentSeverityDistribution;
  readonly accessibilityIssueCount: number;
  readonly tokenCount: number;
  readonly policyViolationCount: number;
}): number {
  const penalty =
    input.severity.critical * 22 +
    input.severity.warning * 8 +
    input.severity.info * 2 +
    input.accessibilityIssueCount * 10 +
    input.policyViolationCount * 4;
  const tokenBonus = Math.min(10, input.tokenCount * 2);
  return clampScore(100 - penalty + tokenBonus);
}

function componentStabilityScore(
  history: readonly ComponentIntelligenceProfile["driftHistory"][number][],
  healthScore: number,
): number {
  if (history.length < 2) {
    return healthScore;
  }
  const first = history[0]?.findingCount ?? 0;
  const latest = history.at(-1)?.findingCount ?? 0;
  return clampScore(healthScore - Math.max(0, latest - first) * 8 + Math.max(0, first - latest) * 4);
}

function trendFromHistory(
  history: readonly ComponentIntelligenceProfile["driftHistory"][number][],
): ComponentIntelligenceProfile["trend"] {
  if (history.length < 2) {
    return "insufficient-data";
  }
  const first = history[0]?.findingCount ?? 0;
  const latest = history.at(-1)?.findingCount ?? 0;
  if (latest > first) {
    return "regressing";
  }
  if (latest < first) {
    return "improving";
  }
  return "stable";
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
