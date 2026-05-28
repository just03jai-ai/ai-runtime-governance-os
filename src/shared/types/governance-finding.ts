import type { GovernancePolicyKind } from "./governance-policy.js";
import type { SeverityLevel } from "./severity.js";

export interface GovernanceFinding {
  readonly id: string;
  readonly policy: GovernancePolicyKind;
  readonly severity: SeverityLevel;
  readonly route: string;
  readonly component: string;
  readonly evidence: Record<string, string | number | boolean | null>;
  readonly expected: string;
  readonly actual: string;
  readonly confidence: number;
}
