import { describe, expect, it } from "vitest";
import { runtimeEvidenceSchema } from "../../src/shared/schemas/runtime-evidence.schema.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("RuntimeEvidence schema", () => {
  it("accepts normalized runtime evidence fixtures", () => {
    const parsed = runtimeEvidenceSchema.parse(mockRuntimeEvidence);

    expect(parsed.execution.runId).toBe("runtime_test_001");
    expect(parsed.componentInventory).toHaveLength(1);
    expect(parsed.confidence.score).toBe(1);
  });

  it("rejects non-deterministic confidence values", () => {
    const invalidEvidence = {
      ...mockRuntimeEvidence,
      confidence: {
        ...mockRuntimeEvidence.confidence,
        score: 1.2,
      },
    };

    expect(() => runtimeEvidenceSchema.parse(invalidEvidence)).toThrow();
  });
});
