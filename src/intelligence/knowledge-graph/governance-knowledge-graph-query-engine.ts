import type {
  ComponentGraphNode,
  DesignTokenGraphNode,
  FindingGraphNode,
  GovernanceKnowledgeGraph,
  GovernanceKnowledgeGraphEdge,
  GovernanceKnowledgeGraphNode,
  GovernanceKnowledgeGraphNodeType,
  GovernanceKnowledgeGraphRelationshipType,
  RouteGraphNode,
} from "./types.js";

export class GovernanceKnowledgeGraphQueryEngine {
  constructor(private readonly graph: GovernanceKnowledgeGraph) {}

  nodes(type?: GovernanceKnowledgeGraphNodeType): readonly GovernanceKnowledgeGraphNode[] {
    return this.graph.nodes.filter((node) => (type ? node.type === type : true));
  }

  edges(type?: GovernanceKnowledgeGraphRelationshipType): readonly GovernanceKnowledgeGraphEdge[] {
    return this.graph.edges.filter((edge) => (type ? edge.type === type : true));
  }

  neighbors(nodeId: string, relationshipType?: GovernanceKnowledgeGraphRelationshipType): readonly GovernanceKnowledgeGraphNode[] {
    const neighborIds = this.graph.edges
      .filter((edge) => edge.from === nodeId || edge.to === nodeId)
      .filter((edge) => (relationshipType ? edge.type === relationshipType : true))
      .map((edge) => (edge.from === nodeId ? edge.to : edge.from));
    return this.nodesByIds(neighborIds);
  }

  componentsForRoute(route: string): readonly ComponentGraphNode[] {
    const routeNode = this.graph.nodes.find((node): node is RouteGraphNode => node.type === "route" && node.route === route);
    if (!routeNode) {
      return [];
    }
    return this.graph.edges
      .filter((edge) => edge.type === "route_contains_component" && edge.from === routeNode.id)
      .flatMap((edge) => this.nodeById(edge.to))
      .filter((node): node is ComponentGraphNode => node?.type === "component");
  }

  tokensForComponent(componentId: string): readonly DesignTokenGraphNode[] {
    const componentNode = this.graph.nodes.find(
      (node): node is ComponentGraphNode =>
        node.type === "component" && (node.componentId === componentId || node.id === componentId),
    );
    if (!componentNode) {
      return [];
    }
    return this.graph.edges
      .filter((edge) => edge.type === "component_uses_token" && edge.from === componentNode.id)
      .flatMap((edge) => this.nodeById(edge.to))
      .filter((node): node is DesignTokenGraphNode => node?.type === "design-token");
  }

  findingsForComponent(componentId: string): readonly FindingGraphNode[] {
    const componentNode = this.graph.nodes.find(
      (node): node is ComponentGraphNode =>
        node.type === "component" && (node.componentId === componentId || node.id === componentId),
    );
    if (!componentNode) {
      return [];
    }
    return this.graph.edges
      .filter((edge) => edge.type === "finding_affects_component" && edge.to === componentNode.id)
      .flatMap((edge) => this.nodeById(edge.from))
      .filter((node): node is FindingGraphNode => node?.type === "finding");
  }

  routesForRelease(releaseId: string): readonly RouteGraphNode[] {
    const releaseNode = this.graph.nodes.find(
      (node) => node.type === "release" && (node.releaseId === releaseId || node.id === releaseId),
    );
    if (!releaseNode) {
      return [];
    }
    return this.graph.edges
      .filter((edge) => edge.type === "release_contains_route" && edge.from === releaseNode.id)
      .flatMap((edge) => this.nodeById(edge.to))
      .filter((node): node is RouteGraphNode => node?.type === "route");
  }

  private nodesByIds(nodeIds: readonly string[]): readonly GovernanceKnowledgeGraphNode[] {
    const ids = new Set(nodeIds);
    return this.graph.nodes.filter((node) => ids.has(node.id));
  }

  private nodeById(nodeId: string): GovernanceKnowledgeGraphNode | undefined {
    return this.graph.nodes.find((node) => node.id === nodeId);
  }
}
