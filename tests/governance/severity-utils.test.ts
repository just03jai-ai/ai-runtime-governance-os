import { describe, expect, it } from "vitest";
import { highestSeverity, severityWeight } from "../../src/governance/severity/severity-utils.js";

describe("severity utilities", () => {
  it("classifies the highest severity deterministically", () => {
    expect(highestSeverity(["info", "warning", "critical"])).toBe("critical");
    expect(highestSeverity(["info", "warning"])).toBe("warning");
    expect(highestSeverity(["info"])).toBe("info");
  });

  it("assigns monotonic severity weights", () => {
    expect(severityWeight("info")).toBeLessThan(severityWeight("warning"));
    expect(severityWeight("warning")).toBeLessThan(severityWeight("critical"));
  });
});
