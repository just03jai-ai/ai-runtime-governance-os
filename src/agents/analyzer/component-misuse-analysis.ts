import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { ComponentMisuseInsight } from "./operational-insights-report.js";

export class ComponentMisuseAnalysisService {
  analyze(findings: readonly VerifiedFinding[]): readonly ComponentMisuseInsight[] {
    const groups = new Map<string, VerifiedFinding[]>();

    for (const finding of findings) {
      const componentName = this.componentDisplayName(finding);
      groups.set(componentName, [...(groups.get(componentName) ?? []), finding]);
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

  private componentDisplayName(finding: VerifiedFinding): string {
    const componentName = finding.evidence.componentName;

    if (typeof componentName === "string" && componentName.trim().length > 0) {
      return componentName;
    }

    const componentNameMap: Readonly<Record<string, string>> = {
      Input: "TextField",
      TextInput: "TextField",
      Typography: "Text",
    };

    return componentNameMap[finding.component] ?? finding.component;
  }
}
