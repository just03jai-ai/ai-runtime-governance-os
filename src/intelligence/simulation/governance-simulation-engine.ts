import type { HistoricalInsights } from "../../agents/memory/types.js";
import type {
  DesignSystemComponentDefinition,
  DesignSystemRegistry,
  DesignSystemTokenDefinition,
} from "../../design-system-registry/index.js";
import type {
  ComponentGraphNode,
  DesignTokenGraphNode,
  FindingGraphNode,
  GovernanceKnowledgeGraph,
  PolicyGraphNode,
  ReleaseGraphNode,
  RouteGraphNode,
} from "../knowledge-graph/index.js";

export type GovernanceSimulationChange =
  | TokenChangeSimulation
  | ComponentMigrationSimulation
  | PolicyChangeSimulation;

export interface TokenChangeSimulation {
  readonly type: "token-change";
  readonly tokenName: string;
  readonly proposedValue?: string | undefined;
}

export interface ComponentMigrationSimulation {
  readonly type: "component-migration";
  readonly fromComponentId: string;
  readonly toRegistryComponentId: string;
}

export interface PolicyChangeSimulation {
  readonly type: "policy-change";
  readonly policyId: string;
  readonly action: "add" | "modify" | "remove";
  readonly affectedComponentIds?: readonly string[] | undefined;
}

export interface SimulationEvidence {
  readonly nodeIds: readonly string[];
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly tokenNames: readonly string[];
  readonly policyIds: readonly string[];
  readonly findingIds: readonly string[];
  readonly releaseIds: readonly string[];
  readonly historicalSignals: readonly string[];
}

export interface SimulationImpactEstimate {
  readonly changeId: string;
  readonly changeType: GovernanceSimulationChange["type"];
  readonly blastRadiusScore: number;
  readonly releaseImpactScore: number;
  readonly confidence: number;
  readonly summary: string;
  readonly explanation: readonly string[];
  readonly evidence: SimulationEvidence;
}

export interface SimulationReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly graphId: string;
  readonly changeCount: number;
  readonly overallBlastRadiusScore: number;
  readonly overallReleaseImpactScore: number;
  readonly impactEstimates: readonly SimulationImpactEstimate[];
  readonly recommendations: readonly string[];
}

export interface GovernanceSimulationInput {
  readonly graph: GovernanceKnowledgeGraph;
  readonly historicalInsights: HistoricalInsights;
  readonly designSystemRegistry: DesignSystemRegistry;
  readonly proposedChanges: readonly GovernanceSimulationChange[];
  readonly generatedAt?: string | undefined;
}

export class GovernanceSimulationEngine {
  simulate(input: GovernanceSimulationInput): SimulationReport {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const estimates = input.proposedChanges
      .map((change, index) => estimateForChange(change, index, input))
      .sort(
        (left, right) =>
          right.releaseImpactScore - left.releaseImpactScore ||
          right.blastRadiusScore - left.blastRadiusScore ||
          left.changeId.localeCompare(right.changeId),
      );

    return {
      reportId: `simulation:${input.graph.graphId}`,
      generatedAt,
      graphId: input.graph.graphId,
      changeCount: input.proposedChanges.length,
      overallBlastRadiusScore: clampScore(average(estimates.map((estimate) => estimate.blastRadiusScore))),
      overallReleaseImpactScore: clampScore(average(estimates.map((estimate) => estimate.releaseImpactScore))),
      impactEstimates: estimates,
      recommendations: recommendationsFor(estimates),
    };
  }
}

function estimateForChange(
  change: GovernanceSimulationChange,
  index: number,
  input: GovernanceSimulationInput,
): SimulationImpactEstimate {
  if (change.type === "token-change") {
    return tokenChangeEstimate(change, index, input);
  }
  if (change.type === "component-migration") {
    return componentMigrationEstimate(change, index, input);
  }
  return policyChangeEstimate(change, index, input);
}

