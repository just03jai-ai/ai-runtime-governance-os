import { describe, expect, it } from "vitest";
import { VerifierConfidenceEngine } from "../../src/agents/verifier/verifier-confidence-engine.js";
import { governanceFindingFixture } from "../fixtures/findings.fixture.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

describe("verifier confidence scoring", () => {
  it("keeps fully backed evidence at the original confidence", () => {
    const score = new VerifierConfidenceEngine().score({
      finding: governanceFindingFixture,
      evidence: mockRuntimeEvidence,
      duplicateCount: 1,
      integrity: {
        hasComponentEvidence: true,
        hasDomEvidence: true,
        hasScreenshotEvidence: true,
        routeMatches: true,
      },
    });

    expect(score).toBe(1);
  });

  it("penalizes missing evidence deterministically", () => {
    const score = new VerifierConfidenceEngine().score({
      finding: governanceFindingFixture,
      duplicateCount: 2,
      integrity: {
        hasComponentEvidence: false,
        hasDomEvidence: false,
        hasScreenshotEvidence: false,
        routeMatches: false,
      },
    });

    expect(score).toBe(0.05);
  });
});
