import { describe, expect, it } from "vitest";
import { governanceContractSchema } from "../../src/governance/contracts/governance-contract.schema.js";
import { GovernanceValidationEngine } from "../../src/governance/validation/governance-validation-engine.js";
import { buttonGovernanceContract } from "../fixtures/governance-contract.fixture.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";
import { governanceFindingsSnapshot } from "../snapshots/governance-findings.snapshot.js";

describe("governance validation", () => {
  it("validates governance contracts with zod", () => {
    const parsed = governanceContractSchema.parse(buttonGovernanceContract);

    expect(parsed.contractId).toBe("Button");
    expect(parsed.allowedComponents).toHaveLength(1);
  });

  it("returns stable findings for runtime evidence", () => {
    const result = new GovernanceValidationEngine().validate(mockRuntimeEvidence, [buttonGovernanceContract]);

    expect(result.findingCount).toBe(5);
    expect(
      result.findings.map((finding) => ({
        actual: finding.actual,
        component: finding.component,
        expected: finding.expected,
        policy: finding.policy,
        severity: finding.severity,
      })),
    ).toEqual(governanceFindingsSnapshot);
  });
});
