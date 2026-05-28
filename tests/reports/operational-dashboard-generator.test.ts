import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildOperationalDashboardModel } from "../../src/reports/dashboard/operational-dashboard.js";
import { OperationalDashboardGenerator } from "../../src/reports/dashboard/operational-dashboard-generator.js";
import type { OperationalInsightsReport } from "../../src/shared/types/operational-insights-report.js";
import { verifiedFindingsFixture } from "../fixtures/findings.fixture.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

const insightsFixture: OperationalInsightsReport = {
  reportId: "operational-insights:test",
  generatedAt: "2026-05-28T00:00:04.000Z",
  findingCount: 3,
  clusters: [
    {
      id: "cluster-accessibility",
      key: "accessibility",
      findingIds: ["verified-critical"],
      count: 1,
      severity: "critical",
    },
  ],
  routeClusters: [
    {
      route: "https://example.test/checkout",
      findingCount: 2,
      criticalCount: 1,
      warningCount: 1,
      infoCount: 0,
    },
  ],
  recurringPatterns: [
    {
      id: "pattern-accessibility",
      category: "accessibility",
      summary: "Accessible labels are missing on checkout controls.",
      findingCount: 1,
      confidence: 0.95,
    },
  ],
  tokenDrift: [
    {
      tokenName: "color.action.primary",
      occurrenceCount: 1,
      affectedComponents: ["component-button-primary"],
    },
  ],
  componentMisuse: [
    {
      component: "component-button-primary",
      occurrenceCount: 2,
      routes: ["https://example.test/checkout"],
    },
  ],
  rootCauseSummaries: [
    {
      id: "root-cause-accessibility",
      summary: "Checkout button evidence lacks an accessible label.",
      supportingFindingIds: ["verified-critical"],
      confidence: 0.9,
    },
  ],
};

describe("OperationalDashboardGenerator", () => {
  it("builds route, severity, and score summaries from verified findings", () => {
    const model = buildOperationalDashboardModel({
      findings: verifiedFindingsFixture,
      insights: insightsFixture,
      screenshots: mockRuntimeEvidence.screenshots,
      generatedAt: "2026-05-28T00:00:05.000Z",
    });

    expect(model.severitySummary).toEqual({
      critical: 1,
      warning: 1,
      info: 1,
      total: 3,
    });
    expect(model.routeSummaries[0]).toMatchObject({
      route: "https://example.test/checkout",
      findingCount: 2,
    });
    expect(model.governanceScore).toBe(77);
  });

  it("writes a static dashboard index.html", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "runtime-governance-dashboard-"));
    const outputPath = await new OperationalDashboardGenerator(undefined, { outputDirectory }).generate({
      findings: verifiedFindingsFixture,
      insights: insightsFixture,
      screenshots: mockRuntimeEvidence.screenshots,
      executionMetrics: [
        {
          stage: "execution",
          status: "passed",
          startedAt: "2026-05-28T00:00:00.000Z",
          completedAt: "2026-05-28T00:00:01.000Z",
          durationMs: 100,
          attempts: 1,
        },
      ],
      generatedAt: "2026-05-28T00:00:05.000Z",
    });
    const html = await readFile(outputPath, "utf8");

    expect(outputPath.endsWith("index.html")).toBe(true);
    expect(html).toContain("AI Runtime Governance OS Dashboard");
    expect(html).toContain("Governance Score");
    expect(html).toContain("Screenshot Evidence");
    expect(html).toContain("Accessible labels are missing on checkout controls.");
  });
});
