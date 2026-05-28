import type { VerifiedFinding, VerificationStatus } from "./verified-finding.js";

export interface VerifierScoreSummary {
  readonly verifiedCount: number;
  readonly rejectedCount: number;
  readonly needsReviewCount: number;
  readonly averageConfidence: number;
}

export class VerifierScoringService {
  summarize(findings: readonly VerifiedFinding[]): VerifierScoreSummary {
    const countByStatus = (status: VerificationStatus) => findings.filter((finding) => finding.status === status).length;
    const averageConfidence =
      findings.length === 0
        ? 1
        : findings.reduce((total, finding) => total + finding.confidence, 0) / findings.length;

    return {
      verifiedCount: countByStatus("verified"),
      rejectedCount: countByStatus("rejected"),
      needsReviewCount: countByStatus("needs-review"),
      averageConfidence: Number(averageConfidence.toFixed(2)),
    };
  }
}
