import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { RootCauseSummary, TokenDriftInsight, ComponentMisuseInsight } from "./operational-insights-report.js";

export class RootCauseSummaryService {
  summarize(input: {
    readonly findings: readonly VerifiedFinding[];
    readonly tokenDrift: readonly TokenDriftInsight[];
    readonly componentMisuse: readonly ComponentMisuseInsight[];
  }): readonly RootCauseSummary[] {
    const summaries: RootCauseSummary[] = [];

    for (const token of input.tokenDrift.slice(0, 3)) {
      summaries.push({
        id: `root-cause-token-${this.slug(token.tokenName)}`,
        summary: `Missing or inconsistent token evidence for ${token.tokenName} affects ${token.affectedComponents.length} component(s).`,
        supportingFindingIds: this.findSupportingIds(input.findings, token.tokenName),
        confidence: 1,
      });
    }

    for (const misuse of input.componentMisuse.slice(0, 3)) {
      summaries.push({
        id: `root-cause-component-${this.slug(misuse.component)}`,
        summary: `Component ${misuse.component} has repeated governance issues across ${misuse.routes.length} route(s).`,
        supportingFindingIds: input.findings.filter((finding) => this.componentDisplayName(finding) === misuse.component).map((finding) => finding.id),
        confidence: this.averageConfidence(input.findings.filter((finding) => this.componentDisplayName(finding) === misuse.component)),
      });
    }

    return summaries;
  }

  private findSupportingIds(findings: readonly VerifiedFinding[], tokenName: string): readonly string[] {
    return findings
      .filter((finding) => `${finding.expected} ${finding.actual}`.includes(tokenName))
      .map((finding) => finding.id);
  }

  private averageConfidence(findings: readonly VerifiedFinding[]): number {
    if (findings.length === 0) {
      return 0;
    }

    return Number((findings.reduce((total, finding) => total + finding.confidence, 0) / findings.length).toFixed(2));
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

  private slug(value: string): string {
    return value.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
  }
}
