import type { GovernanceValidationFinding } from "../../governance/validation/governance-finding.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import type { EvidenceIntegrityResult } from "./verified-finding.js";

export interface ConfidenceInput {
  readonly finding: GovernanceValidationFinding;
  readonly evidence?: RuntimeEvidence | undefined;
  readonly integrity: EvidenceIntegrityResult;
  readonly duplicateCount: number;
}

export class VerifierConfidenceEngine {
  score(input: ConfidenceInput): number {
    let score = input.finding.confidence;

    if (!input.integrity.hasComponentEvidence) {
      score -= 0.25;
    }

    if (!input.integrity.hasDomEvidence) {
      score -= 0.2;
    }

    if (!input.integrity.hasScreenshotEvidence) {
      score -= 0.1;
    }

    if (!input.integrity.routeMatches) {
      score -= 0.2;
    }

    if (input.duplicateCount > 1) {
      score -= 0.05;
    }

    if (!input.evidence) {
      score -= 0.15;
    }

    return Math.max(0, Math.min(1, Number(score.toFixed(2))));
  }
}
