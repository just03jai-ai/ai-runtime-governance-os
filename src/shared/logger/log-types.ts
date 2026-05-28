export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMetadataValue = string | number | boolean | null;

export type LogMetadata = Record<string, LogMetadataValue>;

export interface ExecutionTrace {
  readonly correlationId: string;
  readonly route?: string | undefined;
  readonly operation: string;
  readonly startedAt: string;
  readonly startTimeMs: number;
}

export interface OperationalLogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly agent: string;
  readonly message: string;
  readonly correlationId?: string | undefined;
  readonly route?: string | undefined;
  readonly durationMs?: number | undefined;
  readonly metadata?: LogMetadata | undefined;
}

export interface OperationalLogger {
  debug(message: string, metadata?: LogMetadata): void;
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
  start(operation: string, options: { correlationId: string; route?: string; metadata?: LogMetadata }): ExecutionTrace;
  complete(trace: ExecutionTrace, metadata?: LogMetadata): void;
  fail(trace: ExecutionTrace, error: unknown, metadata?: LogMetadata): void;
  child(agent: string): OperationalLogger;
}
