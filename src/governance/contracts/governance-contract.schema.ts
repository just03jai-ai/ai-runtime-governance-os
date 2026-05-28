import { z } from "zod";

const severitySchema = z.enum(["info", "warning", "critical"]);

const componentMatcherSchema = z.object({
  componentType: z.string().min(1),
  tagName: z.string().min(1).optional(),
  role: z.string().nullable().optional(),
  selectorIncludes: z.string().min(1).optional(),
});

const runtimeComponentPropertySchema = z.enum(["tagName", "role", "label", "selectorHint", "visible"]);

export const governanceContractSchema = z.object({
  contractId: z.string().min(1),
  version: z.string().min(1),
  componentType: z.string().min(1),
  description: z.string(),
  allowedComponents: z.array(componentMatcherSchema),
  forbiddenComponents: z.array(componentMatcherSchema),
  requiredDesignTokens: z.array(
    z.object({
      name: z.string().min(1),
      category: z.enum(["color", "typography", "spacing", "radius", "shadow", "unknown"]),
    }),
  ),
  variantRules: z.array(
    z.object({
      id: z.string().min(1),
      componentType: z.string().min(1),
      variant: z.string().min(1),
      selectorIncludes: z.string().min(1).optional(),
      requiredTokens: z.array(z.string().min(1)).optional(),
    }),
  ),
  propRestrictions: z.array(
    z.object({
      id: z.string().min(1),
      componentType: z.string().min(1),
      property: runtimeComponentPropertySchema,
      disallowedValues: z.array(z.string()).optional(),
      requiredValue: z.union([z.string(), z.boolean(), z.null()]).optional(),
    }),
  ),
  accessibilityRequirements: z.array(
    z.object({
      id: z.string().min(1),
      componentType: z.string().min(1),
      requireAccessibleLabel: z.boolean().optional(),
      requireRole: z.string().min(1).optional(),
    }),
  ),
  severityMapping: z.object({
    forbiddenComponent: severitySchema,
    unapprovedComponent: severitySchema,
    missingDesignToken: severitySchema,
    variantRuleViolation: severitySchema,
    propRestrictionViolation: severitySchema,
    accessibilityViolation: severitySchema,
  }),
});

export const governanceContractSetSchema = z.array(governanceContractSchema);

export type GovernanceContractSchemaInput = z.input<typeof governanceContractSchema>;
export type GovernanceContractSchemaOutput = z.output<typeof governanceContractSchema>;
