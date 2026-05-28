import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { FindingCluster } from "./operational-insights-report.js";

export class FindingClusteringService {
  cluster(findings: readonly VerifiedFinding[]): readonly FindingCluster[] {
    const groups = new Map<string, VerifiedFinding[]>();

    for (const finding of findings) {
      const key = [finding.severity, finding.component, finding.expected, finding.actual].join("|");
      groups.set(key, [...(groups.get(key) ?? []), finding]);
    }

    return [...groups.entries()]
      .map(([key, groupedFindings], index) => ({
        id: `cluster-${index + 1}`,
        key,
        findingIds: groupedFindings.map((finding) => finding.id),
        count: groupedFindings.length,
        severity: groupedFindings[0]?.severity ?? "info",
      }))
      .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  }
}
