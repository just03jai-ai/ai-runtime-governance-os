import type {
  GovernanceKnowledgeGraph,
  GovernanceKnowledgeGraphQuery,
  GovernanceKnowledgeGraphRepository,
} from "./types.js";

export class InMemoryGovernanceKnowledgeGraphRepository implements GovernanceKnowledgeGraphRepository {
  private readonly graphs = new Map<string, GovernanceKnowledgeGraph>();

  constructor(initialGraphs: readonly GovernanceKnowledgeGraph[] = []) {
    for (const graph of initialGraphs) {
      this.graphs.set(graph.graphId, graph);
    }
  }

  async save(graph: GovernanceKnowledgeGraph): Promise<void> {
    this.graphs.set(graph.graphId, graph);
  }

  async load(graphId: string): Promise<GovernanceKnowledgeGraph | undefined> {
    return this.graphs.get(graphId);
  }

  async query(query: GovernanceKnowledgeGraphQuery = {}): Promise<GovernanceKnowledgeGraph> {
    const graphs = [...this.graphs.values()];
    const nodes = graphs
      .flatMap((graph) => graph.nodes)
      .filter((node) => (query.nodeType ? node.type === query.nodeType : true))
      .filter((node) => (query.nodeId ? node.id === query.nodeId : true));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graphs
      .flatMap((graph) => graph.edges)
      .filter((edge) => (query.relationshipType ? edge.type === query.relationshipType : true))
      .filter((edge) => (query.nodeId ? edge.from === query.nodeId || edge.to === query.nodeId : true))
      .filter((edge) => nodeIds.size === 0 || nodeIds.has(edge.from) || nodeIds.has(edge.to));

    return {
      graphId: "query:in-memory",
      generatedAt: new Date().toISOString(),
      nodes: unique(nodes),
      edges: unique(edges),
    };
  }
}

function unique<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
}
