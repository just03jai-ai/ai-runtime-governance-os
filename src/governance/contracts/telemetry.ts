export type TelemetryEventType =
  | "execution.started"
  | "page.navigation.completed"
  | "screenshot.captured"
  | "dom.extracted"
  | "component.inventory.generated"
  | "evidence.generated"
  | "execution.completed"
  | "execution.failed";

export interface TelemetryEvent {
  readonly eventId: string;
  readonly runId: string;
  readonly type: TelemetryEventType;
  readonly timestamp: string;
  readonly durationMs?: number;
  readonly metadata?: Record<string, string | number | boolean>;
}
