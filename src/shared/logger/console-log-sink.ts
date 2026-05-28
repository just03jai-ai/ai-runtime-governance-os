import type { OperationalLogEntry } from "./log-types.js";

export interface LogSink {
  write(entry: OperationalLogEntry, formatted: string): void;
}

export class ConsoleLogSink implements LogSink {
  write(entry: OperationalLogEntry, formatted: string): void {
    if (entry.level === "error") {
      console.error(formatted);
      return;
    }

    if (entry.level === "warn") {
      console.warn(formatted);
      return;
    }

    console.info(formatted);
  }
}
