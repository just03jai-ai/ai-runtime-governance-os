import type {
  DesignSystemComponentDefinition,
  DesignSystemRegistry,
  DesignSystemTokenDefinition,
  DesignSystemVariantDefinition,
} from "../../design-system-registry/index.js";
import type { PrioritizedRemediationItem, PrioritizedRemediationPlan } from "../prioritization/index.js";
import type { RootCauseInsight, RootCauseReport } from "../root-cause/index.js";

export type RemediationRecommendationType =
  | "token-correction"
  | "component-migration"
  | "variant-correction"
  | "accessibility-fix"
  | "governance-policy-fix";

export interface RemediationRecommendationEvidence {
  readonly findingIds: readonly string[];
  readonly rootCauseIds: readonly string[];
  readonly prioritizedRanks: readonly number[];
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly tokenNames: readonly string[];
  readonly variantNames: readonly string[];
  readonly policyIds: readonly string[];
  readonly registryComponentIds: readonly string[];
}

export interface RemediationRecommendation {
  readonly id: string;
  readonly type: RemediationRecommendationType;
  readonly priority: PrioritizedRemediationItem["priority"];
  readonly title: string;
  readonly guidance: string;
  readonly steps: readonly string[];
  readonly evidence: RemediationRecommendationEvidence;
}

export interface RemediationRecommendations {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly recommendationCount: number;
  readonly recommendations: readonly RemediationRecommendation[];
}

export interface RemediationRecommendationInput {
  readonly prioritizedRemediationPlan: PrioritizedRemediationPlan;
  readonly rootCauseReport: RootCauseReport;
  readonly designSystemRegistry: DesignSystemRegistry;
  readonly generatedAt?: string | undefined;
}

export class RemediationRecommendationEngine {
  recommend(input: RemediationRecommendationInput): RemediationRecommendations {
    const generatedAt = input.generatedAt ?? new Date().toISOString();
    const recommendations = input.prioritizedRemediationPlan.items
      .flatMap((item) => recommendationsForItem(item, input))
      .filter((recommendation) => hasEvidence(recommendation.evidence))
      .sort(
        (left, right) =>
          priorityRank(right.priority) - priorityRank(left.priority) ||
          left.evidence.prioritizedRanks[0]! - right.evidence.prioritizedRanks[0]! ||
          left.id.localeCompare(right.id),
      );

    return {
      reportId: `remediation-recommendations:${input.prioritizedRemediationPlan.planId}`,
      generatedAt,
      recommendationCount: recommendations.length,
      recommendations,
    };
  }
}

function recommendationsForItem(
  item: PrioritizedRemediationItem,
  input: RemediationRecommendationInput,
): readonly RemediationRecommendation[] {
  const rootCauses = rootCausesForItem(item, input.rootCauseReport);
  const registryComponent = registryComponentForItem(item, input.designSystemRegistry);
  const tokenNames = unique([
    ...rootCauses.flatMap((cause) => cause.evidence.tokenNames),
    ...tokensForItem(item, input.designSystemRegistry),
  ]);
  const variants = variantsForItem(item, registryComponent, rootCauses);
  const policyIds = unique(rootCauses.flatMap((cause) => cause.evidence.policyIds));
  const recommendations: RemediationRecommendation[] = [];

  if (tokenNames.length > 0) {
    recommendations.push(tokenCorrection(item, input.designSystemRegistry, tokenNames, rootCauses, registryComponent));
  }

  if (registryComponent && shouldRecommendComponentMigration(item, rootCauses)) {
    recommendations.push(componentMigration(item, registryComponent, rootCauses));
  }

  if (variants.length > 0) {
    recommendations.push(variantCorrection(item, registryComponent, variants, rootCauses));
  }

  if (isAccessibilityItem(item, rootCauses, registryComponent)) {
    recommendations.push(accessibilityFix(item, registryComponent, rootCauses));
  }

  if (policyIds.length > 0 || rootCauses.some((cause) => cause.category === "policy")) {
    recommendations.push(governancePolicyFix(item, policyIds, rootCauses, registryComponent));
  }

  return recommendations;
}

