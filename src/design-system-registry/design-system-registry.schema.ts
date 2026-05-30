import { z } from "zod";

const severitySchema = z.enum(["info", "warning", "critical"]);
const tokenCategorySchema = z.enum(["color", "typography", "spacing", "radius", "shadow", "unknown"]);

const ownerSchema = z.object({
  team: z.string().min(1),
  contact: z.string().min(1).optional(),
  repository: z.string().min(1).optional(),
});

const componentMatcherSchema = z.object({
  tagName: z.string().min(1).optional(),
  role: z.string().nullable().optional(),
  selectorIncludes: z.string().min(1).optional(),
});

const severityMappingSchema = z.object({
  forbiddenComponent: severitySchema.optional(),
  unapprovedComponent: severitySchema.optional(),
  missingDesignToken: severitySchema.optional(),
  variantRuleViolation: severitySchema.optional(),
  propRestrictionViolation: severitySchema.optional(),
  accessibilityViolation: severitySchema.optional(),
});

export const designSystemRegistrySchema = z.object({
  registryId: z.string().min(1),
  name: z.string().min(1),
  version: z.object({
    version: z.string().min(1),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1).optional(),
  }),
  owner: ownerSchema.optional(),
  tokens: z.array(
    z.object({
      name: z.string().min(1),
      category: tokenCategorySchema,
      value: z.string().optional(),
      description: z.string().optional(),
    }),
  ),
  components: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      description: z.string().optional(),
      owner: ownerSchema.optional(),
      allowedMatchers: z.array(componentMatcherSchema).min(1),
      forbiddenMatchers: z.array(componentMatcherSchema).optional(),
      requiredTokens: z.array(z.string().min(1)).optional(),
      variants: z
        .array(
          z.object({
            name: z.string().min(1),
            selectorIncludes: z.string().min(1).optional(),
            requiredTokens: z.array(z.string().min(1)).optional(),
          }),
        )
        .optional(),
      states: z
        .array(
          z.object({
            name: z.string().min(1),
            selectorIncludes: z.string().min(1).optional(),
            requiredTokens: z.array(z.string().min(1)).optional(),
            requiredRole: z.string().min(1).optional(),
            requireVisible: z.boolean().optional(),
          }),
        )
        .optional(),
      accessibility: z
        .object({
          requireAccessibleLabel: z.boolean().optional(),
          requireRole: z.string().min(1).optional(),
        })
        .optional(),
      severityMapping: severityMappingSchema.optional(),
    }),
  ),
  defaultSeverityMapping: severityMappingSchema.optional(),
});

export type DesignSystemRegistrySchemaInput = z.input<typeof designSystemRegistrySchema>;
