export const evidenceSchemaVersion = "runtime-evidence/v1" as const;

export interface VersionedSchemaReference {
  readonly schemaVersion: typeof evidenceSchemaVersion;
}