function tokenCorrection(
  item: PrioritizedRemediationItem,
  registry: DesignSystemRegistry,
  tokenNames: readonly string[],
  rootCauses: readonly RootCauseInsight[],
  registryComponent: DesignSystemComponentDefinition | undefined,
): RemediationRecommendation {
  const tokens = tokenNames.flatMap((tokenName) => tokenForName(registry, tokenName) ?? []);
  const tokenText = tokenNames.join(", ");
  const steps = [
    `Confirm runtime evidence captures the registry token(s): ${tokenText}.`,
    ...tokens.map((token) => `Use ${token.name}${token.value ? ` (${token.value})` : ""} for ${token.category} styling.`),
    ...(registryComponent ? [`Verify ${registryComponent.name} required tokens: ${(registryComponent.requiredTokens ?? []).join(", ") || "none"}.`] : []),
  ];

  return recommendation({
    id: `remediation:token:${slug(item.findingId)}`,
    type: "token-correction",
    item,
    rootCauses,
    registryComponent,
    title: `Correct token usage for ${item.component}`,
    guidance: `Resolve token drift by aligning implementation and evidence with registry-defined token requirements: ${tokenText}.`,
    steps,
    tokenNames,
  });
}

function componentMigration(
  item: PrioritizedRemediationItem,
  registryComponent: DesignSystemComponentDefinition,
  rootCauses: readonly RootCauseInsight[],
): RemediationRecommendation {
  const allowed = registryComponent.allowedMatchers.map(matcherText);
  const forbidden = (registryComponent.forbiddenMatchers ?? []).map(matcherText);
  return recommendation({
    id: `remediation:component:${slug(item.findingId)}`,
    type: "component-migration",
    item,
    rootCauses,
    registryComponent,
    title: `Migrate ${item.component} to registry-approved implementation`,
    guidance: `Use the ${registryComponent.name} registry definition as the migration target for the affected component.`,
    steps: [
      `Match one approved selector contract: ${allowed.join(" | ") || registryComponent.name}.`,
      ...(forbidden.length > 0 ? [`Remove forbidden implementation patterns: ${forbidden.join(" | ")}.`] : []),
      "Re-run governance verification after migration evidence is captured.",
    ],
  });
}

function variantCorrection(
  item: PrioritizedRemediationItem,
  registryComponent: DesignSystemComponentDefinition | undefined,
  variants: readonly DesignSystemVariantDefinition[],
  rootCauses: readonly RootCauseInsight[],
): RemediationRecommendation {
  const variantNames = variants.map((variant) => variant.name);
  return recommendation({
    id: `remediation:variant:${slug(item.findingId)}`,
    type: "variant-correction",
    item,
    rootCauses,
    registryComponent,
    title: `Correct ${item.component} variant contract`,
    guidance: `Align the affected component variant with registry selector and token requirements.`,
    steps: variants.flatMap((variant) => [
      `Verify ${variant.name} variant selector evidence${variant.selectorIncludes ? ` includes ${variant.selectorIncludes}` : ""}.`,
      `Ensure required variant tokens are present: ${(variant.requiredTokens ?? []).join(", ") || "none"}.`,
    ]),
    variantNames,
    tokenNames: unique(variants.flatMap((variant) => variant.requiredTokens ?? [])),
  });
}

