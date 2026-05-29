import type {
  ComponentMatcherContract,
  GovernanceContract,
  PropRestrictionContract,
  RequiredDesignTokenContract,
  VariantRuleContract,
} from "../contracts/governance-contract.js";
import { governanceContractSetSchema } from "../contracts/governance-contract.schema.js";
import type { GovernancePolicyKind } from "../policies/governance-policy.js";
import type {
  RuntimeEvidence,
  RuntimeEvidenceComponent,
  RuntimeEvidenceDesignToken,
  RuntimeEvidenceSeverity,
} from "../../shared/types/runtime-evidence.js";
import type { GovernanceValidationFinding, GovernanceValidationResult } from "./governance-finding.js";
import { highestSeverity } from "../severity/severity-utils.js";

export class GovernanceValidationEngine {
  validate(evidence: RuntimeEvidence, contracts: readonly GovernanceContract[]): GovernanceValidationResult {
    const parsedContracts = governanceContractSetSchema.parse(contracts);
    const findings: GovernanceValidationFinding[] = [];

    for (const component of evidence.componentInventory) {
      findings.push(...this.validateForbiddenComponents(evidence, component, parsedContracts));
      findings.push(...this.validateAllowedComponents(evidence, component, parsedContracts));
      findings.push(...this.validatePropRestrictions(evidence, component, parsedContracts));
      findings.push(...this.validateAccessibilityRequirements(evidence, component, parsedContracts));
      findings.push(...this.validateVariantRules(evidence, component, parsedContracts));
    }

    findings.push(...this.validateRequiredDesignTokens(evidence, parsedContracts));

    return {
      runId: evidence.execution.runId,
      route: evidence.route.resolvedUrl,
      evaluatedContractCount: parsedContracts.length,
      findingCount: findings.length,
      findings,
    };
  }

  private validateForbiddenComponents(
    evidence: RuntimeEvidence,
    component: RuntimeEvidenceComponent,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const findings: GovernanceValidationFinding[] = [];

    for (const contract of contracts) {
      for (const matcher of contract.forbiddenComponents) {
        if (!this.matchesComponent(component, matcher)) {
          continue;
        }

        findings.push(
          this.createFinding({
            evidence,
            component,
            policy: "forbidden-component",
            severity: contract.severityMapping.forbiddenComponent,
            ruleId: `${contract.contractId}.forbidden.${matcher.componentType}`,
            expected: `Component must not match forbidden ${matcher.componentType} rule.`,
            actual: this.describeComponent(component),
          }),
        );
      }
    }

    return findings;
  }

  private validateAllowedComponents(
    evidence: RuntimeEvidence,
    component: RuntimeEvidenceComponent,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const allowedMatchers = contracts.flatMap((contract) => contract.allowedComponents);
    const isAllowed = allowedMatchers.some((matcher) => this.matchesComponent(component, matcher));

    if (isAllowed) {
      return [];
    }

    const severity = highestSeverity(contracts.map((contract) => contract.severityMapping.unapprovedComponent));

    return [
      this.createFinding({
        evidence,
        component,
        policy: "allowed-component",
        severity,
        ruleId: "design-system.allowed-component",
        expected: "Runtime component must match an approved design-system component contract.",
        actual: this.describeComponent(component),
      }),
    ];
  }

  private validateRequiredDesignTokens(
    evidence: RuntimeEvidence,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const findings: GovernanceValidationFinding[] = [];

    for (const contract of contracts) {
      for (const token of contract.requiredDesignTokens) {
        if (this.hasDesignToken(evidence.designTokens, token)) {
          continue;
        }

        findings.push(
          this.createFinding({
            evidence,
            component: contract.componentType,
            policy: "required-design-token",
            severity: contract.severityMapping.missingDesignToken,
            ruleId: `${contract.contractId}.token.${token.name}`,
            expected: `${token.name} (${token.category})`,
            actual: "missing",
          }),
        );
      }
    }

    return findings;
  }

  private validateVariantRules(
    evidence: RuntimeEvidence,
    component: RuntimeEvidenceComponent,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const findings: GovernanceValidationFinding[] = [];

    for (const contract of contracts) {
      if (!this.contractAppliesToComponent(contract, component)) {
        continue;
      }

      for (const rule of contract.variantRules) {
        if (!this.variantRuleApplies(component, rule)) {
          continue;
        }

        const missingTokens = (rule.requiredTokens ?? []).filter(
          (tokenName) => !evidence.designTokens.some((token) => token.name === tokenName),
        );

        if (missingTokens.length === 0) {
          continue;
        }

        findings.push(
          this.createFinding({
            evidence,
            component,
            policy: "variant-rule",
            severity: contract.severityMapping.variantRuleViolation,
            ruleId: `${contract.contractId}.variant.${rule.id}`,
            expected: `Variant ${rule.variant} requires tokens: ${missingTokens.join(", ")}`,
            actual: "required tokens missing from runtime evidence",
          }),
        );
      }
    }

    return findings;
  }

