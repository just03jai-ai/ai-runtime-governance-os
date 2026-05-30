import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type { ComponentHealthReport, ComponentIntelligenceProfile } from "../../intelligence/component-intelligence/index.js";
import type {
  ComponentGraphNode,
  GovernanceKnowledgeGraph,
  DesignTokenGraphNode,
  FindingGraphNode,
} from "../../intelligence/knowledge-graph/index.js";
import type { RouteHealthProfile, RouteHealthReport } from "../../intelligence/route-intelligence/index.js";

export type DesignerInsightCategory =
  | "typography"
  | "spacing"
  | "token-adoption"
  | "hierarchy"
  | "design-system-compliance";

export interface DesignerInsightEvidence {
  readonly nodeIds: readonly string[];
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly findingIds: readonly string[];
}

export interface DesignerInsightFinding {
  readonly id: string;
  readonly category: DesignerInsightCategory;
  readonly severity: "info" | "warning" | "critical";
  readonly summary: string;
  readonly evidence: DesignerInsightEvidence;
  readonly recommendation: string;
}

export interface DesignerInsightsReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly visualGovernanceScore: number;
  readonly typographyScore: number;
  readonly spacingScore: number;
  readonly tokenAdoptionScore: number;
  readonly hierarchyConsistencyScore: number;
  readonly designSystemComplianceScore: number;
  readonly findings: readonly DesignerInsightFinding[];
}

export interface DesignerAgentRequest {
  readonly graph: GovernanceKnowledgeGraph;
  readonly componentHealthReport: ComponentHealthReport;
  readonly routeHealthReport: RouteHealthReport;
  readonly generatedAt?: string | undefined;
}

export interface DesignerAgentDependencies {
  readonly logger?: OperationalLogger | undefined;
}

export class DesignerAgent {
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: DesignerAgentDependencies = {}) {
    this.logger = dependencies.logger ?? createAgentLogger("DesignerAgent");
  }

  analyze(request: DesignerAgentRequest): DesignerInsightsReport {
    const generatedAt = request.generatedAt ?? new Date().toISOString();
    const trace = this.logger.start("designer.analysis", {
      correlationId: `designer:${generatedAt}`,
      metadata: {
        graphId: request.graph.graphId,
        componentCount: request.componentHealthReport.componentCount,
        routeCount: request.routeHealthReport.routeCount,
      },
    });

    try {
      const findings = [
        ...typographyFindings(request.graph, request.componentHealthReport.components),
        ...spacingFindings(request.graph, request.componentHealthReport.components),
        ...tokenAdoptionFindings(request.graph, request.componentHealthReport.components),
        ...hierarchyFindings(request.routeHealthReport.routes),
        ...designSystemComplianceFindings(request.componentHealthReport.components, request.routeHealthReport.routes),
      ].filter(hasEvidence);
      const typographyScore = categoryScore(findings, "typography");
      const spacingScore = categoryScore(findings, "spacing");
      const tokenAdoptionScore = categoryScore(findings, "token-adoption");
      const hierarchyConsistencyScore = categoryScore(findings, "hierarchy");
      const designSystemComplianceScore = categoryScore(findings, "design-system-compliance");
      const visualGovernanceScore = average([
        typographyScore,
        spacingScore,
        tokenAdoptionScore,
        hierarchyConsistencyScore,
        designSystemComplianceScore,
      ]);

      this.logger.complete(trace, {
        visualGovernanceScore,
        findingCount: findings.length,
      });

      return {
        reportId: `designer-insights:${request.graph.graphId}`,
        generatedAt,
        visualGovernanceScore,
        typographyScore,
        spacingScore,
        tokenAdoptionScore,
        hierarchyConsistencyScore,
        designSystemComplianceScore,
        findings,
      };
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }
}

