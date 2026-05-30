import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { HistoricalInsights } from "../../agents/memory/types.js";
import type { SeverityLevel } from "../../shared/types/severity.js";
import type {
  ComponentGraphNode,
  DesignTokenGraphNode,
  FindingGraphNode,
  GovernanceKnowledgeGraph,
  PolicyGraphNode,
  ReleaseGraphNode,
  RouteGraphNode,
} from "../knowledge-graph/index.js";

export type RootCauseCategory = "component" | "token" | "route" | "release" | "policy";

export interface RootCauseEvidence {
  readonly nodeIds: readonly string[];
  readonly findingIds: readonly string[];
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly tokenNames: readonly string[];
  readonly policyIds: readonly string[];
  readonly releaseIds: readonly string[];
  readonly historicalSignals: readonly string[];
}

export interface RootCauseFindingCluster {
  readonly id: string;
  readonly key: string;
  readonly category: RootCauseCategory;
  readonly severity: SeverityLevel;
  readonly findingIds: readonly string[];
  readonly count: number;
  readonly evidence: RootCauseEvidence;
}

export interface RootCauseInsight {
  readonly id: string;
  readonly category: RootCauseCategory;
  readonly severity: SeverityLevel;
  readonly confidence: number;
  readonly summary: string;
  readonly contributingClusterIds: readonly string[];
  readonly evidence: RootCauseEvidence;
  readonly recommendation: string;
}

export interface RootCauseReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly analyzedFindingCount: number;
  readonly clusterCount: number;
  readonly systemicCauseCount: number;
  readonly clusters: readonly RootCauseFindingCluster[];
  readonly rootCauses: readonly RootCauseInsight[];
}

export interface RootCauseAnalysisInput {
  readonly graph: GovernanceKnowledgeGraph;
  readonly verifiedFindings: readonly VerifiedFinding[];
  readonly historicalInsights?: HistoricalInsights | undefined;
  readonly generatedAt?: string | undefined;
}

export class RootCauseAnalysisEngine {
  analyze(input: RootCauseAnalysisInput): RootCauseReport {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const verifiedFindings = input.verifiedFindings.filter((finding) => finding.status === "verified");
    const clusters = clusterFindings(input.graph, verifiedFindings, input.historicalInsights);
    const rootCauses = [
      ...componentRootCauses(input.graph, clusters, input.historicalInsights),
      ...tokenRootCauses(input.graph, clusters, input.historicalInsights),
      ...routeRootCauses(input.graph, clusters, input.historicalInsights),
      ...releaseRootCauses(input.graph, clusters, input.historicalInsights),
      ...policyRootCauses(input.graph, clusters, input.historicalInsights),
    ].sort(
      (left, right) =>
        severityRank(right.severity) - severityRank(left.severity) ||
        right.confidence - left.confidence ||
        left.id.localeCompare(right.id),
    );

    return {
      reportId: `root-cause:${input.graph.graphId}`,
      generatedAt,
      analyzedFindingCount: verifiedFindings.length,
      clusterCount: clusters.length,
      systemicCauseCount: rootCauses.length,
      clusters,
      rootCauses,
    };
  }
}

