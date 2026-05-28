export interface TelemetrySnapshotEvent {
  readonly eventId: string;
  readonly type: string;
  readonly timestamp: string;
  readonly durationMs?: number | undefined;
  readonly metadata?: Record<string, string | number | boolean> | undefined;
}

export interface TelemetrySnapshot {
  readonly capturedAt: string;
  readonly events: readonly TelemetrySnapshotEvent[];
}
