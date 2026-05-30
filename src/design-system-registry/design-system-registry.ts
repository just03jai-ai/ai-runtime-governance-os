import type { SeverityLevel } from "../shared/types/severity.js";

export type DesignSystemTokenCategory = "color" | "typography" | "spacing" | "radius" | "shadow" | "unknown";

export interface DesignSystemRegistryVersion {
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt?: string | undefined;
}

export interface DesignSystemOwner {
  readonly team: string;
  readonly contact?: string | undefined;
  readonly repository?: string | undefined;
}

export interface DesignSystemTokenDefinition {
  readonly name: string;
  readonly category: DesignSystemTokenCategory;
  readonly value?: string | undefined;
  readonly description?: string | undefined;
}

export interface DesignSystemComponentMatcher {
  readonly tagName?: string | undefined;
  readonly role?: string | null | undefined;
  readonly selectorIncludes?: string | undefined;
}

export interface DesignSystemVariantDefinition {
  readonly name: string;
  readonly selectorIncludes?: string | undefined;
  readonly requiredTokens?: readonly string[] | undefined;
}

export interface DesignSystemStateDefinition {
  readonly name: string;
  readonly selectorIncludes?: string | undefined;
  readonly requiredTokens?: readonly string[] | undefined;
  readonly requiredRole?: string | undefined;
  readonly requireVisible?: boolean | undefined;
}

export interface DesignSystemAccessibilityRequirementDefinition {
  readonly requireAccessibleLabel?: boolean | undefined;
  readonly requireRole?: string | undefined;
}

export interface DesignSystemComponentDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly owner?: DesignSystemOwner | undefined;
  readonly allowedMatchers: readonly DesignSystemComponentMatcher[];
  readonly forbiddenMatchers?: readonly DesignSystemComponentMatcher[] | undefined;
  readonly requiredTokens?: readonly string[] | undefined;
  readonly variants?: readonly DesignSystemVariantDefinition[] | undefined;
  readonly states?: readonly DesignSystemStateDefinition[] | undefined;
  readonly accessibility?: DesignSystemAccessibilityRequirementDefinition | undefined;
  readonly severityMapping?: Partial<DesignSystemSeverityMapping> | undefined;
}

export interface DesignSystemSeverityMapping {
  readonly forbiddenComponent: SeverityLevel;
  readonly unapprovedComponent: SeverityLevel;
  readonly missingDesignToken: SeverityLevel;
  readonly variantRuleViolation: SeverityLevel;
  readonly propRestrictionViolation: SeverityLevel;
  readonly accessibilityViolation: SeverityLevel;
}

export interface DesignSystemRegistry {
  readonly registryId: string;
  readonly name: string;
  readonly version: DesignSystemRegistryVersion;
  readonly owner?: DesignSystemOwner | undefined;
  readonly tokens: readonly DesignSystemTokenDefinition[];
  readonly components: readonly DesignSystemComponentDefinition[];
  readonly defaultSeverityMapping?: Partial<DesignSystemSeverityMapping> | undefined;
}

export interface DesignSystemRegistryValidationIssue {
  readonly path: string;
  readonly message: string;
}

export interface DesignSystemRegistryValidationResult {
  readonly valid: boolean;
  readonly issues: readonly DesignSystemRegistryValidationIssue[];
}

export const defaultDesignSystemSeverityMapping: DesignSystemSeverityMapping = {
  forbiddenComponent: "critical",
  unapprovedComponent: "warning",
  missingDesignToken: "warning",
  variantRuleViolation: "warning",
  propRestrictionViolation: "warning",
  accessibilityViolation: "critical",
};
