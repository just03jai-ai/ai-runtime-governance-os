import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { ComponentMisuseInsight } from "./operational-insights-report.js";

export class ComponentMisuseAnalysisService {
  analyze(findings: readonly VerifiedFinding[]): readonly ComponentMisuseInsight[] {
    const groups = new Map<string, VerifiedFinding[]>();

    for (const finding of findings) {
      groups.set(finding.component, [...(groups.get(finding.component) ?? []), finding]);
    }

    return [...groups.entries()]
      .filter(([, groupedFindings]) => groupedFindings.length > 1)
      .map(([component, groupedFindings]) => ({
        component,
        occurrenceCount: groupedFindings.length,
        routes: [...new Set(groupedFindings.map((finding) => finding.route))].sort(),
      }))
      .sort((left, right) => right.occurrenceCount - left.occurrenceCount || left.component.localeCompare(right.component));
  }
}
