import type { GovernanceContract } from "../../governance/contracts/governance-contract.js";
import { GovernanceContractLoader } from "../../governance/contracts/governance-contract-loader.js";
import type { GovernanceValidationFinding } from "../../governance/validation/governance-finding.js";
import { GovernancePipelineExecutor } from "../../governance/validation/governance-pipeline-executor.js";
import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";

export interface GovernanceAgentRequest {
  readonly evidence: RuntimeEvidence;
  readonly contracts?: readonly GovernanceContract[];
  readonly contractsDirectory?: string;
}

export interface GovernanceAgentDependencies {
  readonly contractLoader?: GovernanceContractLoader;
  readonly pipelineExecutor?: GovernancePipelineExecutor;
  readonly logger?: OperationalLogger;
}

export class GovernanceAgent {
  private readonly contractLoader: GovernanceContractLoader;
  private readonly pipelineExecutor: GovernancePipelineExecutor;
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: GovernanceAgentDependencies = {}) {
    this.contractLoader = dependencies.contractLoader ?? new GovernanceContractLoader();
    this.pipelineExecutor = dependencies.pipelineExecutor ?? new GovernancePipelineExecutor();
    this.logger = dependencies.logger ?? createAgentLogger("GovernanceAgent");
  }

  async analyze(request: GovernanceAgentRequest): Promise<readonly GovernanceValidationFinding[]> {
    const trace = this.logger.start("governance.analysis", {
      correlationId: request.evidence.execution.runId,
      route: request.evidence.route.resolvedUrl,
    });

    try {
      const contracts = await this.resolveContracts(request);
      this.logger.info("governance.contracts.loaded", {
        correlationId: request.evidence.execution.runId,
        contractCount: contracts.length,
      });
      const findings = this.pipelineExecutor.execute(request.evidence, contracts).findings;

      this.logger.complete(trace, {
        contractCount: contracts.length,
        findingCount: findings.length,
      });

      return findings;
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }

  private async resolveContracts(request: GovernanceAgentRequest): Promise<readonly GovernanceContract[]> {
    if (request.contracts) {
      return request.contracts;
    }

    if (request.contractsDirectory) {
      return this.contractLoader.loadFromDirectory(request.contractsDirectory);
    }

    throw new Error("GovernanceAgent requires contracts or contractsDirectory.");
  }
}
