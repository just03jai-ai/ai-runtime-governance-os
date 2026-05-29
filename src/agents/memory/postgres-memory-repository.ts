import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { PostgresPool, PostgresQueryable } from "../../memory/storage/postgres-client.js";
import { withPostgresTransaction } from "../../memory/storage/postgres-client.js";
import type {
  ExecutionMetadata,
  HistoricalMemoryRepository,
  MemoryExecutionSnapshot,
  MemoryHistoryQuery,
} from "./types.js";
import { violationSignature } from "./violation-signature.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

interface MemorySnapshotRow {
  readonly run_id: string;
  readonly route: string;
  readonly route_id: string | null;
  readonly environment: ExecutionMetadata["environment"] | null;
  readonly status: ExecutionMetadata["status"] | null;
  readonly governance_score: number | null;
  readonly started_at: Date;
  readonly completed_at: Date | null;
  readonly metadata: Record<string, unknown>;
  readonly verified_findings: VerifiedFinding[];
}

export class PostgresHistoricalMemoryRepository implements HistoricalMemoryRepository {
  constructor(private readonly pool: PostgresPool) {}

  async saveExecutionSnapshot(snapshot: MemoryExecutionSnapshot): Promise<void> {
    await withPostgresTransaction(this.pool, async (client) => {
      const queryable = client as PostgresQueryable;
      await this.upsertSnapshot(queryable, snapshot.metadata);
      await queryable.query("DELETE FROM memory_verified_findings WHERE run_id = $1", [snapshot.metadata.runId]);
      await this.insertFindings(queryable, snapshot.metadata.runId, snapshot.verifiedFindings);
    });
  }

  async listExecutionSnapshots(query: MemoryHistoryQuery = {}): Promise<readonly MemoryExecutionSnapshot[]> {
    const predicates: string[] = [];
    const values: unknown[] = [];

    if (query.route) {
      values.push(query.route);
      predicates.push(`s.route = $${values.length}`);
    }

    if (query.routeId) {
      values.push(query.routeId);
      predicates.push(`s.route_id = $${values.length}`);
    }

    values.push(query.limit ?? 50);
    const limitPlaceholder = `$${values.length}`;
    const whereClause = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";

    const result = await this.pool.query<MemorySnapshotRow>(
      `
        SELECT
          s.run_id,
          s.route,
          s.route_id,
          s.environment,
          s.status,
          s.governance_score,
          s.started_at,
          s.completed_at,
          s.metadata,
          COALESCE(
            jsonb_agg(f.finding_data ORDER BY f.id) FILTER (WHERE f.id IS NOT NULL),
            '[]'::jsonb
          ) AS verified_findings
        FROM memory_execution_snapshots s
        LEFT JOIN memory_verified_findings f ON f.run_id = s.run_id
        ${whereClause}
        GROUP BY s.run_id
        ORDER BY s.started_at DESC
        LIMIT ${limitPlaceholder}
      `,
      values,
    );

    return result.rows.map((row) => ({
      metadata: {
        runId: row.run_id,
        route: row.route,
        ...(row.route_id ? { routeId: row.route_id } : {}),
        ...(row.environment ? { environment: row.environment } : {}),
        ...(row.status ? { status: row.status } : {}),
        ...(row.governance_score === null ? {} : { governanceScore: row.governance_score }),
        startedAt: row.started_at.toISOString(),
        ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
        metadata: row.metadata,
      },
      verifiedFindings: row.verified_findings,
    }));
  }

  private async upsertSnapshot(client: PostgresQueryable, metadata: ExecutionMetadata): Promise<void> {
    await client.query(
      `
        INSERT INTO memory_execution_snapshots (
          run_id, route, route_id, environment, status, governance_score, started_at, completed_at, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (run_id) DO UPDATE SET
          route = EXCLUDED.route,
          route_id = EXCLUDED.route_id,
          environment = EXCLUDED.environment,
          status = EXCLUDED.status,
          governance_score = EXCLUDED.governance_score,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at,
          metadata = EXCLUDED.metadata,
          updated_at = now()
      `,
      [
        metadata.runId,
        metadata.route,
        metadata.routeId ?? null,
        metadata.environment ?? null,
        metadata.status ?? null,
        metadata.governanceScore ?? null,
        metadata.startedAt,
        metadata.completedAt ?? null,
        json(metadata.metadata ?? {}),
      ],
    );
  }

  private async insertFindings(
    client: PostgresQueryable,
    runId: string,
    findings: readonly VerifiedFinding[],
  ): Promise<void> {
    for (const finding of findings) {
      await client.query(
        `
          INSERT INTO memory_verified_findings (
            run_id,
            finding_id,
            original_finding_id,
            violation_signature,
            status,
            severity,
            route,
            component,
            expected,
            actual,
            confidence,
            evidence,
            integrity,
            reasons,
            finding_data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `,
        [
          runId,
          finding.id,
          finding.originalFindingId,
          violationSignature(finding),
          finding.status,
          finding.severity,
          finding.route,
          finding.component,
          finding.expected,
          finding.actual,
          finding.confidence,
          json(finding.evidence),
          json(finding.integrity),
          finding.reasons,
          json(finding),
        ],
      );
    }
  }
}

function json(value: unknown): JsonValue {
  return value === undefined ? null : (value as JsonValue);
}