function tokenChangeEstimate(
  change: TokenChangeSimulation,
  index: number,
  input: GovernanceSimulationInput,
): SimulationImpactEstimate {
  const token = tokenNode(input.graph, change.tokenName);
  const registryToken = input.designSystemRegistry.tokens.find((item) => item.name === change.tokenName);
  const components = token ? componentsUsingToken(input.graph, token.id) : registryComponentsRequiringToken(input.designSystemRegistry, change.tokenName).flatMap((component) => graphComponentsForRegistryComponent(input.graph, component));
  const routes = routesForComponents(input.graph, components);
  const findings = findingsForComponents(input.graph, components).filter((finding) => textIncludes(`${finding.expected} ${finding.actual}`, change.tokenName));
  const policies = policiesForComponents(input.graph, components);
  const releases = releasesForRoutes(input.graph, routes);
  const historicalSignals = tokenHistoricalSignals(input.historicalInsights, change.tokenName);
  const evidence = evidenceFor({
    nodes: [...(token ? [token] : []), ...components, ...findings, ...policies, ...releases],
    components,
    routes,
    tokens: unique([change.tokenName, ...(registryToken ? [registryToken.name] : [])]),
    policies,
    findings,
    releases,
    historicalSignals,
  });
  const blastRadiusScore = blastRadiusScoreFor(evidence);
  const releaseImpactScore = releaseImpactScoreFor(evidence, historicalSignals, blastRadiusScore, change.type);

  return {
    changeId: `change-${index + 1}:token:${slug(change.tokenName)}`,
    changeType: change.type,
    blastRadiusScore,
    releaseImpactScore,
    confidence: confidenceFor(evidence, input.historicalInsights),
    summary: `Changing token ${change.tokenName} affects ${evidence.componentIds.length} component(s) across ${evidence.routes.length} route(s).`,
    explanation: [
      `token:${change.tokenName}`,
      `registry-token:${registryToken ? "present" : "missing"}`,
      `affected-components:${evidence.componentIds.length}`,
      `affected-routes:${evidence.routes.length}`,
      `historical-signals:${historicalSignals.length}`,
    ],
    evidence,
  };
}

function componentMigrationEstimate(
  change: ComponentMigrationSimulation,
  index: number,
  input: GovernanceSimulationInput,
): SimulationImpactEstimate {
  const components = componentNodes(input.graph).filter(
    (component) =>
      component.componentId === change.fromComponentId ||
      component.componentName === change.fromComponentId ||
      component.id === change.fromComponentId,
  );
  const registryComponent = input.designSystemRegistry.components.find((component) => component.id === change.toRegistryComponentId);
  const routes = routesForComponents(input.graph, components);
  const findings = findingsForComponents(input.graph, components);
  const policies = policiesForComponents(input.graph, components);
  const releases = releasesForRoutes(input.graph, routes);
  const historicalSignals = componentHistoricalSignals(input.historicalInsights, change.fromComponentId);
  const registryTokens = registryComponentTokens(input.designSystemRegistry, registryComponent);
  const evidence = evidenceFor({
    nodes: [...components, ...findings, ...policies, ...releases],
    components,
    routes,
    tokens: registryTokens.map((token) => token.name),
    policies,
    findings,
    releases,
    historicalSignals,
  });
  const blastRadiusScore = blastRadiusScoreFor(evidence);
  const releaseImpactScore = releaseImpactScoreFor(evidence, historicalSignals, blastRadiusScore, change.type);

  return {
    changeId: `change-${index + 1}:component:${slug(change.fromComponentId)}-to-${slug(change.toRegistryComponentId)}`,
    changeType: change.type,
    blastRadiusScore,
    releaseImpactScore,
    confidence: confidenceFor(evidence, input.historicalInsights),
    summary: `Migrating ${change.fromComponentId} to ${registryComponent?.name ?? change.toRegistryComponentId} affects ${evidence.routes.length} route(s).`,
    explanation: [
      `from-component:${change.fromComponentId}`,
      `to-registry-component:${change.toRegistryComponentId}:${registryComponent ? "present" : "missing"}`,
      `affected-findings:${evidence.findingIds.length}`,
      `historical-signals:${historicalSignals.length}`,
    ],
    evidence,
  };
}

function policyChangeEstimate(
  change: PolicyChangeSimulation,
  index: number,
  input: GovernanceSimulationInput,
): SimulationImpactEstimate {
  const policy = policyNodes(input.graph).find((node) => node.policyId === change.policyId);
  const targetComponents = componentTargetsForPolicy(input.graph, change);
  const routes = routesForComponents(input.graph, targetComponents);
  const findings = findingsForComponents(input.graph, targetComponents).filter((finding) =>
    textIncludes(finding.findingId, change.policyId) || textIncludes(`${finding.expected} ${finding.actual}`, change.policyId),
  );
  const releases = releasesForRoutes(input.graph, routes);
  const historicalSignals = policyHistoricalSignals(input.historicalInsights, change.policyId);
  const evidence = evidenceFor({
    nodes: [...(policy ? [policy] : []), ...targetComponents, ...findings, ...releases],
    components: targetComponents,
    routes,
    tokens: [],
    policies: policy ? [policy] : [],
    findings,
    releases,
    historicalSignals,
  });
  const blastRadiusScore = blastRadiusScoreFor(evidence);
  const actionRisk = change.action === "remove" ? 12 : change.action === "modify" ? 7 : 4;
  const releaseImpactScore = clampScore(releaseImpactScoreFor(evidence, historicalSignals, blastRadiusScore, change.type) + actionRisk);

  return {
    changeId: `change-${index + 1}:policy:${slug(change.policyId)}:${change.action}`,
    changeType: change.type,
    blastRadiusScore,
    releaseImpactScore,
    confidence: confidenceFor(evidence, input.historicalInsights),
    summary: `${change.action} policy ${change.policyId} affects ${evidence.componentIds.length} component(s) and ${evidence.routes.length} route(s).`,
    explanation: [
      `policy:${change.policyId}`,
      `action:${change.action}`,
      `affected-components:${evidence.componentIds.length}`,
      `affected-findings:${evidence.findingIds.length}`,
      `historical-signals:${historicalSignals.length}`,
    ],
    evidence,
  };
}

