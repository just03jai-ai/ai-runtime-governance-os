import type { GovernanceFinding } from "../../shared/types/governance-finding.js";

export type GovernanceValidationFinding = GovernanceFinding;

export interface GovernanceValidationResult {
  readonly runId: string;
  readonly route: string;
  readonly evaluatedContractCount: number;
  readonly findingCount: number;
  readonly findings: readonly GovernanceValidationFinding[];
}
