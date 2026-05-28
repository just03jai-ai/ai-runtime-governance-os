import type { GovernanceValidationFinding } from "../../governance/validation/governance-finding.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import { DuplicateSuppressionService } from "./duplicate-suppression.js";
import { EvidenceIntegrityChecker } from "./evidence-integrity-checker.js";
import { VerifierConfidenceEngine } from "./verifier-confidence-engine.js";
import type { VerifiedFinding, VerificationStatus } from "./verified-finding.js";

export interface VerifierPipelineOptions {
  readonly verifiedThreshold: number;
  readonly rejectedThreshold: number;
}

export interface VerifierPipelineInput {
  readonly findings: readonly GovernanceValidationFinding[];
  readonly evidence?: RuntimeEvidence | undefined;
  readonly options: VerifierPipelineOptions;
}

export class VerifierPipelineExecutor {
  constructor(
    private readonly duplicateSuppression = new DuplicateSuppressionService(),
    private readonly integrityChecker = new EvidenceIntegrityChecker(),
    private readonly confidenceEngine = new VerifierConfidenceEngine(),
  ) {}

  execute(input: VerifierPipelineInput): readonly VerifiedFinding[] {
    return this.duplicateSuppression.suppress(input.findings).map(({ finding, duplicateCount }) => {
      const integrity = this.integrityChecker.check(finding, input.evidence);
      const confidence = this.confidenceEngine.score({
        finding,
        evidence: input.evidence,
        integrity,
        duplicateCount,
      });
      const status = this.statusFor(confidence, input.options);

      return {
        id: `verified:${finding.id}`,
        originalFindingId: finding.id,
        status,
        severity: finding.severity,
        route: finding.route,
        component: finding.component,
        evidence: finding.evidence,
        expected: finding.expected,
        actual: finding.actual,
        confidence,
        integrity,
        reasons: this.reasonsFor(status, integrity, duplicateCount),
      };
    });
  }

  private statusFor(confidence: number, options: VerifierPipelineOptions): VerificationStatus {
    if (confidence >= options.verifiedThreshold) {
      return "verified";
    }

    if (confidence < options.rejectedThreshold) {
      return "rejected";
    }

    return "needs-review";
  }

  private reasonsFor(
    status: VerificationStatus,
    integrity: {
      readonly hasComponentEvidence: boolean;
      readonly hasDomEvidence: boolean;
      readonly hasScreenshotEvidence: boolean;
      readonly routeMatches: boolean;
    },
    duplicateCount: number,
  ): readonly string[] {
    const reasons: string[] = [`status=${status}`];

    if (!integrity.hasComponentEvidence) {
      reasons.push("missing component evidence");
    }

    if (!integrity.hasDomEvidence) {
      reasons.push("missing DOM evidence");
    }

    if (!integrity.hasScreenshotEvidence) {
      reasons.push("missing screenshot evidence");
    }

    if (!integrity.routeMatches) {
      reasons.push("route mismatch");
    }

    if (duplicateCount > 1) {
      reasons.push(`suppressed ${duplicateCount - 1} duplicate finding(s)`);
    }

    return reasons;
  }
}
