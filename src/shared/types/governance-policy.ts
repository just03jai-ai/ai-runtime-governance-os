export type GovernancePolicyKind =
  | "allowed-component"
  | "forbidden-component"
  | "required-design-token"
  | "variant-rule"
  | "prop-restriction"
  | "accessibility-requirement";

export interface GovernancePolicy {
  readonly kind: GovernancePolicyKind;
  readonly deterministic: true;
  readonly description: string;
}
