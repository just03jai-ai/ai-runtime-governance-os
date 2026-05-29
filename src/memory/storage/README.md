# Historical Execution Storage

PostgreSQL-backed storage for historical runtime governance intelligence.

## Entry points

- `createPostgresPool(config)` creates a `pg` pool from a connection string or pool config.
- `runStorageMigrations(client)` applies the storage schema.
- `PostgresGovernanceExecutionRepository` persists and reads execution history.

## Stored history

The schema anchors each run in `governance_executions`, then normalizes high-cardinality execution data into child tables:

- runtime components, design tokens, accessibility findings, screenshots, telemetry, and runtime governance violations
- raw governance findings and verified findings
- analyzer insights derived from operational insight reports
- pipeline execution metrics
- governance score history

Raw JSONB payloads are retained next to normalized columns so historical runs can be replayed or rehydrated without losing source evidence fidelity.

## Indexing

The migration creates indexes for execution lookup, route history, route IDs, finding severity, verification status, policies, analyzer categories, execution stages, and governance scores.