function clusterFindings(
  graph: GovernanceKnowledgeGraph,
  findings: readonly VerifiedFinding[],
  historicalInsights: HistoricalInsights | undefined,
): readonly RootCauseFindingCluster[] {
  const graphFindings = findingNodes(graph);
  const byKey = new Map<string, VerifiedFinding[]>();
  for (const finding of findings) {
    const key = clusterKey(finding);
    byKey.set(key, [...(byKey.get(key) ?? []), finding]);
  }

  return [...byKey.entries()]
    .map(([key, clusterFindings]) => {
      const graphFindingMatches = graphFindings.filter((node) =>
        clusterFindings.some((finding) => finding.id === node.findingId),
      );
      const components = uniqueComponents([
        ...componentsForGraphFindings(graph, graphFindingMatches),
        ...componentsForVerifiedFindings(graph, clusterFindings),
      ]);
      const routes = uniqueRoutes([
        ...routesForComponents(graph, components),
        ...clusterFindings.map((finding) => finding.route),
      ]);
      const policies = policiesForComponents(graph, components).filter((policy) =>
        clusterFindings.some((finding) => policy.policyId === policyIdForFinding(finding.id)),
      );
      const extractedTokenNames = unique(clusterFindings.flatMap((finding) => tokenNamesFromText(`${finding.expected} ${finding.actual}`)));
      const tokens = tokensForComponents(graph, components).filter((token) =>
        extractedTokenNames.includes(token.tokenName) ||
        clusterFindings.some((finding) => textIncludes(`${finding.expected} ${finding.actual}`, token.tokenName)),
      );
      const releases = releasesForRoutes(graph, routes);
      const historicalSignals = historicalSignalsForCluster(clusterFindings, historicalInsights);
      const category = categoryForCluster(key, clusterFindings, tokens, policies);

      return {
        id: `cluster:${slug(key)}`,
        key,
        category,
        severity: highestSeverity(clusterFindings.map((finding) => finding.severity)),
        findingIds: unique(clusterFindings.map((finding) => finding.id)),
        count: clusterFindings.length,
        evidence: {
          nodeIds: unique([
            ...graphFindingMatches.map((finding) => finding.id),
            ...components.map((component) => component.id),
            ...tokens.map((token) => token.id),
            ...policies.map((policy) => policy.id),
            ...releases.map((release) => release.id),
          ]),
          findingIds: unique(clusterFindings.map((finding) => finding.id)),
          componentIds: unique(components.map((component) => component.componentId)),
          routes: unique(routes),
          tokenNames: unique([...tokens.map((token) => token.tokenName), ...extractedTokenNames]),
          policyIds: unique(policies.map((policy) => policy.policyId)),
          releaseIds: unique(releases.map((release) => release.releaseId)),
          historicalSignals,
        },
      };
    })
    .filter((cluster) => hasEvidence(cluster.evidence))
    .sort(
      (left, right) =>
        severityRank(right.severity) - severityRank(left.severity) ||
        right.count - left.count ||
        left.key.localeCompare(right.key),
    );
}

function componentRootCauses(
  graph: GovernanceKnowledgeGraph,
  clusters: readonly RootCauseFindingCluster[],
  historicalInsights: HistoricalInsights | undefined,
): readonly RootCauseInsight[] {
  const componentIds = unique(clusters.flatMap((cluster) => cluster.evidence.componentIds));
  return componentIds
    .map((componentId) => {
      const relatedClusters = clusters.filter((cluster) => cluster.evidence.componentIds.includes(componentId));
      const history = historicalInsights?.componentFailureFrequency.find((component) => component.component === componentId);
      if (relatedClusters.length < 2 && (history?.occurrenceCount ?? 0) < 2) {
        return undefined;
      }
      const evidence = mergeEvidence(relatedClusters.map((cluster) => cluster.evidence), historySignals(history));
      const componentNode = componentNodes(graph).find((component) => component.componentId === componentId);
      return insight({
        id: `root-cause:component:${slug(componentId)}`,
        category: "component",
        severity: highestSeverity(relatedClusters.map((cluster) => cluster.severity)),
        confidence: confidence(relatedClusters.length, history?.occurrenceCount ?? 0, evidence),
        summary: `Component ${componentNode?.componentName ?? componentId} is a recurring source of governance findings.`,
        contributingClusterIds: relatedClusters.map((cluster) => cluster.id),
        evidence,
        recommendation: "Prioritize component-level remediation and add regression coverage around its repeated failure modes.",
      });
    })
    .filter((cause): cause is RootCauseInsight => cause !== undefined);
}