function componentTargetsForPolicy(
  graph: GovernanceKnowledgeGraph,
  change: PolicyChangeSimulation,
): readonly ComponentGraphNode[] {
  if (change.affectedComponentIds && change.affectedComponentIds.length > 0) {
    const ids = new Set(change.affectedComponentIds);
    return componentNodes(graph).filter((component) => ids.has(component.componentId) || ids.has(component.componentName));
  }
  const policy = policyNodes(graph).find((node) => node.policyId === change.policyId);
  if (!policy) {
    return [];
  }
  return graph.edges
    .filter((edge) => edge.type === "policy_validates_component" && edge.from === policy.id)
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.to))
    .filter((node): node is ComponentGraphNode => node?.type === "component");
}

function blastRadiusScoreFor(evidence: SimulationEvidence): number {
  return clampScore(
    evidence.componentIds.length * 8 +
      evidence.routes.length * 10 +
      evidence.findingIds.length * 5 +
      evidence.releaseIds.length * 4 +
      evidence.policyIds.length * 3,
  );
}

function releaseImpactScoreFor(
  evidence: SimulationEvidence,
  historicalSignals: readonly string[],
  blastRadiusScore: number,
  changeType: GovernanceSimulationChange["type"],
): number {
  const changeRisk = changeType === "component-migration" ? 10 : changeType === "policy-change" ? 8 : 6;
  return clampScore(blastRadiusScore * 0.55 + historicalSignals.length * 8 + evidence.findingIds.length * 4 + changeRisk);
}

function confidenceFor(evidence: SimulationEvidence, historicalInsights: HistoricalInsights): number {
  const evidenceKinds = [
    evidence.nodeIds,
    evidence.componentIds,
    evidence.routes,
    evidence.findingIds,
    evidence.releaseIds,
    evidence.historicalSignals,
  ].filter((items) => items.length > 0).length;
  const historyBonus = historicalInsights.analyzedExecutionCount > 1 ? 0.15 : 0;
  return Number(Math.min(1, 0.35 + evidenceKinds * 0.08 + historyBonus).toFixed(2));
}

function tokenHistoricalSignals(insights: HistoricalInsights, tokenName: string): readonly string[] {
  return unique([
    ...insights.recurringViolations
      .filter((violation) => textIncludes(violation.signature, tokenName))
      .map((violation) => `recurring-token:${violation.signature}:${violation.occurrenceCount}`),
    ...insights.regressions
      .filter((regression) => textIncludes(regression.signature, tokenName))
      .map((regression) => `regression-token:${regression.signature}`),
  ]);
}

function componentHistoricalSignals(insights: HistoricalInsights, componentId: string): readonly string[] {
  return unique([
    ...insights.componentFailureFrequency
      .filter((component) => component.component === componentId)
      .map((component) => `component-history:${component.component}:${component.occurrenceCount}`),
    ...insights.recurringViolations
      .filter((violation) => violation.component === componentId)
      .map((violation) => `recurring-component:${violation.signature}:${violation.occurrenceCount}`),
  ]);
}

function policyHistoricalSignals(insights: HistoricalInsights, policyId: string): readonly string[] {
  return unique([
    ...insights.recurringViolations
      .filter((violation) => textIncludes(violation.signature, policyId))
      .map((violation) => `recurring-policy:${violation.signature}:${violation.occurrenceCount}`),
    ...insights.regressions
      .filter((regression) => textIncludes(regression.signature, policyId))
      .map((regression) => `regression-policy:${regression.signature}`),
  ]);
}

function evidenceFor(input: {
  readonly nodes: readonly { readonly id: string }[];
  readonly components: readonly ComponentGraphNode[];
  readonly routes: readonly string[];
  readonly tokens: readonly string[];
  readonly policies: readonly PolicyGraphNode[];
  readonly findings: readonly FindingGraphNode[];
  readonly releases: readonly ReleaseGraphNode[];
  readonly historicalSignals: readonly string[];
}): SimulationEvidence {
  return {
    nodeIds: unique(input.nodes.map((node) => node.id)),
    componentIds: unique(input.components.map((component) => component.componentId)),
    routes: unique(input.routes),
    tokenNames: unique(input.tokens),
    policyIds: unique(input.policies.map((policy) => policy.policyId)),
    findingIds: unique(input.findings.map((finding) => finding.findingId)),
    releaseIds: unique(input.releases.map((release) => release.releaseId)),
    historicalSignals: unique(input.historicalSignals),
  };
}

