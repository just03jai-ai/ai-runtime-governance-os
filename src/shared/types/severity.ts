// Shared severity levels are intentionally small and deterministic.
// Agents must not create local severity vocabularies because report scoring,
// validation, verification, and analysis need the same ordering semantics.
export type SeverityLevel = "info" | "warning" | "critical";
