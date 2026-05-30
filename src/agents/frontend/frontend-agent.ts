import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type {
  ComponentGraphNode,
  DesignTokenGraphNode,
  FindingGraphNode,
  GovernanceKnowledgeGraph,
  PolicyGraphNode,
  RouteGraphNode,
} from "../../intelligence/knowledge-graph/index.js";

export type FrontendInsightCategory =
  | "component-misuse"
  | "variant-misuse"
  | "token-misuse"
  | "implementation-risk";

export interface FrontendInsightEvidence {
  readonly nodeIds: readonly string[];
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly findingIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly tokenNames: readonly string[];
}

export interface FrontendInsightFinding {
  readonly id: string;
  readonly category: FrontendInsightCategory;
  readonly severity: "info" | "warning" | "critical";
  readonly summary: string;
  readonly evidence: FrontendInsightEvidence;
  readonly recommendation: string;
}

export interface FrontendInsightsReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly implementationQualityScore: number;
  readonly componentMisuseCount: number;
  readonly variantMisuseCount: number;
  readonly tokenMisuseCount: number;
  readonly highRiskComponentCount: number;
  readonly findings: readonly FrontendInsightFinding[];
}

export interface FrontendAgentRequest {
  readonly graph: GovernanceKnowledgeGraph;
  readonly generatedAt?: string | undefined;
}

export interface FrontendAgentDependencies {
  readonly logger?: OperationalLogger | undefined;
}

export class FrontendAgent {
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: FrontendAgentDependencies = {}) {
    this.logger = dependencies.logger ?? createAgentLogger("FrontendAgent");
  }

  analyze(request: FrontendAgentRequest): FrontendInsightsReport {
    const generatedAt = request.generatedAt ?? new Date().toISOString();
    const trace = this.logger.start("frontend.analysis", {
      correlationId: `frontend:${generatedAt}`,
      metadata: {
        graphId: request.graph.graphId,
        nodeCount: request.graph.nodes.length,
        edgeCount: request.graph.edges.length,
      },
    });

    try {
      const findings = [
        ...componentMisuseFindings(request.graph),
        ...variantMisuseFindings(request.graph),
        ...tokenMisuseFindings(request.graph),
        ...implementationRiskFindings(request.graph),
      ].filter(hasEvidence);
      const componentMisuseCount = findings.filter((finding) => finding.category === "component-misuse").length;
      const variantMisuseCount = findings.filter((finding) => finding.category === "variant-misuse").length;
      const tokenMisuseCount = findings.filter((finding) => finding.category === "token-misuse").length;
      const highRiskComponentCount = highRiskComponents(request.graph).length;
      const implementationQualityScore = score(findings, highRiskComponentCount);

      this.logger.complete(trace, {
        implementationQualityScore,
        findingCount: findings.length,
      });

      return {
        reportId: `frontend-insights:${request.graph.graphId}`,
        generatedAt,
        implementationQualityScore,
        componentMisuseCount,
        variantMisuseCount,
        tokenMisuseCount,
        highRiskComponentCount,
        findings,
      };
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }
}

function componentMisuseFindings(graph: GovernanceKnowledgeGraph): readonly FrontendInsightFinding[] {
  const misuseFindings = findingNodes(graph).filter((finding) =>
    textMatches(finding, ["component misuse", "component-misuse", "invalid component", "inline style", "unsupported component"]),
  );
  if (misuseFindings.length === 0) {
    return [];
  }
  const components = componentsForFindings(graph, misuseFindings);

  return [
    {
      id: "frontend.component-misuse.detected",
      category: "component-misuse",
      severity: highestSeverity(misuseFindings),
      summary: `${misuseFindings.length} component implementation misuse finding(s) are present.`,
      evidence: evidenceFor(graph, misuseFindings, components),
      recommendation: "Replace unsupported component usage with registry-approved components or update the contract evidence.",
    },
  ];
}

function variantMisuseFindings(graph: GovernanceKnowledgeGraph): readonly FrontendInsightFinding[] {
  const variantFindings = findingNodes(graph).filter((finding) =>
    textMatches(finding, ["variant", "variant-rule", "invalid-component-variant", "invalid component variant"]),
  );
  if (variantFindings.length === 0) {
    return [];
  }
  const components = componentsForFindings(graph, variantFindings);

  return [
    {
      id: "frontend.variant-misuse.detected",
      category: "variant-misuse",
      severity: highestSeverity(variantFindings),
      summary: `${variantFindings.length} variant implementation finding(s) are present.`,
      evidence: evidenceFor(graph, variantFindings, components),
      recommendation: "Align runtime variant selectors and required variant tokens with the generated governance contracts.",
    },
  ];
}

