import type { SeverityLevel } from "./severity.js";

export type RuntimeComponentProperty = "tagName" | "role" | "label" | "selectorHint" | "visible";

export interface ComponentMatcherContract {
  readonly componentType: string;
  readonly tagName?: string | undefined;
  readonly role?: string | null | undefined;
  readonly selectorIncludes?: string | undefined;
}

export interface RequiredDesignTokenContract {
  readonly name: string;
  readonly category: "color" | "typography" | "spacing" | "radius" | "shadow" | "unknown";
}

export interface VariantRuleContract {
  readonly id: string;
  readonly componentType: string;
  readonly variant: string;
  readonly selectorIncludes?: string | undefined;
  readonly requiredTokens?: readonly string[] | undefined;
}

export interface PropRestrictionContract {
  readonly id: string;
  readonly componentType: string;
  readonly property: RuntimeComponentProperty;
  readonly disallowedValues?: readonly string[] | undefined;
  readonly requiredValue?: string | boolean | null | undefined;
}

export interface AccessibilityRequirementContract {
  readonly id: string;
  readonly componentType: string;
  readonly requireAccessibleLabel?: boolean | undefined;
  readonly requireRole?: string | undefined;
}

export interface SeverityMappingContract {
  readonly forbiddenComponent: SeverityLevel;
  readonly unapprovedComponent: SeverityLevel;
  readonly missingDesignToken: SeverityLevel;
  readonly variantRuleViolation: SeverityLevel;
  readonly propRestrictionViolation: SeverityLevel;
  readonly accessibilityViolation: SeverityLevel;
}

export interface GovernanceContract {
  readonly contractId: string;
  readonly version: string;
  readonly componentType: string;
  readonly description: string;
  readonly allowedComponents: readonly ComponentMatcherContract[];
  readonly forbiddenComponents: readonly ComponentMatcherContract[];
  readonly requiredDesignTokens: readonly RequiredDesignTokenContract[];
  readonly variantRules: readonly VariantRuleContract[];
  readonly propRestrictions: readonly PropRestrictionContract[];
  readonly accessibilityRequirements: readonly AccessibilityRequirementContract[];
  readonly severityMapping: SeverityMappingContract;
}
