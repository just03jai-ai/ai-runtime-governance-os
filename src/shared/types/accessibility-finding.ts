import type { SeverityLevel } from "./severity.js";

export interface AccessibilityFinding {
  readonly id: string;
  readonly ruleId: string;
  readonly severity: SeverityLevel;
  readonly message: string;
  readonly selectorHint?: string | undefined;
  readonly deterministic: true;
}
