import type { RuntimePipelineStageName } from "../orchestration/runtime-pipeline-orchestrator.js";

export type AppEnvironment = "local" | "staging" | "production" | "test";

export interface RouteConfig {
  readonly targetUrl: string;
  readonly runLabel?: string | undefined;
}

export interface ExecutionSettingsConfig {
  readonly environment: "local" | "staging" | "production";
  readonly timeoutMs: number;
  readonly viewport: {
    readonly width: number;
    readonly height: number;
    readonly deviceScaleFactor?: number | undefined;
  };
}

export interface GovernanceThresholdsConfig {
  readonly minimumConfidence: number;
  readonly criticalFailureThreshold: number;
  readonly warningFailureThreshold: number;
}

export interface ScreenshotSettingsConfig {
  readonly enabled: boolean;
  readonly fullPage: boolean;
  readonly outputDirectory: string;
}

export interface AccessibilitySettingsConfig {
  readonly enabled: boolean;
  readonly requireAccessibleNames: boolean;
  readonly minimumContrastRatio: number;
}

export interface RetrySettingsConfig {
  readonly stages: Partial<Record<RuntimePipelineStageName, { readonly maxAttempts: number }>>;
}

export interface ReportSettingsConfig {
  readonly outputDirectory: string;
  readonly json: boolean;
  readonly html: boolean;
}

export interface AppConfig {
  readonly environment: AppEnvironment;
  readonly routes: readonly RouteConfig[];
  readonly execution: ExecutionSettingsConfig;
  readonly governance: GovernanceThresholdsConfig;
  readonly screenshots: ScreenshotSettingsConfig;
  readonly accessibility: AccessibilitySettingsConfig;
  readonly retry: RetrySettingsConfig;
  readonly reports: ReportSettingsConfig;
}
