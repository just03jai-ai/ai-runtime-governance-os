import type { RuntimeExecutionSummary } from "../../contracts/execution.js";

export interface DashboardRouteResponse {
  readonly route: "/dashboard/runtime";
  readonly title: string;
  readonly latestRun: RuntimeExecutionSummary | null;
}

export function runtimeDashboardRoute(latestRun: RuntimeExecutionSummary | null = null): DashboardRouteResponse {
  return {
    route: "/dashboard/runtime",
    title: "Runtime Governance Dashboard",
    latestRun,
  };
}