function typographyFindings(
  graph: GovernanceKnowledgeGraph,
  components: readonly ComponentIntelligenceProfile[],
): readonly DesignerInsightFinding[] {
  const typographyTokens = tokenNodes(graph).filter((token) => token.category === "typography");
  const typographyFindingNodes = findingNodes(graph).filter((finding) => textMatches(finding, ["typography", "font", "line-height"]));
  const affectedComponents = componentsForFindings(graph, typographyFindingNodes, components);
  const componentsWithoutTypographyTokens = components.filter(
    (component) => !component.tokenUsage.some((token) => token.category === "typography"),
  );
  const evidenceComponents = affectedComponents.length > 0 ? affectedComponents : componentsWithoutTypographyTokens;

  if (typographyTokens.length > 0 && typographyFindingNodes.length === 0 && componentsWithoutTypographyTokens.length === 0) {
    return [];
  }

  return [
    {
      id: "designer.typography.consistency",
      category: "typography",
      severity: typographyFindingNodes.some((finding) => finding.severity === "critical") ? "critical" : "warning",
      summary:
        typographyTokens.length === 0
          ? "No typography token evidence is present in the governance graph."
          : `${typographyFindingNodes.length} typography-related finding(s) are present.`,
      evidence: {
        nodeIds: unique([
          ...typographyTokens.map((token) => token.id),
          ...typographyFindingNodes.map((finding) => finding.id),
          ...componentNodeIdsForProfiles(graph, evidenceComponents),
        ]),
        componentIds: evidenceComponents.map((component) => component.componentId),
        routes: unique(evidenceComponents.flatMap((component) => component.routeDistribution)),
        findingIds: typographyFindingNodes.map((finding) => finding.findingId),
      },
      recommendation: "Ensure text components emit approved typography tokens and align runtime evidence to registry contracts.",
    },
  ];
}

function spacingFindings(
  graph: GovernanceKnowledgeGraph,
  components: readonly ComponentIntelligenceProfile[],
): readonly DesignerInsightFinding[] {
  const spacingTokens = tokenNodes(graph).filter((token) => token.category === "spacing");
  const spacingFindingNodes = findingNodes(graph).filter((finding) => textMatches(finding, ["spacing", "padding", "margin", "grid"]));
  const affectedComponents = componentsForFindings(graph, spacingFindingNodes, components);
  const componentsWithoutSpacingTokens = components.filter(
    (component) => !component.tokenUsage.some((token) => token.category === "spacing"),
  );
  const evidenceComponents = affectedComponents.length > 0 ? affectedComponents : componentsWithoutSpacingTokens;

  if (spacingTokens.length > 0 && spacingFindingNodes.length === 0 && componentsWithoutSpacingTokens.length === 0) {
    return [];
  }

  return [
    {
      id: "designer.spacing.consistency",
      category: "spacing",
      severity: "warning",
      summary:
        spacingTokens.length === 0
          ? "No spacing token evidence is present in the governance graph."
          : `${spacingFindingNodes.length} spacing-related finding(s) are present.`,
      evidence: {
        nodeIds: unique([
          ...spacingTokens.map((token) => token.id),
          ...spacingFindingNodes.map((finding) => finding.id),
          ...componentNodeIdsForProfiles(graph, evidenceComponents),
        ]),
        componentIds: evidenceComponents.map((component) => component.componentId),
        routes: unique(evidenceComponents.flatMap((component) => component.routeDistribution)),
        findingIds: spacingFindingNodes.map((finding) => finding.findingId),
      },
      recommendation: "Normalize spacing usage through registry-backed spacing tokens and component state contracts.",
    },
  ];
}

function tokenAdoptionFindings(
  graph: GovernanceKnowledgeGraph,
  components: readonly ComponentIntelligenceProfile[],
): readonly DesignerInsightFinding[] {
  const componentsWithoutTokens = components.filter((component) => component.tokenUsage.length === 0);
  const tokenCount = tokenNodes(graph).length;
  if (componentsWithoutTokens.length === 0 && tokenCount > 0) {
    return [];
  }

  return [
    {
      id: "designer.token-adoption.coverage",
      category: "token-adoption",
      severity: componentsWithoutTokens.length > 2 ? "critical" : "warning",
      summary: `${componentsWithoutTokens.length} component(s) have no design-token usage evidence.`,
      evidence: {
        nodeIds: componentNodeIdsForProfiles(graph, componentsWithoutTokens),
        componentIds: componentsWithoutTokens.map((component) => component.componentId),
        routes: unique(componentsWithoutTokens.flatMap((component) => component.routeDistribution)),
        findingIds: [],
      },
      recommendation: "Increase runtime token capture and derive component contracts from the design-system registry.",
    },
  ];
}

