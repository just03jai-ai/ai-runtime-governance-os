import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  GovernanceKnowledgeGraph,
  GovernanceKnowledgeGraphQuery,
  GovernanceKnowledgeGraphRepository,
} from "./types.js";
import { InMemoryGovernanceKnowledgeGraphRepository } from "./in-memory-knowledge-graph-repository.js";

export class FileGovernanceKnowledgeGraphRepository implements GovernanceKnowledgeGraphRepository {
  constructor(private readonly directory: string) {}

  async save(graph: GovernanceKnowledgeGraph): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(graph.graphId), `${JSON.stringify(graph, null, 2)}\n`, "utf8");
    await this.writeManifest([...new Set([...(await this.readManifest()), graph.graphId])].sort());
  }

  async load(graphId: string): Promise<GovernanceKnowledgeGraph | undefined> {
    try {
      return JSON.parse(await readFile(this.pathFor(graphId), "utf8")) as GovernanceKnowledgeGraph;
    } catch (error) {
      if (isNodeFileError(error) && error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  }

  async query(query: GovernanceKnowledgeGraphQuery = {}): Promise<GovernanceKnowledgeGraph> {
    const graphIds = await this.readManifest();
    const graphs = await Promise.all(graphIds.map((graphId) => this.load(graphId)));
    return new InMemoryGovernanceKnowledgeGraphRepository(
      graphs.filter((graph): graph is GovernanceKnowledgeGraph => graph !== undefined),
    ).query(query);
  }

  private pathFor(graphId: string): string {
    return join(this.directory, `${encodeURIComponent(graphId)}.json`);
  }

  private manifestPath(): string {
    return join(this.directory, "_manifest.json");
  }

  private async readManifest(): Promise<readonly string[]> {
    try {
      return JSON.parse(await readFile(this.manifestPath(), "utf8")) as readonly string[];
    } catch (error) {
      if (isNodeFileError(error) && error.code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeManifest(graphIds: readonly string[]): Promise<void> {
    await writeFile(this.manifestPath(), `${JSON.stringify(graphIds, null, 2)}\n`, "utf8");
  }
}

function isNodeFileError(error: unknown): error is Error & { readonly code: string } {
  return error instanceof Error && "code" in error;
}