  private validatePropRestrictions(
    evidence: RuntimeEvidence,
    component: RuntimeEvidenceComponent,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const findings: GovernanceValidationFinding[] = [];

    for (const contract of contracts) {
      if (!this.contractAppliesToComponent(contract, component)) {
        continue;
      }

      for (const restriction of contract.propRestrictions) {
        const actualValue = this.getComponentProperty(component, restriction);
        const actualString = String(actualValue);
        const violatesDisallowedValue = restriction.disallowedValues?.includes(actualString) ?? false;
        const violatesRequiredValue =
          "requiredValue" in restriction && actualValue !== restriction.requiredValue;

        if (!violatesDisallowedValue && !violatesRequiredValue) {
          continue;
        }

        findings.push(
          this.createFinding({
            evidence,
            component,
            policy: "prop-restriction",
            severity: contract.severityMapping.propRestrictionViolation,
            ruleId: `${contract.contractId}.prop.${restriction.id}`,
            expected:
              "requiredValue" in restriction
                ? `${restriction.property} === ${String(restriction.requiredValue)}`
                : `${restriction.property} not in ${(restriction.disallowedValues ?? []).join(", ")}`,
            actual: `${restriction.property} === ${actualString}`,
          }),
        );
      }
    }

    return findings;
  }

  private validateAccessibilityRequirements(
    evidence: RuntimeEvidence,
    component: RuntimeEvidenceComponent,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const findings: GovernanceValidationFinding[] = [];

    for (const contract of contracts) {
      if (!this.contractAppliesToComponent(contract, component)) {
        continue;
      }

      for (const requirement of contract.accessibilityRequirements) {
        if (requirement.requireAccessibleLabel && component.label.trim().length === 0) {
          findings.push(
            this.createFinding({
              evidence,
              component,
              policy: "accessibility-requirement",
              severity: contract.severityMapping.accessibilityViolation,
              ruleId: `${contract.contractId}.a11y.${requirement.id}`,
              expected: "component has deterministic accessible label evidence",
              actual: "empty label",
            }),
          );
        }

        if (requirement.requireRole && component.role !== requirement.requireRole) {
          findings.push(
            this.createFinding({
              evidence,
              component,
              policy: "accessibility-requirement",
              severity: contract.severityMapping.accessibilityViolation,
              ruleId: `${contract.contractId}.a11y.${requirement.id}.role`,
              expected: `role === ${requirement.requireRole}`,
              actual: `role === ${component.role ?? "null"}`,
            }),
          );
        }
      }
    }

    return findings;
  }

  private matchesComponent(component: RuntimeEvidenceComponent, matcher: ComponentMatcherContract): boolean {
    const tagMatches = matcher.tagName === undefined || component.tagName === matcher.tagName;
    const roleMatches = !("role" in matcher) || component.role === matcher.role;
    const selectorMatches =
      matcher.selectorIncludes === undefined || component.selectorHint.includes(matcher.selectorIncludes);

    return tagMatches && roleMatches && selectorMatches;
  }

  private contractAppliesToComponent(contract: GovernanceContract, component: RuntimeEvidenceComponent): boolean {
    return contract.allowedComponents.some((matcher) => this.matchesComponent(component, matcher));
  }

  private variantRuleApplies(component: RuntimeEvidenceComponent, rule: VariantRuleContract): boolean {
    return rule.selectorIncludes === undefined || component.selectorHint.includes(rule.selectorIncludes);
  }

  private hasDesignToken(
    designTokens: readonly RuntimeEvidenceDesignToken[],
    requiredToken: RequiredDesignTokenContract,
  ): boolean {
    return designTokens.some((token) => token.name === requiredToken.name && token.category === requiredToken.category);
  }

  private getComponentProperty(
    component: RuntimeEvidenceComponent,
    restriction: PropRestrictionContract,
  ): string | boolean | null {
    return component[restriction.property];
  }

  private createFinding(input: {
    readonly evidence: RuntimeEvidence;
    readonly component: RuntimeEvidenceComponent | string;
    readonly policy: GovernancePolicyKind;
    readonly severity: RuntimeEvidenceSeverity;
    readonly ruleId: string;
    readonly expected: string;
    readonly actual: string;
  }): GovernanceValidationFinding {
    const componentId = typeof input.component === "string" ? input.component : input.component.id;

    return {
      id: this.stableFindingId(input.evidence.execution.runId, input.ruleId, componentId),
      policy: input.policy,
      severity: input.severity,
      route: input.evidence.route.resolvedUrl,
      component: componentId,
      evidence:
        typeof input.component === "string"
          ? { runId: input.evidence.execution.runId, componentName: this.standardComponentName(input.component) }
          : {
              componentId: input.component.id,
              componentName: input.component.name,
              tagName: input.component.tagName,
              role: input.component.role,
              selectorHint: input.component.selectorHint,
              visible: input.component.visible,
            },
      expected: input.expected,
      actual: input.actual,
      confidence: 1,
    };
  }

  private stableFindingId(runId: string, ruleId: string, componentId: string): string {
    return `${runId}:${ruleId}:${componentId}`.replace(/[^a-zA-Z0-9_.:-]/g, "-");
  }

  private describeComponent(component: RuntimeEvidenceComponent): string {
    return `${component.tagName} role=${component.role ?? "null"} selector=${component.selectorHint}`;
  }

  private standardComponentName(component: string): string {
    const componentNameMap: Readonly<Record<string, string>> = {
      Input: "TextField",
      TextInput: "TextField",
      Typography: "Text",
    };

    return componentNameMap[component] ?? component;
  }
}