function hierarchyFindings(routes: readonly RouteHealthProfile[]): readonly DesignerInsightFinding[] {
  const complexRoutes = routes.filter((route) => route.complexity >= 55 || route.componentConcentration >= 0.75);
  if (complexRoutes.length === 0) {
    return [];
  }

  return [
    {
      id: "designer.hierarchy.route-complexity",
      category: "hierarchy",
      severity: complexRoutes.some((route) => route.riskLevel === "critical") ? "critical" : "warning",
      summary: `${complexRoutes.length} route(s) show hierarchy or component concentration risk.`,
      evidence: {
        nodeIds: [],
        componentIds: [],
        routes: complexRoutes.map((route) => route.route),
        findingIds: [],
      },
      recommendation: "Review route composition for repeated high-risk components and unclear visual hierarchy.",
    },
  ];
}

function designSystemComplianceFindings(
  components: readonly ComponentIntelligenceProfile[],
  routes: readonly RouteHealthProfile[],
): readonly DesignerInsightFinding[] {
  const nonCompliantComponents = components.filter(
    (component) => component.policyViolations.length > 0 || component.healthScore < 70,
  );
  const riskyRoutes = routes.filter((route) => route.riskLevel === "high" || route.riskLevel === "critical");
  if (nonCompliantComponents.length === 0 && riskyRoutes.length === 0) {
    return [];
  }

  return [
    {
      id: "designer.design-system.compliance",
      category: "design-system-compliance",
      severity: nonCompliantComponents.some((component) => component.healthScore < 40) ? "critical" : "warning",
      summary: `${nonCompliantComponents.length} component(s) and ${riskyRoutes.length} route(s) have design-system compliance risk.`,
      evidence: {
        nodeIds: [],
        componentIds: nonCompliantComponents.map((component) => component.componentId),
        routes: riskyRoutes.map((route) => route.route),
        findingIds: [],
      },
      recommendation: "Prioritize design-system contract fixes for unhealthy components on high-risk routes.",
    },
  ];
}

function hasEvidence(finding: DesignerInsightFinding): boolean {
  return (
    finding.evidence.nodeIds.length > 0 ||
    finding.evidence.componentIds.length > 0 ||
    finding.evidence.routes.length > 0 ||
    finding.evidence.findingIds.length > 0
  );
}

function componentsForFindings(
  graph: GovernanceKnowledgeGraph,
  findings: readonly FindingGraphNode[],
  components: readonly ComponentIntelligenceProfile[],
): readonly ComponentIntelligenceProfile[] {
  const findingNodeIds = new Set(findings.map((finding) => finding.id));
  const affectedComponentNodeIds = new Set(
    graph.edges
      .filter((edge) => edge.type === "finding_affects_component" && findingNodeIds.has(edge.from))
      .map((edge) => edge.to),
  );
  const affectedComponentIds = new Set(
    graph.nodes
      .filter((node): node is ComponentGraphNode => node.type === "component" && affectedComponentNodeIds.has(node.id))
      .map((node) => node.componentId),
  );

  return components.filter((component) => affectedComponentIds.has(component.componentId));
}

function componentNodeIdsForProfiles(
  graph: GovernanceKnowledgeGraph,
  components: readonly ComponentIntelligenceProfile[],
): readonly string[] {
  const componentIds = new Set(components.map((component) => component.componentId));
  return graph.nodes
    .filter((node): node is ComponentGraphNode => node.type === "component" && componentIds.has(node.componentId))
    .map((node) => node.id);
}

function tokenNodes(graph: GovernanceKnowledgeGraph): readonly DesignTokenGraphNode[] {
  return graph.nodes.filter((node): node is DesignTokenGraphNode => node.type === "design-token");
}

function findingNodes(graph: GovernanceKnowledgeGraph): readonly FindingGraphNode[] {
  return graph.nodes.filter((node): node is FindingGraphNode => node.type === "finding");
}

function textMatches(finding: FindingGraphNode, needles: readonly string[]): boolean {
  const haystack = [finding.findingId, finding.expected, finding.actual].join(" ").toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function categoryScore(findings: readonly DesignerInsightFinding[], category: DesignerInsightCategory): number {
  const categoryFindings = findings.filter((finding) => finding.category === category);
  const penalty = categoryFindings.reduce((total, finding) => {
    return total + (finding.severity === "critical" ? 35 : finding.severity === "warning" ? 18 : 6);
  }, 0);
  return clampScore(100 - penalty);
}

function average(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
