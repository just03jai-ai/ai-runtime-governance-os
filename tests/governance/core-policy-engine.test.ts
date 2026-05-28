import { describe, expect, it } from "vitest";
import { CorePolicyEngine } from "../../src/governance/policies/core/core-policy-engine.js";
import { coreGovernancePolicyPack } from "../../src/governance/policies/core/core-policy-pack.js";
import { buttonGovernanceContract } from "../fixtures/governance-contract.fixture.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("core governance policy pack", () => {
  it("declares deterministic operational policy capabilities", () => {
    expect(coreGovernancePolicyPack.map((policy) => policy.id)).toEqual([
      "token-drift",
      "forbidden-inline-style",
      "typography-mismatch",
      "invalid-component-variant",
      "accessibility-violation",
      "spacing-inconsistency",
      "unauthorized-component",
    ]);
  });

  it("generates evidence-backed findings for core policies", () => {
    const evidence = {
      ...mockRuntimeEvidence,
      componentInventory: [
        {
          ...mockRuntimeEvidence.componentInventory[0],
          attributes: {
            ...mockRuntimeEvidence.componentInventory[0]?.attributes,
            style: "margin-left: 3px",
          },
          boundingBox: {
            x: 3,
            y: 16,
            width: 121,
            height: 40,
          },
        },
        {
          id: "component-custom-widget",
          tagName: "custom-widget",
          role: null,
          label: "Widget",
          selectorHint: "custom-widget",
          visible: true,
          source: "dom" as const,
        },
      ],
    };
    const findings = new CorePolicyEngine().validate(evidence, [buttonGovernanceContract]);

    expect(findings.map((finding) => finding.policy)).toEqual([
      "token-drift",
      "forbidden-inline-style",
      "invalid-component-variant",
      "accessibility-violation",
      "spacing-inconsistency",
      "unauthorized-component",
    ]);
    expect(findings.every((finding) => finding.confidence === 1)).toBe(true);
    expect(findings.every((finding) => Object.keys(finding.evidence).length > 0)).toBe(true);
  });
});
