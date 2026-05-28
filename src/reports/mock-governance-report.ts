import type { GovernanceReport } from "../contracts/evidence.js";
import type { RuntimeExecutionContext } from "../contracts/execution.js";
import type { RuntimeComponentInventory } from "../contracts/runtime.js";

export function createMockGovernanceReport(
  context: RuntimeExecutionContext,
  inventory: RuntimeComponentInventory,
): GovernanceReport {
  return {
    reportId: `report_${context.runId}`,
    runId: context.runId,
    generatedAt: new Date().toISOString(),
    status: "draft",
    summary: `Runtime evidence captured for ${inventory.components.length} UI components. Governance validation is intentionally not implemented yet.`,
    findings: [
      {
        id: "report-placeholder-001",
        severity: "info",
        title: "Governance validation pending",
        description:
          "This report is a deterministic placeholder produced from runtime evidence. No AI or policy evaluation has been executed.",
      },
    ],
  };
}