function tokenMisuseFindings(graph: GovernanceKnowledgeGraph): readonly FrontendInsightFinding[] {
  const tokenFindings = findingNodes(graph).filter((finding) =>
    textMatches(finding, ["token", "token-drift", "required-design-token", "css variable"]),
  );
  const componentsWithoutTokens = componentNodes(graph).filter(
    (component) => tokensForComponent(graph, component.id).length === 0,
  );
  if (tokenFindings.length === 0 && componentsWithoutTokens.length === 0) {
    return [];
  }
  const affectedComponents = uniqueComponents([
    ...componentsForFindings(graph, tokenFindings),
    ...componentsWithoutTokens,
  ]);

  return [
    {
      id: "frontend.token-misuse.detected",
      category: "token-misuse",
      severity: tokenFindings.length > 0 ? highestSeverity(tokenFindings) : "warning",
      summary:
        tokenFindings.length > 0
          ? `${tokenFindings.length} token implementation finding(s) are present.`
          : `${componentsWithoutTokens.length} component(s) have no token usage evidence.`,
      evidence: evidenceFor(graph, tokenFindings, affectedComponents),
      recommendation: "Use registry-defined design tokens and ensure runtime evidence captures component token usage.",
    },
  ];
}

function implementationRiskFindings(graph: GovernanceKnowledgeGraph): readonly FrontendInsightFinding[] {
  const riskyComponents = highRiskComponents(graph);
  const criticalFindings = findingNodes(graph).filter((finding) => finding.severity === "critical");
  if (riskyComponents.length === 0 && criticalFindings.length === 0) {
    return [];
  }
  const evidenceFindings = criticalFindings.length > 0 ? criticalFindings : findingsForComponents(graph, riskyComponents);
  const evidenceComponents = riskyComponents.length > 0 ? riskyComponents : componentsForFindings(graph, criticalFindings);

  return [
    {
      id: "frontend.implementation-risk.detected",
      category: "implementation-risk",
      severity: criticalFindings.length > 0 ? "critical" : "warning",
      summary: `${evidenceComponents.length} component(s) have elevated implementation risk.`,
      evidence: evidenceFor(graph, evidenceFindings, evidenceComponents),
      recommendation: "Prioritize remediation for components with critical findings or repeated policy validation failures.",
    },
  ];
}

function highRiskComponents(graph: GovernanceKnowledgeGraph): readonly ComponentGraphNode[] {
  return componentNodes(graph).filter((component) => {
    const findings = findingsForComponents(graph, [component]);
    const policyCount = graph.edges.filter((edge) => edge.type === "policy_validates_component" && edge.to === component.id).length;
    return findings.some((finding) => finding.severity === "critical") || findings.length >= 2 || policyCount >= 2;
  });
}

function evidenceFor(
  graph: GovernanceKnowledgeGraph,
  findings: readonly FindingGraphNode[],
  components: readonly ComponentGraphNode[],
): FrontendInsightEvidence {
  const componentIds = new Set(components.map((component) => component.id));
  const policyNodes = policiesForEvidence(graph, findings, components);
  const tokenNodes = uniqueTokens(components.flatMap((component) => tokensForComponent(graph, component.id)));
  const routes = unique(
    graph.edges
      .filter((edge) => edge.type === "route_contains_component" && componentIds.has(edge.to))
      .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
      .filter((node): node is RouteGraphNode => node?.type === "route")
      .map((route) => route.route),
  );

  return {
    nodeIds: unique([
      ...findings.map((finding) => finding.id),
      ...components.map((component) => component.id),
      ...policyNodes.map((policy) => policy.id),
      ...tokenNodes.map((token) => token.id),
    ]),
    componentIds: unique(components.map((component) => component.componentId)),
    routes,
    findingIds: unique(findings.map((finding) => finding.findingId)),
    policyIds: unique(policyNodes.map((policy) => policy.policyId)),
    tokenNames: unique(tokenNodes.map((token) => token.tokenName)),
  };
}

