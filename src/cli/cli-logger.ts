import {
  StructuredLogger,
  type LogSink,
  type OperationalLogEntry,
  type OperationalLogger,
} from "../shared/logger/index.js";

class CliLogSink implements LogSink {
  constructor(private readonly verbose: boolean) {}

  write(entry: OperationalLogEntry, formatted: string): void {
    if (!this.verbose && entry.level !== "warn" && entry.level !== "error") {
      return;
    }

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

export function createCliLogger(agent: string, verbose: boolean): OperationalLogger {
  return new StructuredLogger({
    agent,
    sink: new CliLogSink(verbose),
  });
}
