import type {
  DesignSystemRegistry,
  DesignSystemRegistryValidationIssue,
  DesignSystemRegistryValidationResult,
} from "./design-system-registry.js";
import { designSystemRegistrySchema } from "./design-system-registry.schema.js";

export class DesignSystemRegistryValidator {
  validate(input: unknown): DesignSystemRegistryValidationResult {
    const result = designSystemRegistrySchema.safeParse(input);
    if (!result.success) {
      return {
        valid: false,
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      };
    }

    const registry = result.data as DesignSystemRegistry;
    const tokenNames = new Set(registry.tokens.map((token) => token.name));
    const componentIds = new Set<string>();
    const issues: DesignSystemRegistryValidationIssue[] = [];

    for (const component of registry.components) {
      if (componentIds.has(component.id)) {
        issues.push({ path: `components.${component.id}`, message: "Duplicate component id." });
      }
      componentIds.add(component.id);

      for (const tokenName of component.requiredTokens ?? []) {
        if (!tokenNames.has(tokenName)) {
          issues.push({
            path: `components.${component.id}.requiredTokens`,
            message: `Unknown token: ${tokenName}`,
          });
        }
      }

      for (const variant of component.variants ?? []) {
        for (const tokenName of variant.requiredTokens ?? []) {
          if (!tokenNames.has(tokenName)) {
            issues.push({
              path: `components.${component.id}.variants.${variant.name}.requiredTokens`,
              message: `Unknown token: ${tokenName}`,
            });
          }
        }
      }

      for (const state of component.states ?? []) {
        for (const tokenName of state.requiredTokens ?? []) {
          if (!tokenNames.has(tokenName)) {
            issues.push({
              path: `components.${component.id}.states.${state.name}.requiredTokens`,
              message: `Unknown token: ${tokenName}`,
            });
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
