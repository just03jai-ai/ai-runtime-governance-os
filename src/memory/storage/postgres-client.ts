import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from "pg";

export interface PostgresQueryable {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]): Promise<QueryResult<R>>;
}

export interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresPool extends PostgresQueryable {
  connect(): Promise<PostgresTransactionClient>;
  end(): Promise<void>;
}

export function createPostgresPool(config: PoolConfig | string): PostgresPool {
  return typeof config === "string" ? new Pool({ connectionString: config }) : new Pool(config);
}

export async function withPostgresTransaction<T>(
  pool: Pick<PostgresPool, "connect">,
  operation: (client: PoolClient | PostgresTransactionClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
