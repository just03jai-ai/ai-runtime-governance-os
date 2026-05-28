export type RuntimeEnvironment = "local" | "staging" | "production";

export type ExecutionStatus = "passed" | "failed";

export interface ViewportContract {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor?: number;
}

export interface RuntimeExecutionRequest {
  readonly targetUrl: string;
  readonly environment: RuntimeEnvironment;
  readonly viewport: ViewportContract;
  readonly runLabel?: string;
  readonly timeoutMs?: number;
}

export interface RuntimeExecutionContext {
  readonly runId: string;
  readonly startedAt: string;
  readonly request: RuntimeExecutionRequest;
}

export interface RuntimeExecutionSummary {
  readonly runId: string;
  readonly targetUrl: string;
  readonly status: ExecutionStatus;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly evidenceDirectory: string;
  readonly screenshotPath?: string;
  readonly componentCount: number;
  readonly telemetryEventCount: number;
  readonly errorMessage?: string;
}
