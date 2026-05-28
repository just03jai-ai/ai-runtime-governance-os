import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { RouteCluster } from "./operational-insights-report.js";

export class RouteClusteringService {
  cluster(findings: readonly VerifiedFinding[]): readonly RouteCluster[] {
    const groups = new Map<string, VerifiedFinding[]>();

    for (const finding of findings) {
      groups.set(finding.route, [...(groups.get(finding.route) ?? []), finding]);
    }

    return [...groups.entries()]
      .map(([route, routeFindings]) => ({
        route,
        findingCount: routeFindings.length,
        criticalCount: routeFindings.filter((finding) => finding.severity === "critical").length,
        warningCount: routeFindings.filter((finding) => finding.severity === "warning").length,
        infoCount: routeFindings.filter((finding) => finding.severity === "info").length,
      }))
      .sort((left, right) => right.findingCount - left.findingCount || left.route.localeCompare(right.route));
  }
}
