import type { GovernanceContract } from "../../contracts/governance-contract.js";
import type { GovernanceValidationFinding } from "../../validation/governance-finding.js";
import type { GovernancePolicyKind } from "../../../shared/types/governance-policy.js";
import type {
  RuntimeEvidence,
  RuntimeEvidenceComponent,
  RuntimeEvidenceDesignToken,
  RuntimeEvidenceSeverity,
} from "../../../shared/types/runtime-evidence.js";
import { highestSeverity } from "../../severity/severity-utils.js";
import { severityForCorePolicy } from "./core-policy-pack.js";

export interface CorePolicyEngineOptions {
  readonly spacingGridPx?: number | undefined;
}

export class CorePolicyEngine {
  constructor(private readonly options: CorePolicyEngineOptions = {}) {}

  validate(evidence: RuntimeEvidence, contracts: readonly GovernanceContract[]): readonly GovernanceValidationFinding[] {
    return [
      ...this.validateTokenDrift(evidence, contracts),
      ...this.validateForbiddenInlineStyles(evidence),
      ...this.validateTypographyMismatch(evidence, contracts),
      ...this.validateInvalidVariants(evidence, contracts),
      ...this.validateAccessibilityViolations(evidence, contracts),
      ...this.validateSpacingConsistency(evidence),
      ...this.validateUnauthorizedComponents(evidence, contracts),
    ];
  }

  private validateTokenDrift(
    evidence: RuntimeEvidence,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    return contracts.flatMap((contract) =>
      contract.requiredDesignTokens
        .filter((requiredToken) => !this.hasToken(evidence.designTokens, requiredToken.name, requiredToken.category))
        .map((requiredToken) =>
          this.createFinding({
            evidence,
            policy: "token-drift",
            severity: contract.severityMapping.missingDesignToken,
            component: contract.componentType,
            expected: `${requiredToken.name} (${requiredToken.category})`,
            actual: "missing from runtime token evidence",
            evidencePayload: {
              contractId: contract.contractId,
              tokenName: requiredToken.name,
              tokenCategory: requiredToken.category,
            },
          }),
        ),
    );
  }

  private validateForbiddenInlineStyles(evidence: RuntimeEvidence): GovernanceValidationFinding[] {
    return evidence.componentInventory
      .filter((component) => (component.attributes?.style ?? "").trim().length > 0)
      .map((component) =>
        this.createFinding({
          evidence,
          policy: "forbidden-inline-style",
          severity: severityForCorePolicy("forbidden-inline-style"),
          component,
          expected: "component has no inline style attribute",
          actual: `style="${component.attributes?.style ?? ""}"`,
          evidencePayload: this.componentEvidence(component),
        }),
      );
  }

  private validateTypographyMismatch(
    evidence: RuntimeEvidence,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    return contracts.flatMap((contract) =>
      contract.requiredDesignTokens
        .filter((requiredToken) => requiredToken.category === "typography")
        .filter((requiredToken) => !this.hasToken(evidence.designTokens, requiredToken.name, "typography"))
        .map((requiredToken) =>
          this.createFinding({
            evidence,
            policy: "typography-mismatch",
            severity: contract.severityMapping.missingDesignToken,
            component: contract.componentType,
            expected: `typography token ${requiredToken.name}`,
            actual: "missing from runtime typography evidence",
            evidencePayload: {
              contractId: contract.contractId,
              tokenName: requiredToken.name,
              tokenCategory: "typography",
            },
          }),
        ),
    );
  }

  private validateInvalidVariants(
    evidence: RuntimeEvidence,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const findings: GovernanceValidationFinding[] = [];

    for (const component of evidence.componentInventory) {
      for (const contract of contracts) {
        if (!this.contractAppliesToComponent(contract, component)) {
          continue;
        }

        for (const rule of contract.variantRules) {
          if (rule.selectorIncludes && !component.selectorHint.includes(rule.selectorIncludes)) {
            continue;
          }

          const missingTokens = (rule.requiredTokens ?? []).filter((tokenName) => !this.hasTokenNamed(evidence, tokenName));

          if (missingTokens.length === 0) {
            continue;
          }

          findings.push(
            this.createFinding({
              evidence,
              policy: "invalid-component-variant",
              severity: contract.severityMapping.variantRuleViolation,
              component,
              expected: `${rule.variant} variant has tokens: ${missingTokens.join(", ")}`,
              actual: "variant token evidence missing",
              evidencePayload: {
                ...this.componentEvidence(component),
                contractId: contract.contractId,
                variantRuleId: rule.id,
                variant: rule.variant,
              },
            }),
          );
        }
      }
    }

    return findings;
  }

