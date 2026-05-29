import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { FindingsReport } from "./findings-report.js";

export class FindingsHtmlReporter {
  render(report: FindingsReport): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Runtime Governance OS Findings</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #17202a; background: #f6f8fa; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px; }
    h1, h2 { margin: 0 0 12px; }
    section { margin: 0 0 24px; padding: 20px; background: #fff; border: 1px solid #d8dee4; border-radius: 8px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; border-bottom: 1px solid #d8dee4; text-align: left; vertical-align: top; }
    th { background: #f0f3f6; }
    .summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .metric { padding: 14px; border: 1px solid #d8dee4; border-radius: 8px; background: #fbfcfd; }
    .metric strong { display: block; font-size: 24px; }
    .critical { color: #b42318; }
    .medium { color: #9a6700; }
    .minor { color: #1f6feb; }
    code { word-break: break-word; }
  </style>
</head>
<body>
  <main>
    <h1>AI Runtime Governance OS Findings</h1>
    <section>
      <h2>Execution Summary</h2>
      <p><strong>Run:</strong> ${this.escape(report.executionSummary.runId)}</p>
      <p><strong>Route:</strong> ${this.escape(report.executionSummary.route)}</p>
      <p><strong>Status:</strong> ${this.escape(report.executionSummary.executionStatus)}</p>
      <p><strong>Generated:</strong> ${this.escape(report.executionSummary.generatedAt)}</p>
    </section>
    <section>
      <h2>Governance Score</h2>
      <div class="summary">
        <div class="metric"><span>Score</span><strong>${report.governanceScore.score}</strong></div>
        <div class="metric"><span>Critical</span><strong class="critical">${report.severitySummary.critical}</strong></div>
        <div class="metric"><span>Medium</span><strong class="medium">${report.severitySummary.medium}</strong></div>
        <div class="metric"><span>Minor</span><strong class="minor">${report.severitySummary.minor}</strong></div>
      </div>
    </section>
    ${this.findingsSection("Critical Findings", report.criticalFindings)}
    ${this.findingsSection("Medium Findings", report.mediumFindings)}
    ${this.findingsSection("Minor Findings", report.minorFindings)}
    <section>
      <h2>Evidence References</h2>
      <table>
        <thead><tr><th>Finding</th><th>Component</th><th>Route</th><th>Evidence</th></tr></thead>
        <tbody>
          ${report.evidenceReferences
            .map(
              (reference) =>
                `<tr><td>${this.escape(reference.findingId)}</td><td>${this.escape(reference.component)}</td><td>${this.escape(
                  reference.route,
                )}</td><td><code>${this.escape(JSON.stringify(reference.evidence))}</code></td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>
    <section>
      <h2>Screenshots</h2>
      <ul>${report.screenshots.map((screenshot) => `<li><code>${this.escape(screenshot.path)}</code></li>`).join("")}</ul>
    </section>
    <section>
      <h2>Route Analysis</h2>
      <table>
        <thead><tr><th>Route</th><th>Total</th><th>Critical</th><th>Medium</th><th>Minor</th></tr></thead>
        <tbody>
          ${report.routeAnalysis
            .map(
              (route) =>
                `<tr><td>${this.escape(route.route)}</td><td>${route.findingCount}</td><td>${route.criticalCount}</td><td>${route.mediumCount}</td><td>${route.minorCount}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>
`;
  }

  private findingsSection(title: string, findings: readonly VerifiedFinding[]): string {
    return `<section>
      <h2>${this.escape(title)}</h2>
      <table>
        <thead><tr><th>ID</th><th>Severity</th><th>Status</th><th>Component</th><th>Expected</th><th>Actual</th><th>Confidence</th></tr></thead>
        <tbody>
          ${findings
            .map(
              (finding) =>
                `<tr><td>${this.escape(finding.id)}</td><td>${this.escape(finding.severity)}</td><td>${this.escape(
                  finding.status,
                )}</td><td>${this.escape(this.componentDisplayName(finding))}<br><code>${this.escape(finding.component)}</code></td><td>${this.escape(finding.expected)}</td><td>${this.escape(
                  finding.actual,
                )}</td><td>${finding.confidence}</td></tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </section>`;
  }

  private componentDisplayName(finding: VerifiedFinding): string {
    const componentName = finding.evidence.componentName;
    if (typeof componentName === "string" && componentName.trim().length > 0) {
      return componentName;
    }

    return this.standardComponentName(finding.component);
  }

  private standardComponentName(component: string): string {
    const componentNameMap: Readonly<Record<string, string>> = {
      Input: "TextField",
      TextInput: "TextField",
      Typography: "Text",
    };

    return componentNameMap[component] ?? component;
  }

  private escape(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
}
