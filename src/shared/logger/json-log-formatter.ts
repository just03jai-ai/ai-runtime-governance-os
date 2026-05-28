import type { OperationalLogEntry } from "./log-types.js";

export class JsonLogFormatter {
  format(entry: OperationalLogEntry): string {
    return JSON.stringify(entry);
  }
}
