import type { GovernanceContract } from "../contracts/governance-contract.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import type { GovernanceValidationFinding, GovernanceValidationResult } from "./governance-finding.js";
import { CorePolicyEngine } from "../policies/core/core-policy-engine.js";
import { GovernanceScoringService, type GovernanceScore } from "./governance-scoring.js";
import { GovernanceValidationEngine } from "./governance-validation-engine.js";

export interface GovernancePipelineResult {
  readonly validation: GovernanceValidationResult;
  readonly findings: readonly GovernanceValidationFinding[];
  readonly score: GovernanceScore;
}

export class GovernancePipelineExecutor {
  constructor(
    private readonly validationEngine = new GovernanceValidationEngine(),
    private readonly scoringService = new GovernanceScoringService(),
    private readonly corePolicyEngine = new CorePolicyEngine(),
  ) {}

  execute(evidence: RuntimeEvidence, contracts: readonly GovernanceContract[]): GovernancePipelineResult {
    const validation = this.validationEngine.validate(evidence, contracts);
    const findings = [...validation.findings, ...this.corePolicyEngine.validate(evidence, contracts)];
    const score = this.scoringService.score(findings);

    return {
      validation,
      findings,
      score,
    };
  }
}
