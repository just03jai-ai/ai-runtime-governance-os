import type { SeverityLevel } from "../../shared/types/severity.js";
import type {
  ComponentGraphNode,
  FindingGraphNode,
  GovernanceKnowledgeGraph,
  ReleaseGraphNode,
  RouteGraphNode,
} from "../knowledge-graph/types.js";

export interface RouteSeverityDistribution {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly total: number;
}

export interface RouteDegradationPoint {
  readonly releaseId: string;
  readonly findingCount: number;
  readonly componentCount: number;
  readonly severity: RouteSeverityDistribution;
}

export interface RouteHealthProfile {
  readonly route: string;
  readonly routeId?: string | undefined;
  readonly title?: string | undefined;
  readonly complexity: number;
  readonly governanceScore: number;
  readonly violationDensity: number;
  readonly accessibilityHealthScore: number;
  readonly componentConcentration: number;
  readonly historicalDegradation: readonly RouteDegradationPoint[];
  readonly degradationTrend: "improving" | "regressing" | "stable" | "insufficient-data";
  readonly riskRank: number;
  readonly riskLevel: "low" | "medium" | "high" | "critical";
  readonly componentCount: number;
  readonly findingCount: number;
  readonly severity: RouteSeverityDistribution;
}

export interface RouteHealthReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly routeCount: number;
  readonly degradedRouteCount: number;
  readonly averageGovernanceScore: number;
  readonly routes: readonly RouteHealthProfile[];
}

export interface RouteIntelligenceEngineOptions {
  readonly generatedAt?: string | undefined;
}

export class RouteIntelligenceEngine {
  analyze(graph: GovernanceKnowledgeGraph, options: RouteIntelligenceEngineOptions = {}): RouteHealthReport {
    const routes = graph.nodes.filter((node): node is RouteGraphNode => node.type === "route");
    const profiles = routes.map((route) => routeProfile(graph, route));

    return {
      reportId: `route-health:${graph.graphId}`,
      generatedAt: options.generatedAt ?? new Date().toISOString(),
      routeCount: profiles.length,
      degradedRouteCount: profiles.filter((profile) => profile.riskLevel === "high" || profile.riskLevel === "critical").length,
      averageGovernanceScore: average(profiles.map((profile) => profile.governanceScore)),
      routes: profiles
        .sort(
          (left, right) =>
            right.riskRank - left.riskRank ||
            left.governanceScore - right.governanceScore ||
            left.route.localeCompare(right.route),
        )
        .map((profile, index) => ({
          ...profile,
          riskRank: index + 1,
        })),
    };
  }
}

function routeProfile(graph: GovernanceKnowledgeGraph, route: RouteGraphNode): RouteHealthProfile {
  const components = componentsForRoute(graph, route.id);
  const findings = findingsForComponents(graph, components.map((component) => component.id));
  const severity = severityDistribution(findings);
  const accessibilityCount = findings.filter(isAccessibilityFinding).length;
  const complexity = routeComplexity(components.length, findings.length);
  const violationDensity = components.length === 0 ? findings.length : Number((findings.length / components.length).toFixed(2));
  const accessibilityHealthScore = clampScore(100 - accessibilityCount * 20 - severity.critical * 10);
  const componentConcentration = concentration(components, findings);
  const historicalDegradation = degradationHistoryForRoute(graph, route.id, components, findings);
  const governanceScore = routeGovernanceScore({
    complexity,
    violationDensity,
    accessibilityCount,
    componentConcentration,
    severity,
    historicalDegradation,
  });
  const degradationTrend = trendFromHistory(historicalDegradation);
  const riskRank = routeRiskRank({
    governanceScore,
    severity,
    violationDensity,
    accessibilityCount,
    degradationTrend,
  });

  return {
    route: route.route,
    ...(route.routeId === undefined ? {} : { routeId: route.routeId }),
    ...(route.title === undefined ? {} : { title: route.title }),
    complexity,
    governanceScore,
    violationDensity,
    accessibilityHealthScore,
    componentConcentration,
    historicalDegradation,
    degradationTrend,
    riskRank,
    riskLevel: riskLevel(riskRank),
    componentCount: components.length,
    findingCount: findings.length,
    severity,
  };
}

function componentsForRoute(graph: GovernanceKnowledgeGraph, routeNodeId: string): readonly ComponentGraphNode[] {
  return graph.edges
    .filter((edge) => edge.type === "route_contains_component" && edge.from === routeNodeId)
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.to))
    .filter((node): node is ComponentGraphNode => node?.type === "component");
}

function findingsForComponents(graph: GovernanceKnowledgeGraph, componentNodeIds: readonly string[]): readonly FindingGraphNode[] {
  const ids = new Set(componentNodeIds);
  return graph.edges
    .filter((edge) => edge.type === "finding_affects_component" && ids.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is FindingGraphNode => node?.type === "finding");
}

