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
];