function tokenRootCauses(
  graph: GovernanceKnowledgeGraph,
  clusters: readonly RootCauseFindingCluster[],
  historicalInsights: HistoricalInsights | undefined,
): readonly RootCauseInsight[] {
  const tokenNames = unique([
    ...clusters.flatMap((cluster) => cluster.evidence.tokenNames),
    ...tokenNamesForClusters(clusters),
  ]);
  return tokenNames
    .map((tokenName) => {
      const relatedClusters = clusters.filter(
        (cluster) => cluster.evidence.tokenNames.includes(tokenName) || cluster.findingIds.some((findingId) => findingId.includes(tokenName)),
      );
      const recurringCount = historicalInsights?.recurringViolations.filter((violation) =>
        textIncludes(`${violation.signature} ${violation.component}`, tokenName),
      ).length ?? 0;
      if (relatedClusters.length === 0 && recurringCount === 0) {
        return undefined;
      }
      const token = tokenNodes(graph).find((node) => node.tokenName === tokenName);
      const evidence = mergeEvidence(relatedClusters.map((cluster) => cluster.evidence), token ? [] : [`historical-token:${tokenName}`]);
      return insight({
        id: `root-cause:token:${slug(tokenName)}`,
        category: "token",
        severity: highestSeverity(relatedClusters.map((cluster) => cluster.severity)),
        confidence: confidence(relatedClusters.length, recurringCount, evidence),
        summary: `Token ${tokenName} is associated with repeated token or variant drift.`,
        contributingClusterIds: relatedClusters.map((cluster) => cluster.id),
        evidence,
        recommendation: "Align registry token requirements, runtime token capture, and component variant contracts for this token.",
      });
    })
    .filter((cause): cause is RootCauseInsight => cause !== undefined);
}

function routeRootCauses(
  graph: GovernanceKnowledgeGraph,
  clusters: readonly RootCauseFindingCluster[],
  historicalInsights: HistoricalInsights | undefined,
): readonly RootCauseInsight[] {
  const routes = unique(clusters.flatMap((cluster) => cluster.evidence.routes));
  return routes
    .map((route) => {
      const relatedClusters = clusters.filter((cluster) => cluster.evidence.routes.includes(route));
      const routeHistory = historicalInsights?.routeHistory.find((history) => history.route === route);
      const recurringCount = routeHistory?.recurringViolationCount ?? 0;
      if (relatedClusters.length < 2 && recurringCount === 0) {
        return undefined;
      }
      const routeNode = routeNodes(graph).find((node) => node.route === route);
      const evidence = mergeEvidence(relatedClusters.map((cluster) => cluster.evidence), routeHistorySignals(routeHistory));
      return insight({
        id: `root-cause:route:${slug(route)}`,
        category: "route",
        severity: highestSeverity(relatedClusters.map((cluster) => cluster.severity)),
        confidence: confidence(relatedClusters.length, recurringCount, evidence),
        summary: `Route ${routeNode?.title ?? route} concentrates governance findings across multiple categories.`,
        contributingClusterIds: relatedClusters.map((cluster) => cluster.id),
        evidence,
        recommendation: "Review route composition, route-specific state coverage, and repeated component usage on this route.",
      });
    })
    .filter((cause): cause is RootCauseInsight => cause !== undefined);
}

function releaseRootCauses(
  graph: GovernanceKnowledgeGraph,
  clusters: readonly RootCauseFindingCluster[],
  historicalInsights: HistoricalInsights | undefined,
): readonly RootCauseInsight[] {
  const releaseIds = unique(clusters.flatMap((cluster) => cluster.evidence.releaseIds));
  const regressing = historicalInsights?.governanceScoreTrend.direction === "regressing";
  return releaseIds
    .map((releaseId) => {
      const relatedClusters = clusters.filter((cluster) => cluster.evidence.releaseIds.includes(releaseId));
      const regressionCount = historicalInsights?.regressions.length ?? 0;
      if (relatedClusters.length < 2 && !regressing && regressionCount === 0) {
        return undefined;
      }
      const release = releaseNodes(graph).find((node) => node.releaseId === releaseId);
      const evidence = mergeEvidence(relatedClusters.map((cluster) => cluster.evidence), releaseHistorySignals(historicalInsights));
      return insight({
        id: `root-cause:release:${slug(releaseId)}`,
        category: "release",
        severity: regressing ? "critical" : highestSeverity(relatedClusters.map((cluster) => cluster.severity)),
        confidence: confidence(relatedClusters.length, regressionCount, evidence),
        summary: `Release ${release?.releaseId ?? releaseId} is correlated with governance degradation.`,
        contributingClusterIds: relatedClusters.map((cluster) => cluster.id),
        evidence,
        recommendation: "Gate release promotion on resolved regressions and improved governance score trend.",
      });
    })
    .filter((cause): cause is RootCauseInsight => cause !== undefined);
}