function componentNodes(graph: GovernanceKnowledgeGraph): readonly ComponentGraphNode[] {
  return graph.nodes.filter((node): node is ComponentGraphNode => node.type === "component");
}

function findingNodes(graph: GovernanceKnowledgeGraph): readonly FindingGraphNode[] {
  return graph.nodes.filter((node): node is FindingGraphNode => node.type === "finding");
}

function componentsForFindings(
  graph: GovernanceKnowledgeGraph,
  findings: readonly FindingGraphNode[],
): readonly ComponentGraphNode[] {
  const findingIds = new Set(findings.map((finding) => finding.id));
  return uniqueComponents(
    graph.edges
      .filter((edge) => edge.type === "finding_affects_component" && findingIds.has(edge.from))
      .flatMap((edge) => graph.nodes.find((node) => node.id === edge.to))
      .filter((node): node is ComponentGraphNode => node?.type === "component"),
  );
}

function findingsForComponents(
  graph: GovernanceKnowledgeGraph,
  components: readonly ComponentGraphNode[],
): readonly FindingGraphNode[] {
  const componentIds = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "finding_affects_component" && componentIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is FindingGraphNode => node?.type === "finding");
}

function policiesForComponents(
  graph: GovernanceKnowledgeGraph,
  components: readonly ComponentGraphNode[],
): readonly PolicyGraphNode[] {
  const componentIds = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "policy_validates_component" && componentIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is PolicyGraphNode => node?.type === "policy");
}

function policiesForEvidence(
  graph: GovernanceKnowledgeGraph,
  findings: readonly FindingGraphNode[],
  components: readonly ComponentGraphNode[],
): readonly PolicyGraphNode[] {
  const policies = policiesForComponents(graph, components);
  if (findings.length === 0) {
    return policies;
  }
  const findingPolicyIds = new Set(findings.map(policyIdForFinding));
  return policies.filter((policy) => findingPolicyIds.has(policy.policyId));
}

function tokensForComponent(graph: GovernanceKnowledgeGraph, componentNodeId: string): readonly DesignTokenGraphNode[] {
  return graph.edges
    .filter((edge) => edge.type === "component_uses_token" && edge.from === componentNodeId)
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.to))
    .filter((node): node is DesignTokenGraphNode => node?.type === "design-token");
}

function textMatches(finding: FindingGraphNode, needles: readonly string[]): boolean {
  const haystack = [finding.findingId, finding.expected, finding.actual].join(" ").toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function highestSeverity(findings: readonly FindingGraphNode[]): FrontendInsightFinding["severity"] {
  if (findings.some((finding) => finding.severity === "critical")) {
    return "critical";
  }
  if (findings.some((finding) => finding.severity === "warning")) {
    return "warning";
  }
  return "info";
}

function policyIdForFinding(finding: FindingGraphNode): string {
  const parts = finding.findingId.split(":").filter(Boolean);
  if (parts.length >= 3) {
    return parts.at(-2) ?? finding.findingId;
  }
  return finding.findingId;
}

function hasEvidence(finding: FrontendInsightFinding): boolean {
  return (
    finding.evidence.nodeIds.length > 0 ||
    finding.evidence.componentIds.length > 0 ||
    finding.evidence.routes.length > 0 ||
    finding.evidence.findingIds.length > 0 ||
    finding.evidence.policyIds.length > 0 ||
    finding.evidence.tokenNames.length > 0
  );
}

function score(findings: readonly FrontendInsightFinding[], highRiskComponentCount: number): number {
  const penalty = findings.reduce((total, finding) => {
    return total + (finding.severity === "critical" ? 28 : finding.severity === "warning" ? 12 : 4);
  }, highRiskComponentCount * 6);
  return clampScore(100 - penalty);
}

function uniqueComponents(components: readonly ComponentGraphNode[]): readonly ComponentGraphNode[] {
  return [...new Map(components.map((component) => [component.id, component])).values()].sort((left, right) =>
    left.componentId.localeCompare(right.componentId),
  );
}

function uniqueTokens(tokens: readonly DesignTokenGraphNode[]): readonly DesignTokenGraphNode[] {
  return [...new Map(tokens.map((token) => [token.id, token])).values()].sort((left, right) =>
    left.tokenName.localeCompare(right.tokenName),
  );
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
