import type { GovernanceValidationFinding } from "../../governance/validation/governance-finding.js";
import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import { VerifierPipelineExecutor } from "./verifier-pipeline-executor.js";
import { VerifierScoringService, type VerifierScoreSummary } from "./verifier-scoring.js";
import type { VerifiedFinding } from "./verified-finding.js";

export interface VerifierAgentRequest {
  readonly findings: readonly GovernanceValidationFinding[];
  readonly evidence?: RuntimeEvidence | undefined;
  readonly confidenceThreshold?: number;
  readonly rejectionThreshold?: number;
}

export interface VerifierAgentResult {
  readonly findings: readonly VerifiedFinding[];
  readonly score: VerifierScoreSummary;
}

export interface VerifierAgentDependencies {
  readonly pipelineExecutor?: VerifierPipelineExecutor;
  readonly scoringService?: VerifierScoringService;
  readonly logger?: OperationalLogger;
}

export class VerifierAgent {
  private readonly pipelineExecutor: VerifierPipelineExecutor;
  private readonly scoringService: VerifierScoringService;
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: VerifierAgentDependencies = {}) {
    this.pipelineExecutor = dependencies.pipelineExecutor ?? new VerifierPipelineExecutor();
    this.scoringService = dependencies.scoringService ?? new VerifierScoringService();
    this.logger = dependencies.logger ?? createAgentLogger("VerifierAgent");
  }

  verify(request: VerifierAgentRequest): VerifierAgentResult {
    const correlationId = request.evidence?.execution.runId ?? `verifier:${Date.now()}`;
    const trace = this.logger.start("finding.verification", {
      correlationId,
      ...(request.evidence ? { route: request.evidence.route.resolvedUrl } : {}),
      metadata: {
        inputFindingCount: request.findings.length,
      },
    });

    try {
      const findings = this.pipelineExecutor.execute({
        findings: request.findings,
        evidence: request.evidence,
        options: {
          verifiedThreshold: request.confidenceThreshold ?? 0.75,
          rejectedThreshold: request.rejectionThreshold ?? 0.35,
        },
      });
      const score = this.scoringService.summarize(findings);

      this.logger.complete(trace, {
        outputFindingCount: findings.length,
        verifiedCount: score.verifiedCount,
        needsReviewCount: score.needsReviewCount,
        rejectedCount: score.rejectedCount,
      });

      return {
        findings,
        score,
      };
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }
}
