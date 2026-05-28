import { describe, expect, it, vi } from "vitest";
import type { GovernanceValidationFinding } from "../../src/governance/validation/governance-finding.js";
import {
  RuntimePipelineOrchestrator,
  type RuntimePipelineAgents,
} from "../../src/orchestration/runtime-pipeline-orchestrator.js";
import type { FindingsReport } from "../../src/reports/findings/findings-report.js";
import type { OperationalLogger } from "../../src/shared/logger/index.js";
import type { OperationalInsightsReport } from "../../src/shared/types/operational-insights-report.js";
import { governanceFindingFixture, verifiedFindingsFixture } from "../fixtures/findings.fixture.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

const noOpLogger: OperationalLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  start: vi.fn((operation: string, options: { correlationId: string; route?: string }) => ({
    operation,
    correlationId: options.correlationId,
    ...(options.route ? { route: options.route } : {}),
    startedAt: "2026-05-28T00:00:00.000Z",
    startTimeMs: Date.now(),
  })),
  complete: vi.fn(),
  fail: vi.fn(),
  child: vi.fn(() => noOpLogger),
};

describe("RuntimePipelineOrchestrator", () => {
  it("executes deterministic stages in order and returns typed outputs", async () => {
    const stageOrder: string[] = [];
    const governanceFindings: readonly GovernanceValidationFinding[] = [governanceFindingFixture];
    const findingsReport: FindingsReport = {
      reportId: "findings-report:runtime_test_001",
      executionSummary: {
        runId: "runtime_test_001",
        route: "https://example.test/checkout",
        title: "Checkout",
        generatedAt: "2026-05-28T00:00:03.000Z",
        executionStatus: "passed",
        durationMs: 120,
      },
      governanceScore: {
        score: 90,
        verifiedFindingCount: 1,
        needsReviewFindingCount: 0,
        rejectedFindingCount: 0,
      },
      severitySummary: {
        critical: 1,
        medium: 0,
        minor: 0,
        total: 1,
      },
      routeAnalysis: [],
      criticalFindings: [verifiedFindingsFixture[0]],
      mediumFindings: [],
      minorFindings: [],
      evidenceReferences: [],
      screenshots: mockRuntimeEvidence.screenshots,
    };
    const insightsReport: OperationalInsightsReport = {
      reportId: "operational-insights:test",
      generatedAt: "2026-05-28T00:00:04.000Z",
      findingCount: 1,
      clusters: [],
      routeClusters: [],
      recurringPatterns: [],
      tokenDrift: [],
      componentMisuse: [],
      rootCauseSummaries: [],
    };
    const agents = {
      executionAgent: {
        execute: vi.fn(async () => {
          stageOrder.push("execution");
          return mockRuntimeEvidence;
        }),
      },
      governanceAgent: {
        analyze: vi.fn(async () => {
          stageOrder.push("governance");
          return governanceFindings;
        }),
      },
      verifierAgent: {
        verify: vi.fn(() => {
          stageOrder.push("verification");
          return {
            findings: [verifiedFindingsFixture[0]],
            score: {
              verifiedCount: 1,
              rejectedCount: 0,
              needsReviewCount: 0,
              averageConfidence: 0.95,
            },
          };
        }),
      },
      findingsEngine: {
        generate: vi.fn(() => {
          stageOrder.push("findings");
          return findingsReport;
        }),
      },
      analyzerAgent: {
        analyze: vi.fn(() => {
          stageOrder.push("analysis");
          return insightsReport;
        }),
      },
    } as unknown as RuntimePipelineAgents;

    const result = await new RuntimePipelineOrchestrator(agents, noOpLogger).run({
      executionRequest: {
        targetUrl: "https://example.test/checkout",
        environment: "local",
        viewport: {
          width: 1366,
          height: 768,
        },
      },
      contractsDirectory: "src/governance/contracts",
    });

    expect(stageOrder).toEqual(["execution", "governance", "verification", "findings", "analysis"]);
    expect(result.runtimeEvidence.execution.runId).toBe("runtime_test_001");
    expect(result.metrics).toHaveLength(5);
    expect(result.metrics.every((metric) => metric.status === "passed")).toBe(true);
  });
});
