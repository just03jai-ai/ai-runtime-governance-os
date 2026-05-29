import { describe, expect, it } from "vitest";
import { RuntimeDriftIntelligenceEngine } from "../../src/agents/memory/runtime-drift-intelligence-engine.js";
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

describe("RuntimeDriftIntelligenceEngine", () => {
  it("detects route, component, token, accessibility, and score degradation drift", async () => {
    const route = "https://example.test/checkout";
    const historicalTokenFinding = verifiedFinding({
      id: "run-001-token",
      route,
      component: "component-card",
      severity: "warning",
      expected: "spacing.card.md",
      actual: "13px",
    });
    const currentAccessibilityFinding = verifiedFinding({
      id: "run-003-a11y",
      route,
      component: "component-button-primary",
      severity: "critical",
      expected: "accessible label",
      actual: "empty label",
    });
    const currentTokenFinding = verifiedFinding({
      id: "run-003-token",
      route,
      component: "component-card",
      severity: "warning",
      expected: "spacing.card.md",
      actual: "13px",
    });

    const repository = new InMemoryHistoricalMemoryRepository([
      snapshot("run-001", route, "2026-05-01T00:00:00.000Z", 98, [historicalTokenFinding]),
      snapshot("run-002", route, "2026-05-02T00:00:00.000Z", 94, [historicalTokenFinding]),
    ]);
    const engine = new RuntimeDriftIntelligenceEngine(repository);

    const report = await engine.analyze({
      executionMetadata: {
        runId: "run-003",
        route,
        governanceScore: 84,
        status: "passed",
        startedAt: "2026-05-03T00:00:00.000Z",
      },
      verifiedFindings: [currentTokenFinding, currentAccessibilityFinding],
    });

    expect(report.analyzedExecutionCount).toBe(3);
    expect(report.governanceScoreDegradation).toEqual(
      expect.objectContaining({
        degraded: true,
        degradationAmount: 14,
      }),
    );
    expect(report.routeDrift[0]).toEqual(
      expect.objectContaining({
        route,
        driftScore: expect.any(Number),
      }),
    );
    expect(report.componentDrift).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          component: "component-button-primary",
          latestSeverity: "critical",
        }),
      ]),
    );
    expect(report.tokenDriftEvolution[0]).toEqual(
      expect.objectContaining({
        tokenName: "spacing.card.md",
        affectedComponents: ["component-card"],
      }),
    );
    expect(report.accessibilityDrift[0]).toEqual(
      expect.objectContaining({
        route,
        affectedComponents: ["component-button-primary"],
      }),
    );
    expect(report.degradationIndicators).toEqual(
      expect.arrayContaining([
        "governance score degraded by 14 points",
        `${route} accessibility drift increased by 1`,
      ]),
    );
    expect(report.overallDriftScore).toBeGreaterThan(0);
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
    originalFindingId: input.id,
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