function policyRootCauses(
  graph: GovernanceKnowledgeGraph,
  clusters: readonly RootCauseFindingCluster[],
  historicalInsights: HistoricalInsights | undefined,
): readonly RootCauseInsight[] {
  const policyIds = unique(clusters.flatMap((cluster) => cluster.evidence.policyIds));
  return policyIds
    .map((policyId) => {
      const relatedClusters = clusters.filter((cluster) => cluster.evidence.policyIds.includes(policyId));
      const recurringCount = historicalInsights?.recurringViolations.filter((violation) =>
        violation.signature.includes(policyId),
      ).length ?? 0;
      if (relatedClusters.length < 2 && recurringCount === 0) {
        return undefined;
      }
      const policy = policyNodes(graph).find((node) => node.policyId === policyId);
      const evidence = mergeEvidence(relatedClusters.map((cluster) => cluster.evidence), recurringCount > 0 ? [`recurring-policy:${policyId}`] : []);
      return insight({
        id: `root-cause:policy:${slug(policyId)}`,
        category: "policy",
        severity: highestSeverity(relatedClusters.map((cluster) => cluster.severity)),
        confidence: confidence(relatedClusters.length, recurringCount, evidence),
        summary: `Policy ${policy?.policyId ?? policyId} repeatedly fails across related governance findings.`,
        contributingClusterIds: relatedClusters.map((cluster) => cluster.id),
        evidence,
        recommendation: "Tighten policy contract ownership and remediate recurring violations before adding adjacent policy rules.",
      });
    })
    .filter((cause): cause is RootCauseInsight => cause !== undefined);
}

function insight(input: RootCauseInsight): RootCauseInsight {
  return {
    ...input,
    confidence: Number(input.confidence.toFixed(2)),
  };
}

function clusterKey(finding: VerifiedFinding): string {
  return [policyIdForFinding(finding.id), finding.component, finding.route].join("|");
}

function categoryForCluster(
  key: string,
  findings: readonly VerifiedFinding[],
  tokens: readonly DesignTokenGraphNode[],
  policies: readonly PolicyGraphNode[],
): RootCauseCategory {
  const haystack = [key, ...findings.flatMap((finding) => [finding.expected, finding.actual]), ...policies.map((policy) => policy.policyId)].join(" ").toLowerCase();
  if (tokens.length > 0 || /token|spacing|typography|color|radius|shadow|variant/.test(haystack)) {
    return "token";
  }
  if (/accessib|aria|label|focus|keyboard|contrast|component|misuse/.test(haystack)) {
    return "component";
  }
  return "route";
}

function historicalSignalsForCluster(
  findings: readonly VerifiedFinding[],
  historicalInsights: HistoricalInsights | undefined,
): readonly string[] {
  if (!historicalInsights) {
    return [];
  }
  const findingIds = new Set(findings.map((finding) => finding.id));
  const components = new Set(findings.map((finding) => finding.component));
  const routes = new Set(findings.map((finding) => finding.route));
  return unique([
    ...historicalInsights.recurringViolations
      .filter((violation) => components.has(violation.component) || routes.has(violation.route) || violation.currentFindingIds.some((id) => findingIds.has(id)))
      .map((violation) => `recurring:${violation.signature}:${violation.occurrenceCount}`),
    ...historicalInsights.regressions
      .filter((regression) => findingIds.has(regression.findingId) || components.has(regression.component) || routes.has(regression.route))
      .map((regression) => `regression:${regression.signature}:${regression.regressionType}`),
  ]);
}

