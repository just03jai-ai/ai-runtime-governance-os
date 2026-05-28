export type GovernancePolicyKind =
  | "allowed-component"
  | "forbidden-component"
  | "required-design-token"
  | "variant-rule"
  | "prop-restriction"
  | "accessibility-requirement"
  | "token-drift"
  | "forbidden-inline-style"
  | "typography-mismatch"
  | "invalid-component-variant"
  | "accessibility-violation"
  | "spacing-inconsistency"
  | "unauthorized-component";

export interface GovernancePolicy {
  readonly kind: GovernancePolicyKind;
  readonly deterministic: true;
  readonly description: string;
}
