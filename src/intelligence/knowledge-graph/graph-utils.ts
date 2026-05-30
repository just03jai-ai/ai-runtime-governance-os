import type {
  GovernanceKnowledgeGraph,
  GovernanceKnowledgeGraphEdge,
  GovernanceKnowledgeGraphNode,
} from "./types.js";

export function graphNodeId(namespace: string, value: string): string {
  return `${namespace}:${normalizeId(value)}`;
}

export function graphEdgeId(type: string, from: string, to: string): string {
  return `edge:${type}:${normalizeId(from)}:${normalizeId(to)}`;
}

export function mergeGraphs(
  graphId: string,
  graphs: readonly GovernanceKnowledgeGraph[],
  generatedAt: string = new Date().toISOString(),
): GovernanceKnowledgeGraph {
  return {
    graphId,
    generatedAt,
    nodes: uniqueById(graphs.flatMap((graph) => graph.nodes)),
    edges: uniqueById(graphs.flatMap((graph) => graph.edges)),
  };
}

export function buildGraph(input: {
  readonly graphId: string;
  readonly nodes: readonly GovernanceKnowledgeGraphNode[];
  readonly edges: readonly GovernanceKnowledgeGraphEdge[];
  readonly generatedAt?: string | undefined;
}): GovernanceKnowledgeGraph {
  return {
    graphId: input.graphId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    nodes: uniqueById(input.nodes),
    edges: uniqueById(input.edges),
  };
}

function uniqueById<T extends { readonly id: string }>(items: readonly T[]): readonly T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "");
}
