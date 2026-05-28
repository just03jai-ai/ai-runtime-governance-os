import { randomUUID } from "node:crypto";

export function createRunId(prefix = "run"): string {
  return `${prefix}_${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID()}`;
}

export function createEventId(): string {
  return `evt_${randomUUID()}`;
}
