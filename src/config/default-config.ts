import type { AppConfig } from "./app-config.js";

export const defaultConfig: AppConfig = {
  environment: "local",
  routes: [
    {
      targetUrl: "https://example.com",
      runLabel: "default-runtime-route",
    },
  ],
  execution: {
    environment: "local",
    timeoutMs: 30_000,
    viewport: {
      width: 1366,
      height: 768,
    },
  },
  governance: {
    minimumConfidence: 0.75,
    criticalFailureThreshold: 1,
    warningFailureThreshold: 5,
  },
  screenshots: {
    enabled: true,
    fullPage: true,
    outputDirectory: "artifacts/evidence",
  },
  accessibility: {
    enabled: true,
    requireAccessibleNames: true,
    minimumContrastRatio: 4.5,
  },
  retry: {
    stages: {
      execution: { maxAttempts: 1 },
      governance: { maxAttempts: 1 },
      verification: { maxAttempts: 1 },
      findings: { maxAttempts: 1 },
      analysis: { maxAttempts: 1 },
    },
  },
  reports: {
    outputDirectory: "artifacts/reports",
    json: true,
    html: true,
  },
};
