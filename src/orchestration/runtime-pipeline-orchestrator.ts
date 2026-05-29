import type { AnalyzerAgent } from "../agents/analyzer/analyzer-agent.js";
import type { OperationalInsightsReport } from "../agents/analyzer/operational-insights-report.js";
import type { ExecutionAgent } from "../agents/execution/execution-agent.js";
import type { GovernanceAgent } from "../agents/governance/governance-agent.js";
import type { VerifiedFinding } from "../agents/verifier/verified-finding.js";
import type { VerifierAgent, VerifierAgentResult } from "../agents/verifier/verifier-agent.js";
import type { RuntimeExecutionRequest } from "../governance/contracts/execution.js";
import type { GovernanceValidationFinding } from "../governance/validation/governance-finding.js";
import type { FindingsReport } from "../reports/findings/findings-report.js";
import type { FindingsReportEngine } from "../reports/findings/findings-report-engine.js";
import { createAgentLogger, type OperationalLogger } from "../shared/logger/index.js";
import type { RuntimeEvidence } from "../shared/types/runtime-evidence.js";
import type { GovernanceExecutionRepository } from "../memory/storage/types.js";

export type RuntimePipelineStageName = "execution" | "governance" | "verification" | "findings" | "analysis";

export interface RuntimePipelineStageMetric {
  readonly stage: RuntimePipelineStageName;
  readonly status: "passed" | "failed";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly attempts: number;
  readonly errorMessage?: string | undefined;
}

export interface RuntimePipelineRetryPolicy {
  readonly maxAttempts: number;
}

export interface RuntimePipelineAgents {
  readonly executionAgent: ExecutionAgent;
  readonly governanceAgent: GovernanceAgent;
  readonly verifierAgent: VerifierAgent;
  readonly findingsEngine: FindingsReportEngine;
  readonly analyzerAgent: AnalyzerAgent;
}

export interface RuntimePipelineRequest {
  readonly executionRequest: RuntimeExecutionRequest;
  readonly contractsDirectory?: string;
  readonly retryPolicy?: Partial<Record<RuntimePipelineStageName, RuntimePipelineRetryPolicy>>;
  readonly storageRepository?: GovernanceExecutionRepository | undefined;
}

export interface RuntimePipelineResult {
  readonly correlationId: string;
  readonly runtimeEvidence: RuntimeEvidence;
  readonly governanceFindings: readonly GovernanceValidationFinding[];
  readonly verifiedFindings: readonly VerifiedFinding[];
  readonly verifierResult: VerifierAgentResult;
  readonly findingsReport: FindingsReport;
  readonly operationalInsights: OperationalInsightsReport;
  readonly metrics: readonly RuntimePipelineStageMetric[];
}

export class RuntimePipelineOrchestrator {
  private readonly logger: OperationalLogger;

  constructor(
    private readonly agents: RuntimePipelineAgents,
    logger: OperationalLogger = createAgentLogger("RuntimePipelineOrchestrator"),
  ) {
    this.logger = logger;
  }

  async run(request: RuntimePipelineRequest): Promise<RuntimePipelineResult> {
    const pipelineStartedAtMs = Date.now();
    const pipelineCorrelationId = `pipeline:${pipelineStartedAtMs}`;
    const pipelineTrace = this.logger.start("runtime.pipeline", {
      correlationId: pipelineCorrelationId,
      route: request.executionRequest.targetUrl,
    });
    const metrics: RuntimePipelineStageMetric[] = [];

    try {
      const runtimeEvidence = await this.runStage(
        "execution",
        metrics,
        request.retryPolicy,
        () => this.agents.executionAgent.execute(request.executionRequest),
      );

      const governanceFindings = await this.runStage(
        "governance",
        metrics,
        request.retryPolicy,
        () =>
          this.agents.governanceAgent.analyze({
            evidence: runtimeEvidence,
            ...(request.contractsDirectory ? { contractsDirectory: request.contractsDirectory } : {}),
          }),
      );

      const verifierResult = await this.runStage(
        "verification",
        metrics,
        request.retryPolicy,
        () =>
          Promise.resolve(
            this.agents.verifierAgent.verify({
              findings: governanceFindings,
              evidence: runtimeEvidence,
            }),
          ),
      );

      const findingsReport = await this.runStage(
        "findings",
        metrics,
        request.retryPolicy,
        () =>
          Promise.resolve(
            this.agents.findingsEngine.generate({
              findings: verifierResult.findings,
              evidence: runtimeEvidence,
            }),
          ),
      );

      const operationalInsights = await this.runStage(
        "analysis",
        metrics,
        request.retryPolicy,
        () => Promise.resolve(this.agents.analyzerAgent.analyze(verifierResult.findings)),
      );

      await request.storageRepository?.saveExecution({
        correlationId: runtimeEvidence.execution.runId,
        runtimeEvidence,
        governanceFindings,
        verifiedFindings: verifierResult.findings,
        analyzerInsights: operationalInsights,
        executionMetrics: metrics,
        governanceScore: findingsReport.governanceScore,
      });

      this.logger.complete(pipelineTrace, {
        durationMs: Date.now() - pipelineStartedAtMs,
        stageCount: metrics.length,
        verifiedFindingCount: verifierResult.findings.length,
      });

      return {
        correlationId: runtimeEvidence.execution.runId,
        runtimeEvidence,
        governanceFindings,
        verifiedFindings: verifierResult.findings,
        verifierResult,
        findingsReport,
        operationalInsights,
        metrics,
      };
    } catch (error) {
      this.logger.fail(pipelineTrace, error, {
        durationMs: Date.now() - pipelineStartedAtMs,
        completedStageCount: metrics.length,
      });
      throw error;
    }
  }

  private async runStage<T>(
    stage: RuntimePipelineStageName,
    metrics: RuntimePipelineStageMetric[],
    retryPolicy: RuntimePipelineRequest["retryPolicy"],
    operation: () => Promise<T>,
  ): Promise<T> {
    const maxAttempts = retryPolicy?.[stage]?.maxAttempts ?? 1;
    let attempt = 0;
    let lastError: unknown;

    while (attempt < maxAttempts) {
      attempt += 1;
      const startedAtMs = Date.now();
      const startedAt = new Date(startedAtMs).toISOString();
      const trace = this.logger.start(`stage.${stage}`, {
        correlationId: `stage:${stage}:${startedAtMs}`,
        metadata: {
          attempt,
          maxAttempts,
        },
      });

      try {
        const output = await operation();
        const completedAtMs = Date.now();
        metrics.push({
          stage,
          status: "passed",
          startedAt,
          completedAt: new Date(completedAtMs).toISOString(),
          durationMs: completedAtMs - startedAtMs,
          attempts: attempt,
        });
        this.logger.complete(trace, { attempt });
        return output;
      } catch (error) {
        lastError = error;
        const completedAtMs = Date.now();
        const errorMessage = error instanceof Error ? error.message : String(error);
        metrics.push({
          stage,
          status: "failed",
          startedAt,
          completedAt: new Date(completedAtMs).toISOString(),
          durationMs: completedAtMs - startedAtMs,
          attempts: attempt,
          errorMessage,
        });
        this.logger.fail(trace, error, { attempt });

        if (attempt >= maxAttempts) {
          break;
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }
}
