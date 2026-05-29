# Memory Agent

Deterministic historical analysis for runtime governance executions.

The `MemoryAgent` accepts verified findings and execution metadata, stores the execution snapshot through a database-backed repository, and returns `HistoricalInsights`.

It does not use vector databases, embeddings, autonomous memory, or non-deterministic model calls.

## Analysis engines

- `ViolationRecurrenceEngine` tracks repeated violation signatures across executions.
- `RegressionDetectionEngine` detects findings that appear after a clean route run.
- `GovernanceScoreTrendEngine` calculates score direction, delta, and averages.
- `RouteHistoryAnalysis` summarizes route execution history.
- `ComponentFailureFrequencyTracker` ranks recurring component failures.
- `RuntimeDriftIntelligenceEngine` transforms historical snapshots into route, component, token, accessibility, and governance score drift intelligence.

## Storage

`PostgresHistoricalMemoryRepository` persists snapshots into `memory_execution_snapshots` and `memory_verified_findings`. The migration creates indexes for execution history, route history, route IDs, governance scores, violation signatures, component failures, and severity filtering.