function componentsUsingToken(graph: GovernanceKnowledgeGraph, tokenNodeId: string): readonly ComponentGraphNode[] {
  return graph.edges
    .filter((edge) => edge.type === "component_uses_token" && edge.to === tokenNodeId)
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is ComponentGraphNode => node?.type === "component");
}

function routesForComponents(graph: GovernanceKnowledgeGraph, components: readonly ComponentGraphNode[]): readonly string[] {
  const componentIds = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "route_contains_component" && componentIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is RouteGraphNode => node?.type === "route")
    .map((route) => route.route);
}

function findingsForComponents(graph: GovernanceKnowledgeGraph, components: readonly ComponentGraphNode[]): readonly FindingGraphNode[] {
  const componentIds = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "finding_affects_component" && componentIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is FindingGraphNode => node?.type === "finding");
}

function policiesForComponents(graph: GovernanceKnowledgeGraph, components: readonly ComponentGraphNode[]): readonly PolicyGraphNode[] {
  const componentIds = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "policy_validates_component" && componentIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is PolicyGraphNode => node?.type === "policy");
}

function releasesForRoutes(graph: GovernanceKnowledgeGraph, routes: readonly string[]): readonly ReleaseGraphNode[] {
  const routeIds = new Set(routeNodes(graph).filter((route) => routes.includes(route.route)).map((route) => route.id));
  return graph.edges
    .filter((edge) => edge.type === "release_contains_route" && routeIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is ReleaseGraphNode => node?.type === "release");
}

function registryComponentsRequiringToken(
  registry: DesignSystemRegistry,
  tokenName: string,
): readonly DesignSystemComponentDefinition[] {
  return registry.components.filter((component) =>
    [
      ...(component.requiredTokens ?? []),
      ...(component.variants ?? []).flatMap((variant) => variant.requiredTokens ?? []),
      ...(component.states ?? []).flatMap((state) => state.requiredTokens ?? []),
    ].includes(tokenName),
  );
}

function graphComponentsForRegistryComponent(
  graph: GovernanceKnowledgeGraph,
  registryComponent: DesignSystemComponentDefinition,
): readonly ComponentGraphNode[] {
  return componentNodes(graph).filter(
    (component) => component.componentId === registryComponent.name || component.componentName === registryComponent.name || component.componentId === registryComponent.id,
  );
}

function registryComponentTokens(
  registry: DesignSystemRegistry,
  component: DesignSystemComponentDefinition | undefined,
): readonly DesignSystemTokenDefinition[] {
  if (!component) {
    return [];
  }
  const tokenNames = new Set([
    ...(component.requiredTokens ?? []),
    ...(component.variants ?? []).flatMap((variant) => variant.requiredTokens ?? []),
    ...(component.states ?? []).flatMap((state) => state.requiredTokens ?? []),
  ]);
  return registry.tokens.filter((token) => tokenNames.has(token.name));
}

function tokenNode(graph: GovernanceKnowledgeGraph, tokenName: string): DesignTokenGraphNode | undefined {
  return graph.nodes.find((node): node is DesignTokenGraphNode => node.type === "design-token" && node.tokenName === tokenName);
}

function componentNodes(graph: GovernanceKnowledgeGraph): readonly ComponentGraphNode[] {
  return graph.nodes.filter((node): node is ComponentGraphNode => node.type === "component");
}

function policyNodes(graph: GovernanceKnowledgeGraph): readonly PolicyGraphNode[] {
  return graph.nodes.filter((node): node is PolicyGraphNode => node.type === "policy");
}

function routeNodes(graph: GovernanceKnowledgeGraph): readonly RouteGraphNode[] {
  return graph.nodes.filter((node): node is RouteGraphNode => node.type === "route");
}

function recommendationsFor(estimates: readonly SimulationImpactEstimate[]): readonly string[] {
  return estimates.map((estimate) => {
    if (estimate.releaseImpactScore >= 75) {
      return `${estimate.changeId}: require release readiness review before implementation.`;
    }
    if (estimate.blastRadiusScore >= 50) {
      return `${estimate.changeId}: stage rollout by affected route and component groups.`;
    }
    return `${estimate.changeId}: proceed with targeted governance verification.`;
  });
}

function textIncludes(text: string, value: string): boolean {
  return text.toLowerCase().includes(value.toLowerCase());
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

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
