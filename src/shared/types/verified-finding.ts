import type { GovernanceFinding } from "./governance-finding.js";
import type { SeverityLevel } from "./severity.js";

export type VerificationStatus = "verified" | "rejected" | "needs-review";

export interface EvidenceIntegrityResult {
  readonly hasComponentEvidence: boolean;
  readonly hasDomEvidence: boolean;
  readonly hasScreenshotEvidence: boolean;
  readonly routeMatches: boolean;
}

export interface VerifiedFinding {
  readonly id: string;
  readonly originalFindingId: string;
  readonly status: VerificationStatus;
  readonly severity: SeverityLevel;
  readonly route: string;
  readonly component: string;
  readonly evidence: GovernanceFinding["evidence"];
  readonly expected: string;
  readonly actual: string;
  readonly confidence: number;
  readonly integrity: EvidenceIntegrityResult;
  readonly reasons: readonly string[];
}
