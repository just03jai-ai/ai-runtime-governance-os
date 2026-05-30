import type { GovernanceContract } from "../governance/contracts/governance-contract.js";
import type {
  DesignSystemComponentDefinition,
  DesignSystemRegistry,
  DesignSystemSeverityMapping,
  DesignSystemTokenDefinition,
} from "./design-system-registry.js";
import { defaultDesignSystemSeverityMapping } from "./design-system-registry.js";

export interface DesignSystemContractGenerationResult {
  readonly registryId: string;
  readonly registryVersion: string;
  readonly contracts: readonly GovernanceContract[];
}

export class DesignSystemContractGenerator {
  generate(registry: DesignSystemRegistry): DesignSystemContractGenerationResult {
    return {
      registryId: registry.registryId,
      registryVersion: registry.version.version,
      contracts: registry.components.map((component) => this.contractForComponent(registry, component)),
    };
  }

  private contractForComponent(
    registry: DesignSystemRegistry,
    component: DesignSystemComponentDefinition,
  ): GovernanceContract {
    const severityMapping = {
      ...defaultDesignSystemSeverityMapping,
      ...(registry.defaultSeverityMapping ?? {}),
      ...(component.severityMapping ?? {}),
    } satisfies DesignSystemSeverityMapping;
    const tokenLookup = new Map(registry.tokens.map((token) => [token.name, token]));
    const requiredTokenNames = [
      ...(component.requiredTokens ?? []),
      ...(component.variants ?? []).flatMap((variant) => variant.requiredTokens ?? []),
      ...(component.states ?? []).flatMap((state) => state.requiredTokens ?? []),
    ];
    const requiredDesignTokens = [...new Set(requiredTokenNames)]
      .flatMap((tokenName) => tokenLookup.get(tokenName) ?? fallbackToken(tokenName))
      .map((token) => ({
        name: token.name,
        category: token.category,
      }));

    return {
      contractId: `${registry.registryId}.${component.id}`,
      version: registry.version.version,
      componentType: component.name,
      description: descriptionFor(registry, component),
      allowedComponents: component.allowedMatchers.map((matcher) => ({
        componentType: component.name,
        ...(matcher.tagName === undefined ? {} : { tagName: matcher.tagName }),
        ...(matcher.role === undefined ? {} : { role: matcher.role }),
        ...(matcher.selectorIncludes === undefined ? {} : { selectorIncludes: matcher.selectorIncludes }),
      })),
      forbiddenComponents: (component.forbiddenMatchers ?? []).map((matcher) => ({
        componentType: component.name,
        ...(matcher.tagName === undefined ? {} : { tagName: matcher.tagName }),
        ...(matcher.role === undefined ? {} : { role: matcher.role }),
        ...(matcher.selectorIncludes === undefined ? {} : { selectorIncludes: matcher.selectorIncludes }),
      })),
      requiredDesignTokens,
      variantRules: (component.variants ?? []).map((variant) => ({
        id: `${component.id}.variant.${variant.name}`,
        componentType: component.name,
        variant: variant.name,
        ...(variant.selectorIncludes === undefined ? {} : { selectorIncludes: variant.selectorIncludes }),
        ...(variant.requiredTokens === undefined ? {} : { requiredTokens: variant.requiredTokens }),
      })),
      propRestrictions: (component.states ?? []).flatMap((state) => [
        ...(state.requiredRole
          ? [
              {
                id: `${component.id}.state.${state.name}.role`,
                componentType: component.name,
                property: "role" as const,
                requiredValue: state.requiredRole,
              },
            ]
          : []),
        ...(state.requireVisible === undefined
          ? []
          : [
              {
                id: `${component.id}.state.${state.name}.visible`,
                componentType: component.name,
                property: "visible" as const,
                requiredValue: state.requireVisible,
              },
            ]),
      ]),
      accessibilityRequirements: component.accessibility
        ? [
            {
              id: `${component.id}.accessibility`,
              componentType: component.name,
              ...(component.accessibility.requireAccessibleLabel === undefined
                ? {}
                : { requireAccessibleLabel: component.accessibility.requireAccessibleLabel }),
              ...(component.accessibility.requireRole === undefined
                ? {}
                : { requireRole: component.accessibility.requireRole }),
            },
          ]
        : [],
      severityMapping,
    };
  }
}

function descriptionFor(registry: DesignSystemRegistry, component: DesignSystemComponentDefinition): string {
  const owner = component.owner ?? registry.owner;
  const ownerText = owner ? ` Owner: ${owner.team}${owner.contact ? ` (${owner.contact})` : ""}.` : "";
  return `${component.description ?? `${component.name} generated from design-system registry.`}${ownerText}`;
}

function fallbackToken(tokenName: string): DesignSystemTokenDefinition {
  return {
    name: tokenName,
    category: "unknown",
  };
}