function accessibilityFix(
  item: PrioritizedRemediationItem,
  registryComponent: DesignSystemComponentDefinition | undefined,
  rootCauses: readonly RootCauseInsight[],
): RemediationRecommendation {
  const accessibility = registryComponent?.accessibility;
  return recommendation({
    id: `remediation:accessibility:${slug(item.findingId)}`,
    type: "accessibility-fix",
    item,
    rootCauses,
    registryComponent,
    title: `Fix accessibility evidence for ${item.component}`,
    guidance: "Resolve accessibility impact using deterministic registry requirements and preserve regression evidence.",
    steps: [
      accessibility?.requireAccessibleLabel
        ? "Add or verify an accessible label for the affected interactive component."
        : "Verify accessible name, role, keyboard operation, and focus evidence for the affected component.",
      accessibility?.requireRole ? `Verify required role: ${accessibility.requireRole}.` : "Verify role evidence matches the component contract.",
      "Add regression coverage for keyboard and screen-reader relevant interaction paths.",
    ],
    policyIds: unique(["accessibility", ...rootCauses.flatMap((cause) => cause.evidence.policyIds)]),
  });
}

function governancePolicyFix(
  item: PrioritizedRemediationItem,
  policyIds: readonly string[],
  rootCauses: readonly RootCauseInsight[],
  registryComponent: DesignSystemComponentDefinition | undefined,
): RemediationRecommendation {
  const policies = unique([...policyIds, ...rootCauses.flatMap((cause) => cause.evidence.policyIds)]);
  return recommendation({
    id: `remediation:policy:${slug(item.findingId)}`,
    type: "governance-policy-fix",
    item,
    rootCauses,
    registryComponent,
    title: `Fix governance policy failures for ${item.component}`,
    guidance: `Address recurring policy failures before broadening adjacent rules.`,
    steps: [
      `Review policy evidence: ${policies.join(", ") || "policy evidence unavailable"}.`,
      "Confirm the registry contract still represents the intended design-system behavior.",
      "Update governance policy inputs or component evidence, then re-run verification.",
    ],
    policyIds: policies,
  });
}

function recommendation(input: {
  readonly id: string;
  readonly type: RemediationRecommendationType;
  readonly item: PrioritizedRemediationItem;
  readonly rootCauses: readonly RootCauseInsight[];
  readonly registryComponent?: DesignSystemComponentDefinition | undefined;
  readonly title: string;
  readonly guidance: string;
  readonly steps: readonly string[];
  readonly tokenNames?: readonly string[] | undefined;
  readonly variantNames?: readonly string[] | undefined;
  readonly policyIds?: readonly string[] | undefined;
}): RemediationRecommendation {
  return {
    id: input.id,
    type: input.type,
    priority: input.item.priority,
    title: input.title,
    guidance: input.guidance,
    steps: input.steps,
    evidence: {
      findingIds: input.item.evidence.findingIds,
      rootCauseIds: unique([...input.item.evidence.rootCauseIds, ...input.rootCauses.map((cause) => cause.id)]),
      prioritizedRanks: [input.item.rank],
      componentIds: unique([
        input.item.component,
        ...input.item.evidence.componentIds,
        ...input.rootCauses.flatMap((cause) => cause.evidence.componentIds),
      ]),
      routes: unique([...input.item.evidence.routes, ...input.rootCauses.flatMap((cause) => cause.evidence.routes)]),
      tokenNames: unique([
        ...(input.tokenNames ?? []),
        ...input.rootCauses.flatMap((cause) => cause.evidence.tokenNames),
      ]),
      variantNames: unique(input.variantNames ?? []),
      policyIds: unique([
        ...(input.policyIds ?? []),
        ...input.rootCauses.flatMap((cause) => cause.evidence.policyIds),
      ]),
      registryComponentIds: input.registryComponent ? [input.registryComponent.id] : [],
    },
  };
}

function rootCausesForItem(item: PrioritizedRemediationItem, report: RootCauseReport): readonly RootCauseInsight[] {
  const ids = new Set(item.evidence.rootCauseIds);
  return report.rootCauses.filter(
    (cause) => ids.has(cause.id) || cause.evidence.findingIds.some((findingId) => item.evidence.findingIds.includes(findingId)),
  );
}

