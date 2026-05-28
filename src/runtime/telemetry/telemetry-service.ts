import type { TelemetryEvent, TelemetryEventType } from "../../governance/contracts/telemetry.js";
import { createEventId } from "../../shared/utils/id.js";

export class TelemetryService {
  private readonly events: TelemetryEvent[] = [];

  record(
    runId: string,
    type: TelemetryEventType,
    metadata?: TelemetryEvent["metadata"],
    durationMs?: number,
  ): TelemetryEvent {
    const event: TelemetryEvent = {
      eventId: createEventId(),
      runId,
      type,
      timestamp: new Date().toISOString(),
      ...(metadata ? { metadata } : {}),
      ...(durationMs === undefined ? {} : { durationMs }),
    };

    this.events.push(event);
    return event;
  }

  getEvents(): readonly TelemetryEvent[] {
    return [...this.events];
  }
}
