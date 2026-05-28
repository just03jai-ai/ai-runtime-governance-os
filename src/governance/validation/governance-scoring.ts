import type { GovernanceValidationFinding } from "./governance-finding.js";
import { severityWeight } from "../severity/severity-utils.js";

export interface GovernanceScore {
  readonly score: number;
  readonly findingCount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
}

export class GovernanceScoringService {
  score(findings: readonly GovernanceValidationFinding[]): GovernanceScore {
    const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
    const warningCount = findings.filter((finding) => finding.severity === "warning").length;
    const infoCount = findings.filter((finding) => finding.severity === "info").length;
    const penalty = findings.reduce((total, finding) => total + severityWeight(finding.severity), 0);

    return {
      score: Math.max(0, 100 - penalty * 5),
      findingCount: findings.length,
      criticalCount,
      warningCount,
      infoCount,
    };
  }
}