function degradationHistoryForRoute(
  graph: GovernanceKnowledgeGraph,
  routeNodeId: string,
  components: readonly ComponentGraphNode[],
  findings: readonly FindingGraphNode[],
): readonly RouteDegradationPoint[] {
  const releaseEdges = graph.edges
    .filter((edge) => edge.type === "release_contains_route" && edge.to === routeNodeId)
  const releases = releaseEdges
    .flatMap((edge) => {
      const release = graph.nodes.find((node) => node.id === edge.from);
      return release?.type === "release" ? [{ edge, release }] : [];
    });
  const severity = severityDistribution(findings);

  return releases
    .map(({ edge, release }) => ({
      releaseId: release.releaseId,
      findingCount: numberMetadata(edge.metadata, "findingCount") ?? findings.length,
      componentCount: components.length,
      severity: {
        critical: numberMetadata(edge.metadata, "criticalCount") ?? severity.critical,
        warning: numberMetadata(edge.metadata, "warningCount") ?? severity.warning,
        info: numberMetadata(edge.metadata, "infoCount") ?? severity.info,
        total: numberMetadata(edge.metadata, "findingCount") ?? severity.total,
      },
    }))
    .sort((left, right) => left.releaseId.localeCompare(right.releaseId));
}

function severityDistribution(findings: readonly FindingGraphNode[]): RouteSeverityDistribution {
  return {
    critical: findings.filter((finding) => finding.severity === "critical").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    info: findings.filter((finding) => finding.severity === "info").length,
    total: findings.length,
  };
}

function routeComplexity(componentCount: number, findingCount: number): number {
  return clampScore(componentCount * 8 + findingCount * 6);
}

function concentration(components: readonly ComponentGraphNode[], findings: readonly FindingGraphNode[]): number {
  if (components.length === 0 || findings.length === 0) {
    return 0;
  }
  const byComponent = new Map<string, number>();
  for (const finding of findings) {
    const componentId = componentNodeIdForFinding(finding);
    byComponent.set(componentId, (byComponent.get(componentId) ?? 0) + 1);
  }
  const highest = Math.max(...byComponent.values());
  return Number((highest / findings.length).toFixed(2));
}

function componentNodeIdForFinding(finding: FindingGraphNode): string {
  const evidence = finding.metadata?.["evidence"];
  if (typeof evidence === "object" && evidence !== null && "componentId" in evidence) {
    const componentId = (evidence as { readonly componentId?: unknown }).componentId;
    if (typeof componentId === "string") {
      return componentId;
    }
  }
  return finding.label;
}

function routeGovernanceScore(input: {
  readonly complexity: number;
  readonly violationDensity: number;
  readonly accessibilityCount: number;
  readonly componentConcentration: number;
  readonly severity: RouteSeverityDistribution;
  readonly historicalDegradation: readonly RouteDegradationPoint[];
}): number {
  const latest = input.historicalDegradation.at(-1);
  const first = input.historicalDegradation[0];
  const degradationPenalty =
    latest && first ? Math.max(0, latest.findingCount - first.findingCount) * 8 : 0;
  return clampScore(
    100 -
      input.severity.critical * 22 -
      input.severity.warning * 8 -
      input.severity.info * 2 -
      input.accessibilityCount * 10 -
      input.violationDensity * 6 -
      input.componentConcentration * 10 -
      input.complexity * 0.12 -
      degradationPenalty,
  );
}

function routeRiskRank(input: {
  readonly governanceScore: number;
  readonly severity: RouteSeverityDistribution;
  readonly violationDensity: number;
  readonly accessibilityCount: number;
  readonly degradationTrend: RouteHealthProfile["degradationTrend"];
}): number {
  return clampScore(
    100 -
      input.governanceScore +
      input.severity.critical * 15 +
      input.violationDensity * 10 +
      input.accessibilityCount * 8 +
      (input.degradationTrend === "regressing" ? 12 : 0),
  );
}

function riskLevel(riskRank: number): RouteHealthProfile["riskLevel"] {
  if (riskRank >= 75) {
    return "critical";
  }
  if (riskRank >= 50) {
    return "high";
  }
  if (riskRank >= 25) {
    return "medium";
  }
  return "low";
}

function trendFromHistory(history: readonly RouteDegradationPoint[]): RouteHealthProfile["degradationTrend"] {
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

function isAccessibilityFinding(finding: FindingGraphNode): boolean {
  return [finding.findingId, finding.expected, finding.actual]
    .join(" ")
    .toLowerCase()
    .match(/accessib|aria|label|focus|keyboard|contrast/) !== null;
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

function numberMetadata(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === "number" ? value : undefined;
}