function historySignals(history: { readonly occurrenceCount: number; readonly affectedRunCount: number } | undefined): readonly string[] {
  return history ? [`component-history:occurrences:${history.occurrenceCount}`, `component-history:runs:${history.affectedRunCount}`] : [];
}

function routeHistorySignals(history: { readonly executionCount: number; readonly recurringViolationCount: number } | undefined): readonly string[] {
  return history ? [`route-history:executions:${history.executionCount}`, `route-history:recurring:${history.recurringViolationCount}`] : [];
}

function releaseHistorySignals(historicalInsights: HistoricalInsights | undefined): readonly string[] {
  if (!historicalInsights) {
    return [];
  }
  return unique([
    `score-trend:${historicalInsights.governanceScoreTrend.direction}`,
    ...historicalInsights.regressions.map((regression) => `regression:${regression.signature}`),
  ]);
}

function tokenNamesForClusters(clusters: readonly RootCauseFindingCluster[]): readonly string[] {
  return unique(clusters.flatMap((cluster) => cluster.evidence.tokenNames));
}

function tokenNamesFromText(text: string): readonly string[] {
  return text.match(/[a-z]+(?:\.[a-zA-Z0-9_-]+)+/g) ?? [];
}

function mergeEvidence(
  evidence: readonly RootCauseEvidence[],
  extraHistoricalSignals: readonly string[] = [],
): RootCauseEvidence {
  return {
    nodeIds: unique(evidence.flatMap((item) => item.nodeIds)),
    findingIds: unique(evidence.flatMap((item) => item.findingIds)),
    componentIds: unique(evidence.flatMap((item) => item.componentIds)),
    routes: unique(evidence.flatMap((item) => item.routes)),
    tokenNames: unique(evidence.flatMap((item) => item.tokenNames)),
    policyIds: unique(evidence.flatMap((item) => item.policyIds)),
    releaseIds: unique(evidence.flatMap((item) => item.releaseIds)),
    historicalSignals: unique([...evidence.flatMap((item) => item.historicalSignals), ...extraHistoricalSignals]),
  };
}

function confidence(clusterCount: number, historicalSignalCount: number, evidence: RootCauseEvidence): number {
  const evidenceKinds = [
    evidence.nodeIds,
    evidence.findingIds,
    evidence.componentIds,
    evidence.routes,
    evidence.tokenNames,
    evidence.policyIds,
    evidence.releaseIds,
    evidence.historicalSignals,
  ].filter((items) => items.length > 0).length;
  return Math.min(1, 0.35 + clusterCount * 0.12 + historicalSignalCount * 0.08 + evidenceKinds * 0.05);
}

function componentsForGraphFindings(
  graph: GovernanceKnowledgeGraph,
  findings: readonly FindingGraphNode[],
): readonly ComponentGraphNode[] {
  const ids = new Set(findings.map((finding) => finding.id));
  return uniqueComponents(
    graph.edges
      .filter((edge) => edge.type === "finding_affects_component" && ids.has(edge.from))
      .flatMap((edge) => graph.nodes.find((node) => node.id === edge.to))
      .filter((node): node is ComponentGraphNode => node?.type === "component"),
  );
}

function componentsForVerifiedFindings(
  graph: GovernanceKnowledgeGraph,
  findings: readonly VerifiedFinding[],
): readonly ComponentGraphNode[] {
  const ids = new Set(findings.flatMap((finding) => [finding.component, stringEvidence(finding.evidence.componentId)]));
  return componentNodes(graph).filter(
    (component) => ids.has(component.componentId) || ids.has(component.componentName),
  );
}

