import { describe, expect, it } from "vitest";
import { FindingsAggregationService } from "../../src/reports/findings/findings-aggregation.js";
import { verifiedFindingsFixture } from "../fixtures/findings.fixture.js";

describe("findings aggregation", () => {
  it("summarizes findings by report severity bucket", () => {
    const aggregation = new FindingsAggregationService();

    expect(aggregation.severitySummary(verifiedFindingsFixture)).toEqual({
      critical: 1,
      medium: 1,
      minor: 1,
      total: 3,
    });
  });

  it("creates route-level summaries sorted by finding volume", () => {
    const aggregation = new FindingsAggregationService();

    expect(aggregation.routeSummaries(verifiedFindingsFixture)).toEqual([
      {
        route: "https://example.test/checkout",
        findingCount: 2,
        criticalCount: 1,
        mediumCount: 1,
        minorCount: 0,
      },
      {
        route: "https://example.test/cart",
        findingCount: 1,
        criticalCount: 0,
        mediumCount: 0,
        minorCount: 1,
      },
    ]);
  });
});
