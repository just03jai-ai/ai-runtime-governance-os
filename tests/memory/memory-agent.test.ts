import { describe, expect, it } from "vitest";
import { MemoryAgent } from "../../src/agents/memory/memory-agent.js";
import type {
  HistoricalMemoryRepository,
  MemoryExecutionSnapshot,
  MemoryHistoryQuery,
} from "../../src/agents/memory/types.js";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";

class InMemoryHistoricalMemoryRepository implements HistoricalMemoryRepository {
  private readonly snapshots = new Map<string, MemoryExecutionSnapshot>();

  constructor(initialSnapshots: readonly MemoryExecutionSnapshot[] = []) {
    for (const snapshot of initialSnapshots) {
      this.snapshots.set(snapshot.metadata.runId, snapshot);
    }
  }

  async saveExecutionSnapshot(snapshot: MemoryExecutionSnapshot): Promise<void> {
    this.snapshots.set(snapshot.metadata.runId, snapshot);
  }

  async listExecutionSnapshots(query: MemoryHistoryQuery = {}): Promise<readonly MemoryExecutionSnapshot[]> {
    return [...this.snapshots.values()]
      .filter((snapshot) => (query.route ? snapshot.metadata.route === query.route : true))
      .filter((snapshot) => (query.routeId ? snapshot.metadata.routeId === query.routeId : true))
      .sort((a, b) => b.metadata.startedAt.localeCompare(a.metadata.startedAt))
      .slice(0, query.limit ?? 50);
  }
}

describe("MemoryAgent", () => {
  it("stores findings and produces deterministic historical insights", async () => {
    const route = "https://example.test/checkout";
    const recurringFinding = verifiedFinding({
      id: "current-accessible-name",
      route,
      component: "component-button-primary",
      severity: "critical",
      expected: "accessible label",
      actual: "empty label",
    });
    const newFinding = verifiedFinding({
      id: "current-token",
      route,
      component: "component-card",
      severity: "warning",
      expected: "approved spacing token",
      actual: "raw 13px value",
    });

    const repository = new InMemoryHistoricalMemoryRepository([
      snapshot("run-001", route, "2026-05-01T00:00:00.000Z", 92, [recurringFinding]),
      snapshot("run-002", route, "2026-05-02T00:00:00.000Z", 96, []),
    ]);
    const agent = new MemoryAgent(repository, { recurrenceThreshold: 2 });

    const insights = await agent.analyze({
      executionMetadata: {
        runId: "run-003",
        route,
        governanceScore: 88,
        status: "passed",
        startedAt: "2026-05-03T00:00:00.000Z",
      },
      verifiedFindings: [recurringFinding, newFinding],
    });

    expect(insights.analyzedExecutionCount).toBe(3);
    expect(insights.recurringViolations).toHaveLength(1);
    expect(insights.recurringViolations[0]?.component).toBe("component-button-primary");
    expect(insights.governanceScoreTrend.direction).toBe("regressing");
    expect(insights.governanceScoreTrend.delta).toBe(-8);
    expect(insights.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          findingId: "current-accessible-name",
          regressionType: "returned-after-clean-run",
          previousCleanRunId: "run-002",
          lastSeenRunId: "run-001",
        }),
        expect.objectContaining({
          findingId: "current-token",
          regressionType: "new-violation",
        }),
      ]),
    );
    expect(insights.routeHistory[0]).toEqual(
      expect.objectContaining({
        route,
        executionCount: 3,
        averageGovernanceScore: 92,
      }),
    );
    expect(insights.componentFailureFrequency[0]).toEqual(
      expect.objectContaining({
        component: "component-button-primary",
        occurrenceCount: 2,
        affectedRunCount: 2,
        highestSeverity: "critical",
      }),
    );
  });
});

function snapshot(
  runId: string,
  route: string,
  startedAt: string,
  governanceScore: number,
  verifiedFindings: readonly VerifiedFinding[],
): MemoryExecutionSnapshot {
  return {
    metadata: {
      runId,
      route,
      governanceScore,
      status: "passed",
      startedAt,
    },
    verifiedFindings,
  };
}

function verifiedFinding(input: {
  readonly id: string;
  readonly route: string;
  readonly component: string;
  readonly severity: VerifiedFinding["severity"];
  readonly expected: string;
  readonly actual: string;
}): VerifiedFinding {
  return {
    id: input.id,
    originalFindingId: input.id.replace("current-", "original-"),
    status: "verified",
    severity: input.severity,
    route: input.route,
    component: input.component,
    evidence: { componentId: input.component },
    expected: input.expected,
    actual: input.actual,
    confidence: 1,
    integrity: {
      hasComponentEvidence: true,
      hasDomEvidence: true,
      hasScreenshotEvidence: true,
      routeMatches: true,
    },
    reasons: [],
  };
}
