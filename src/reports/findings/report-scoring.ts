import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import { severityWeight } from "../../governance/severity/severity-utils.js";
import type { FindingsReportGovernanceScore } from "./findings-report.js";

export class FindingsReportScoringService {
  score(findings: readonly VerifiedFinding[]): FindingsReportGovernanceScore {
    const activeFindings = findings.filter((finding) => finding.status !== "rejected");
    const penalty = activeFindings.reduce(
      (total, finding) => total + severityWeight(finding.severity) * finding.confidence * 5,
      0,
    );

    return {
      score: Math.max(0, Math.round(100 - penalty)),
      verifiedFindingCount: findings.filter((finding) => finding.status === "verified").length,
      needsReviewFindingCount: findings.filter((finding) => finding.status === "needs-review").length,
      rejectedFindingCount: findings.filter((finding) => finding.status === "rejected").length,
    };
  }
}
