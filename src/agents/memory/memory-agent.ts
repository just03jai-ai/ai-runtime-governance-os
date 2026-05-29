import type { VerifiedFinding } from "../verifier/verified-finding.js";
import { ComponentFailureFrequencyTracker } from "./component-failure-frequency.js";
import { GovernanceScoreTrendEngine } from "./governance-score-trend-engine.js";
import { RegressionDetectionEngine } from "./regression-detection-engine.js";
import { RouteHistoryAnalysis } from "./route-history-analysis.js";
import type { ExecutionMetadata, HistoricalInsights, HistoricalMemoryRepository, MemoryExecutionSnapshot } from "./types.js";
import { ViolationRecurrenceEngine } from "./violation-recurrence-engine.js";

export interface MemoryAgentOptions {
  readonly historyLimit?: number | undefined;
  readonly recurrenceThreshold?: number | undefined;
}

export interface MemoryAgentRequest {
  readonly verifiedFindings: readonly VerifiedFinding[];
  readonly executionMetadata: ExecutionMetadata;
}

export class MemoryAgent {
  private readonly recurrenceEngine = new ViolationRecurrenceEngine();
  private readonly scoreTrendEngine = new GovernanceScoreTrendEngine();
  private readonly regressionEngine = new RegressionDetectionEngine();
  private readonly routeHistoryAnalysis = new RouteHistoryAnalysis();
  private readonly componentFailureTracker = new ComponentFailureFrequencyTracker();

  constructor(
    private readonly repository: HistoricalMemoryRepository,
    private readonly options: MemoryAgentOptions = {},
  ) {}

  async analyze(request: MemoryAgentRequest): Promise<HistoricalInsights> {
    const currentSnapshot: MemoryExecutionSnapshot = {
      metadata: request.executionMetadata,
      verifiedFindings: request.verifiedFindings,
    };

    await this.repository.saveExecutionSnapshot(currentSnapshot);

    const history = await this.repository.listExecutionSnapshots({
      limit: this.options.historyLimit ?? 50,
    });
    const historyWithoutCurrent = history.filter((snapshot) => snapshot.metadata.runId !== request.executionMetadata.runId);
    const combinedHistory = [...historyWithoutCurrent, currentSnapshot].sort((a, b) =>
      a.metadata.startedAt.localeCompare(b.metadata.startedAt),
    );

    const recurringViolations = this.recurrenceEngine.findRecurringViolations(
      request.verifiedFindings,
      combinedHistory,
      this.options.recurrenceThreshold ?? 2,
    );

    return {
      runId: request.executionMetadata.runId,
      generatedAt: new Date().toISOString(),
      analyzedExecutionCount: combinedHistory.length,
      recurringViolations,
      regressions: this.regressionEngine.detect(currentSnapshot, historyWithoutCurrent),
      governanceScoreTrend: this.scoreTrendEngine.calculate(combinedHistory),
      routeHistory: this.routeHistoryAnalysis.analyze(combinedHistory, recurringViolations),
      componentFailureFrequency: this.componentFailureTracker.calculate(combinedHistory),
    };
  }
}
