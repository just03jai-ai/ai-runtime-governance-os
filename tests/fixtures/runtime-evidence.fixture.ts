import type { RuntimeEvidence } from "../../src/shared/types/runtime-evidence.js";

export const mockRuntimeEvidence: RuntimeEvidence = {
  schemaVersion: "runtime-evidence/v1",
  execution: {
    runId: "runtime_test_001",
    schemaVersion: "runtime-evidence/v1",
    environment: "local",
    executor: "execution-agent",
    status: "passed",
    durationMs: 120,
  },
  route: {
    targetUrl: "https://example.test/checkout",
    resolvedUrl: "https://example.test/checkout",
    title: "Checkout",
    routeId: "checkout",
    runLabel: "checkout-regression",
  },
  timestamps: {
    startedAt: "2026-05-28T00:00:00.000Z",
    capturedAt: "2026-05-28T00:00:01.000Z",
    completedAt: "2026-05-28T00:00:02.000Z",
  },
  domSnapshot: {
    capturedAt: "2026-05-28T00:00:01.000Z",
    elementCount: 8,
    interactiveElementCount: 1,
    extractionStrategy: "playwright-dom",
  },
  componentInventory: [
    {
      id: "component-button-primary",
      tagName: "button",
      role: "button",
      label: "",
      selectorHint: "button.primary.danger",
      attributes: {
        class: "primary danger",
      },
      visible: true,
      boundingBox: {
        x: 12,
        y: 16,
        width: 120,
        height: 40,
      },
      source: "dom",
    },
  ],
  designTokens: [
    {
      name: "font.body",
      value: "Inter",
      category: "typography",
      source: "computed-style",
    },
  ],
  accessibilityFindings: [],
  screenshots: [
    {
      id: "full-page",
      path: "artifacts/evidence/runtime_test_001/screenshots/full-page.png",
      capturedAt: "2026-05-28T00:00:01.000Z",
      viewport: {
        width: 1366,
        height: 768,
      },
      fullPage: true,
    },
  ],
  telemetry: [
    {
      eventId: "telemetry-001",
      type: "page.navigation.completed",
      timestamp: "2026-05-28T00:00:01.000Z",
      durationMs: 25,
      metadata: {
        url: "https://example.test/checkout",
      },
    },
  ],
  governanceViolations: [],
  confidence: {
    score: 1,
    basis: "runtime-observation",
    notes: ["fixture"],
  },
};
