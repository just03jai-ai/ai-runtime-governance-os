import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PostgresQueryable } from "./postgres-client.js";
import type { StorageMigration } from "./types.js";

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "migrations");

const migrationFiles = ["001_create_execution_history.sql", "002_create_memory_history.sql"] as const;

export async function loadStorageMigrations(): Promise<readonly StorageMigration[]> {
  return Promise.all(
    migrationFiles.map(async (fileName) => {
      const sql = await readFile(join(migrationsDirectory, fileName), "utf8");
      const [version, ...nameParts] = fileName.replace(/\.sql$/, "").split("_");
      return {
        version: version ?? fileName,
        name: nameParts.join("_"),
        sql,
      };
    }),
  );
}

export async function runStorageMigrations(client: PostgresQueryable): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS storage_migrations (
      version text PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const migration of await loadStorageMigrations()) {
    const existing = await client.query("SELECT version FROM storage_migrations WHERE version = $1", [migration.version]);
    if (existing.rowCount && existing.rowCount > 0) {
      continue;
    }

    await client.query(migration.sql);
    await client.query("INSERT INTO storage_migrations (version, name) VALUES ($1, $2)", [
      migration.version,
      migration.name,
    ]);
  }
}