  private validateAccessibilityViolations(
    evidence: RuntimeEvidence,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const capturedFindings = evidence.accessibilityFindings.map((finding) =>
      this.createFinding({
        evidence,
        policy: "accessibility-violation",
        severity: finding.severity,
        component: finding.selectorHint ?? "accessibility",
        expected: finding.ruleId,
        actual: finding.message,
        evidencePayload: {
          accessibilityFindingId: finding.id,
          ruleId: finding.ruleId,
          selectorHint: finding.selectorHint ?? null,
        },
      }),
    );
    const contractFindings = evidence.componentInventory.flatMap((component) =>
      contracts.flatMap((contract) => {
        if (!this.contractAppliesToComponent(contract, component)) {
          return [];
        }

        return contract.accessibilityRequirements.flatMap((requirement) => {
          const findings: GovernanceValidationFinding[] = [];

          if (requirement.requireAccessibleLabel && component.label.trim().length === 0) {
            findings.push(
              this.createFinding({
                evidence,
                policy: "accessibility-violation",
                severity: contract.severityMapping.accessibilityViolation,
                component,
                expected: "component has accessible label evidence",
                actual: "empty label",
                evidencePayload: {
                  ...this.componentEvidence(component),
                  contractId: contract.contractId,
                  accessibilityRequirementId: requirement.id,
                },
              }),
            );
          }

          if (requirement.requireRole && component.role !== requirement.requireRole) {
            findings.push(
              this.createFinding({
                evidence,
                policy: "accessibility-violation",
                severity: contract.severityMapping.accessibilityViolation,
                component,
                expected: `role === ${requirement.requireRole}`,
                actual: `role === ${component.role ?? "null"}`,
                evidencePayload: {
                  ...this.componentEvidence(component),
                  contractId: contract.contractId,
                  accessibilityRequirementId: requirement.id,
                },
              }),
            );
          }

          return findings;
        });
      }),
    );

    return [...capturedFindings, ...contractFindings];
  }

  private validateSpacingConsistency(evidence: RuntimeEvidence): GovernanceValidationFinding[] {
    const grid = this.options.spacingGridPx ?? 4;

    return evidence.componentInventory
      .filter((component) => component.visible && component.boundingBox !== undefined)
      .filter((component) => {
        const box = component.boundingBox;
        return Boolean(
          box &&
            [box.x, box.y, box.width, box.height].some((value) => Math.round(value) % grid !== 0),
        );
      })
      .map((component) =>
        this.createFinding({
          evidence,
          policy: "spacing-inconsistency",
          severity: severityForCorePolicy("spacing-inconsistency"),
          component,
          expected: `component bounds align to ${grid}px spacing grid`,
          actual: component.boundingBox
            ? `x=${component.boundingBox.x}, y=${component.boundingBox.y}, width=${component.boundingBox.width}, height=${component.boundingBox.height}`
            : "missing bounding box",
          evidencePayload: this.componentEvidence(component),
        }),
      );
  }

  private validateUnauthorizedComponents(
    evidence: RuntimeEvidence,
    contracts: readonly GovernanceContract[],
  ): GovernanceValidationFinding[] {
    const severity = highestSeverity(contracts.map((contract) => contract.severityMapping.unapprovedComponent));

    return evidence.componentInventory
      .filter((component) => !contracts.some((contract) => this.contractAppliesToComponent(contract, component)))
      .map((component) =>
        this.createFinding({
          evidence,
          policy: "unauthorized-component",
          severity,
          component,
          expected: "component matches an approved governance contract",
          actual: `${component.tagName} role=${component.role ?? "null"} selector=${component.selectorHint}`,
          evidencePayload: this.componentEvidence(component),
        }),
      );
  }

  private contractAppliesToComponent(contract: GovernanceContract, component: RuntimeEvidenceComponent): boolean {
    return contract.allowedComponents.some((matcher) => {
      const tagMatches = matcher.tagName === undefined || matcher.tagName === component.tagName;
      const roleMatches = !("role" in matcher) || matcher.role === component.role;
      const selectorMatches =
        matcher.selectorIncludes === undefined || component.selectorHint.includes(matcher.selectorIncludes);
      return tagMatches && roleMatches && selectorMatches;
    });
  }

  private hasToken(
    designTokens: readonly RuntimeEvidenceDesignToken[],
    name: string,
    category: RuntimeEvidenceDesignToken["category"],
  ): boolean {
    return designTokens.some((token) => token.name === name && token.category === category);
  }

  private hasTokenNamed(evidence: RuntimeEvidence, tokenName: string): boolean {
    return evidence.designTokens.some((token) => token.name === tokenName);
  }

  private componentEvidence(component: RuntimeEvidenceComponent): GovernanceValidationFinding["evidence"] {
    return {
      componentId: component.id,
      tagName: component.tagName,
      role: component.role,
      selectorHint: component.selectorHint,
      visible: component.visible,
    };
  }

  private createFinding(input: {
    readonly evidence: RuntimeEvidence;
    readonly policy: GovernancePolicyKind;
    readonly severity: RuntimeEvidenceSeverity;
    readonly component: RuntimeEvidenceComponent | string;
    readonly expected: string;
    readonly actual: string;
    readonly evidencePayload: GovernanceValidationFinding["evidence"];
  }): GovernanceValidationFinding {
    const componentId = typeof input.component === "string" ? input.component : input.component.id;

    return {
      id: `${input.evidence.execution.runId}:core.${input.policy}:${componentId}`.replace(/[^a-zA-Z0-9_.:-]/g, "-"),
      policy: input.policy,
      severity: input.severity,
      route: input.evidence.route.resolvedUrl,
      component: componentId,
      evidence: input.evidencePayload,
      expected: input.expected,
      actual: input.actual,
      confidence: 1,
    };
  }
}
