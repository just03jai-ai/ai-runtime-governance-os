import type { GovernancePolicyKind } from "../../../shared/types/governance-policy.js";
import type { RuntimeEvidenceSeverity } from "../../../shared/types/runtime-evidence.js";

export interface CoreGovernancePolicyDefinition {
  readonly id: GovernancePolicyKind;
  readonly title: string;
  readonly severity: RuntimeEvidenceSeverity;
  readonly description: string;
}

export const coreGovernancePolicyPack: readonly CoreGovernancePolicyDefinition[] = [
  {
    id: "token-drift",
    title: "Token Drift Detection",
    severity: "warning",
    description: "Required design-system tokens must be present in normalized runtime evidence.",
  },
  {
    id: "forbidden-inline-style",
    title: "Forbidden Inline Styles",
    severity: "warning",
    description: "Runtime components must not contain inline style attributes.",
  },
  {
    id: "typography-mismatch",
    title: "Typography Mismatch",
    severity: "warning",
    description: "Typography tokens required by contracts must be present in runtime token evidence.",
  },
  {
    id: "invalid-component-variant",
    title: "Invalid Component Variants",
    severity: "warning",
    description: "Variant selector evidence must satisfy required variant token rules.",
  },
  {
    id: "accessibility-violation",
    title: "Accessibility Violations",
    severity: "critical",
    description: "Interactive components and captured accessibility findings must have deterministic evidence.",
  },
  {
    id: "spacing-inconsistency",
    title: "Spacing Inconsistency",
    severity: "info",
    description: "Visible component bounds should align to the configured spacing grid.",
  },
  {
    id: "unauthorized-component",
    title: "Unauthorized Components",
    severity: "warning",
    description: "Runtime components must match an approved component contract.",
  },
];

export function severityForCorePolicy(policy: GovernancePolicyKind): RuntimeEvidenceSeverity {
  return coreGovernancePolicyPack.find((definition) => definition.id === policy)?.severity ?? "warning";
}
