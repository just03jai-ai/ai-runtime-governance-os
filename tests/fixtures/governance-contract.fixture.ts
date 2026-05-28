import type { GovernanceContract } from "../../src/governance/contracts/governance-contract.js";

export const buttonGovernanceContract: GovernanceContract = {
  contractId: "Button",
  version: "1.0.0",
  componentType: "Button",
  description: "Deterministic button governance contract for tests.",
  allowedComponents: [
    {
      componentType: "Button",
      tagName: "button",
      role: "button",
    },
  ],
  forbiddenComponents: [
    {
      componentType: "DangerButton",
      tagName: "button",
      selectorIncludes: "danger",
    },
  ],
  requiredDesignTokens: [
    {
      name: "color.action.primary",
      category: "color",
    },
  ],
  variantRules: [
    {
      id: "primary-token",
      componentType: "Button",
      variant: "primary",
      selectorIncludes: "primary",
      requiredTokens: ["color.action.primary"],
    },
  ],
  propRestrictions: [
    {
      id: "label-required-value",
      componentType: "Button",
      property: "label",
      requiredValue: "Submit order",
    },
  ],
  accessibilityRequirements: [
    {
      id: "accessible-name",
      componentType: "Button",
      requireAccessibleLabel: true,
      requireRole: "button",
    },
  ],
  severityMapping: {
    forbiddenComponent: "critical",
    unapprovedComponent: "warning",
    missingDesignToken: "warning",
    variantRuleViolation: "warning",
    propRestrictionViolation: "warning",
    accessibilityViolation: "critical",
  },
};