function registryComponentForItem(
  item: PrioritizedRemediationItem,
  registry: DesignSystemRegistry,
): DesignSystemComponentDefinition | undefined {
  const componentIds = new Set([item.component, ...item.evidence.componentIds].map((value) => value.toLowerCase()));
  return registry.components.find(
    (component) => componentIds.has(component.id.toLowerCase()) || componentIds.has(component.name.toLowerCase()),
  );
}

function tokensForItem(item: PrioritizedRemediationItem, registry: DesignSystemRegistry): readonly string[] {
  const text = [item.findingId, item.recommendation, ...item.explanation, ...item.evidence.factorSignals].join(" ");
  return registry.tokens.filter((token) => text.includes(token.name)).map((token) => token.name);
}

function variantsForItem(
  item: PrioritizedRemediationItem,
  registryComponent: DesignSystemComponentDefinition | undefined,
  rootCauses: readonly RootCauseInsight[],
): readonly DesignSystemVariantDefinition[] {
  if (!registryComponent?.variants) {
    return [];
  }
  const haystack = [
    item.findingId,
    item.recommendation,
    ...item.explanation,
    ...rootCauses.flatMap((cause) => [cause.id, cause.summary, cause.recommendation, ...cause.evidence.policyIds]),
  ].join(" ").toLowerCase();
  return registryComponent.variants.filter((variant) => {
    const tokenMentioned = (variant.requiredTokens ?? []).some((tokenName) => haystack.includes(tokenName.toLowerCase()));
    return haystack.includes("variant") || haystack.includes(variant.name.toLowerCase()) || tokenMentioned;
  });
}

function shouldRecommendComponentMigration(
  item: PrioritizedRemediationItem,
  rootCauses: readonly RootCauseInsight[],
): boolean {
  return (
    rootCauses.some((cause) => cause.category === "component") ||
    item.evidence.factorSignals.some((signal) => signal.startsWith("component-health:")) ||
    /component|misuse|migration|contract/i.test(item.recommendation)
  );
}

function isAccessibilityItem(
  item: PrioritizedRemediationItem,
  rootCauses: readonly RootCauseInsight[],
  registryComponent: DesignSystemComponentDefinition | undefined,
): boolean {
  return (
    item.evidence.factorSignals.includes("accessibility-impact") ||
    /accessib|aria|label|focus|keyboard|contrast/i.test([item.findingId, item.recommendation, ...item.explanation].join(" ")) ||
    rootCauses.some((cause) => /accessib|aria|label|focus|keyboard|contrast/i.test(cause.summary)) ||
    registryComponent?.accessibility !== undefined
  );
}

function tokenForName(registry: DesignSystemRegistry, tokenName: string): DesignSystemTokenDefinition | undefined {
  return registry.tokens.find((token) => token.name === tokenName);
}

function matcherText(matcher: {
  readonly tagName?: string | undefined;
  readonly role?: string | null | undefined;
  readonly selectorIncludes?: string | undefined;
}): string {
  return [
    matcher.tagName ? `tag=${matcher.tagName}` : "",
    matcher.role ? `role=${matcher.role}` : "",
    matcher.selectorIncludes ? `selector includes ${matcher.selectorIncludes}` : "",
  ].filter(Boolean).join(", ");
}

function hasEvidence(evidence: RemediationRecommendationEvidence): boolean {
  return (
    evidence.findingIds.length > 0 ||
    evidence.rootCauseIds.length > 0 ||
    evidence.prioritizedRanks.length > 0 ||
    evidence.componentIds.length > 0 ||
    evidence.routes.length > 0 ||
    evidence.tokenNames.length > 0 ||
    evidence.variantNames.length > 0 ||
    evidence.policyIds.length > 0 ||
    evidence.registryComponentIds.length > 0
  );
}

function priorityRank(priority: PrioritizedRemediationItem["priority"]): number {
  return priority === "critical" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
}
