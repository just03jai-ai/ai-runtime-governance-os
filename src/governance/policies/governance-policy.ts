import type { GovernancePolicy } from "../../shared/types/governance-policy.js";

export type { GovernancePolicy, GovernancePolicyKind } from "../../shared/types/governance-policy.js";

export const governancePolicies: readonly GovernancePolicy[] = [
  {
    kind: "allowed-component",
    deterministic: true,
    description: "Runtime components must match at least one approved design-system component matcher.",
  },
  {
    kind: "forbidden-component",
    deterministic: true,
    description: "Runtime components must not match forbidden component patterns.",
  },
  {
    kind: "required-design-token",
    deterministic: true,
    description: "Runtime evidence must contain design tokens required by active governance contracts.",
  },
  {
    kind: "variant-rule",
    deterministic: true,
    description: "Runtime component variants must include required token evidence when variant selectors match.",
  },
  {
    kind: "prop-restriction",
    deterministic: true,
    description: "Runtime component properties must satisfy contract restrictions.",
  },
  {
    kind: "accessibility-requirement",
    deterministic: true,
    description: "Runtime components must satisfy deterministic accessibility requirements.",
  },
  {
    kind: "token-drift",
    deterministic: true,
    description: "Runtime design token evidence must match tokens required by active governance contracts.",
  },
  {
    kind: "forbidden-inline-style",
    deterministic: true,
    description: "Runtime components must not use inline style attributes outside approved design-system tokens.",
  },
  {
    kind: "typography-mismatch",
    deterministic: true,
    description: "Runtime typography token evidence must match contract-required typography tokens.",
  },
  {
    kind: "invalid-component-variant",
    deterministic: true,
    description: "Runtime component variants must satisfy deterministic variant token rules.",
  },
  {
    kind: "accessibility-violation",
    deterministic: true,
    description: "Runtime accessibility evidence must not contain deterministic violations.",
  },
  {
    kind: "spacing-inconsistency",
    deterministic: true,
    description: "Runtime component bounds should align to the approved spacing grid.",
  },
  {
    kind: "unauthorized-component",
    deterministic: true,
    description: "Runtime components must be approved by at least one active governance contract.",
  },
];
