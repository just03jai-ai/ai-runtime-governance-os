import { ConsoleLogSink, type LogSink } from "./console-log-sink.js";
import { JsonLogFormatter } from "./json-log-formatter.js";
import type { ExecutionTrace, LogLevel, LogMetadata, OperationalLogEntry, OperationalLogger } from "./log-types.js";

export interface StructuredLoggerOptions {
  readonly agent: string;
  readonly sink?: LogSink;
  readonly formatter?: JsonLogFormatter;
}

export class StructuredLogger implements OperationalLogger {
  private readonly sink: LogSink;
  private readonly formatter: JsonLogFormatter;

  constructor(private readonly options: StructuredLoggerOptions) {
    this.sink = options.sink ?? new ConsoleLogSink();
    this.formatter = options.formatter ?? new JsonLogFormatter();
  }

  debug(message: string, metadata?: LogMetadata): void {
    this.write("debug", message, metadata);
  }

  info(message: string, metadata?: LogMetadata): void {
    this.write("info", message, metadata);
  }

  warn(message: string, metadata?: LogMetadata): void {
    this.write("warn", message, metadata);
  }

  error(message: string, metadata?: LogMetadata): void {
    this.write("error", message, metadata);
  }

  start(operation: string, options: { correlationId: string; route?: string; metadata?: LogMetadata }): ExecutionTrace {
    const trace: ExecutionTrace = {
      correlationId: options.correlationId,
      ...(options.route ? { route: options.route } : {}),
      operation,
      startedAt: new Date().toISOString(),
      startTimeMs: Date.now(),
    };

    this.write("info", `${operation}.started`, options.metadata, trace);
    return trace;
  }

  complete(trace: ExecutionTrace, metadata?: LogMetadata): void {
    this.write("info", `${trace.operation}.completed`, metadata, trace, Date.now() - trace.startTimeMs);
  }

  fail(trace: ExecutionTrace, error: unknown, metadata?: LogMetadata): void {
    this.write(
      "error",
      `${trace.operation}.failed`,
      {
        ...metadata,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      trace,
      Date.now() - trace.startTimeMs,
    );
  }

  child(agent: string): OperationalLogger {
    return new StructuredLogger({
      agent,
      sink: this.sink,
      formatter: this.formatter,
    });
  }

  private write(
    level: LogLevel,
    message: string,
    metadata?: LogMetadata,
    trace?: ExecutionTrace,
    durationMs?: number,
  ): void {
    const entry: OperationalLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      agent: this.options.agent,
      message,
      ...(trace ? { correlationId: trace.correlationId } : {}),
      ...(trace?.route ? { route: trace.route } : {}),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(metadata ? { metadata } : {}),
    };

    this.sink.write(entry, this.formatter.format(entry));
  }
}

export function createAgentLogger(agent: string): OperationalLogger {
  return new StructuredLogger({ agent });
}
