export type ExecutionEnvironment = "local" | "staging" | "production";

type OperationalExecutionStatus = "passed" | "failed";

export interface ExecutionContext {
  readonly runId: string;
  readonly startedAt: string;
  readonly targetUrl: string;
  readonly environment: ExecutionEnvironment;
  readonly runLabel?: string | undefined;
}

export interface ExecutionMetrics {
  readonly status: OperationalExecutionStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly telemetryEventCount: number;
  readonly componentCount: number;
  readonly errorMessage?: string | undefined;
}