function routesForComponents(graph: GovernanceKnowledgeGraph, components: readonly ComponentGraphNode[]): readonly string[] {
  const ids = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "route_contains_component" && ids.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is RouteGraphNode => node?.type === "route")
    .map((route) => route.route);
}

function policiesForComponents(graph: GovernanceKnowledgeGraph, components: readonly ComponentGraphNode[]): readonly PolicyGraphNode[] {
  const ids = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "policy_validates_component" && ids.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is PolicyGraphNode => node?.type === "policy");
}

function tokensForComponents(graph: GovernanceKnowledgeGraph, components: readonly ComponentGraphNode[]): readonly DesignTokenGraphNode[] {
  const ids = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "component_uses_token" && ids.has(edge.from))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.to))
    .filter((node): node is DesignTokenGraphNode => node?.type === "design-token");
}

function releasesForRoutes(graph: GovernanceKnowledgeGraph, routes: readonly string[]): readonly ReleaseGraphNode[] {
  const routeNodeIds = new Set(routeNodes(graph).filter((route) => routes.includes(route.route)).map((route) => route.id));
  return graph.edges
    .filter((edge) => edge.type === "release_contains_route" && routeNodeIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is ReleaseGraphNode => node?.type === "release");
}

function routeNodes(graph: GovernanceKnowledgeGraph): readonly RouteGraphNode[] {
  return graph.nodes.filter((node): node is RouteGraphNode => node.type === "route");
}

function componentNodes(graph: GovernanceKnowledgeGraph): readonly ComponentGraphNode[] {
  return graph.nodes.filter((node): node is ComponentGraphNode => node.type === "component");
}

function tokenNodes(graph: GovernanceKnowledgeGraph): readonly DesignTokenGraphNode[] {
  return graph.nodes.filter((node): node is DesignTokenGraphNode => node.type === "design-token");
}

function findingNodes(graph: GovernanceKnowledgeGraph): readonly FindingGraphNode[] {
  return graph.nodes.filter((node): node is FindingGraphNode => node.type === "finding");
}

function policyNodes(graph: GovernanceKnowledgeGraph): readonly PolicyGraphNode[] {
  return graph.nodes.filter((node): node is PolicyGraphNode => node.type === "policy");
}

function releaseNodes(graph: GovernanceKnowledgeGraph): readonly ReleaseGraphNode[] {
  return graph.nodes.filter((node): node is ReleaseGraphNode => node.type === "release");
}

function policyIdForFinding(findingId: string): string {
  const parts = findingId.split(":").filter(Boolean);
  if (parts.length >= 3) {
    return parts.at(-2) ?? findingId;
  }
  return findingId;
}

function highestSeverity(severities: readonly SeverityLevel[]): SeverityLevel {
  if (severities.some((severity) => severity === "critical")) {
    return "critical";
  }
  if (severities.some((severity) => severity === "warning")) {
    return "warning";
  }
  return "info";
}

function severityRank(severity: SeverityLevel): number {
  return severity === "critical" ? 3 : severity === "warning" ? 2 : 1;
}

function hasEvidence(evidence: RootCauseEvidence): boolean {
  return (
    evidence.nodeIds.length > 0 ||
    evidence.findingIds.length > 0 ||
    evidence.componentIds.length > 0 ||
    evidence.routes.length > 0 ||
    evidence.tokenNames.length > 0 ||
    evidence.policyIds.length > 0 ||
    evidence.releaseIds.length > 0 ||
    evidence.historicalSignals.length > 0
  );
}

function stringEvidence(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function textIncludes(text: string, value: string): boolean {
  return text.toLowerCase().includes(value.toLowerCase());
}

function uniqueComponents(components: readonly ComponentGraphNode[]): readonly ComponentGraphNode[] {
  return [...new Map(components.map((component) => [component.id, component])).values()].sort((left, right) =>
    left.componentId.localeCompare(right.componentId),
  );
}

function uniqueRoutes(routes: readonly string[]): readonly string[] {
  return unique(routes);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
