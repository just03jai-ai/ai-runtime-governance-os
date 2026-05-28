import type { AppConfig } from "./app-config.js";
import type { DeepPartial } from "./merge-config.js";

export const environmentOverrides: Partial<Record<AppConfig["environment"], DeepPartial<AppConfig>>> = {
  test: {
    environment: "test",
    routes: [
      {
        targetUrl: "data:text/html,<html><head><title>Runtime Test</title></head><body><button>Test</button></body></html>",
        runLabel: "test-runtime-route",
      },
    ],
    execution: {
      environment: "local",
      timeoutMs: 10_000,
    },
    retry: {
      stages: {
        execution: { maxAttempts: 1 },
      },
    },
  },
  staging: {
    environment: "staging",
    execution: {
      environment: "staging",
      timeoutMs: 45_000,
    },
    retry: {
      stages: {
        execution: { maxAttempts: 2 },
      },
    },
  },
  production: {
    environment: "production",
    execution: {
      environment: "production",
      timeoutMs: 60_000,
    },
    governance: {
      criticalFailureThreshold: 0,
      warningFailureThreshold: 3,
    },
    retry: {
      stages: {
        execution: { maxAttempts: 2 },
        governance: { maxAttempts: 2 },
      },
    },
  },
};
