import type { OperationalIntelligenceReport } from "./operational-intelligence-report.js";

export class OperationalIntelligenceHtmlRenderer {
  render(report: OperationalIntelligenceReport): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Operational Intelligence Report</title>
  <style>
    :root { --bg:#f6f8fb; --panel:#fff; --border:#d8dee7; --text:#172033; --muted:#667085; --critical:#b42318; --warning:#a15c07; --ok:#067647; --info:#175cd3; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.45; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 28px; }
    h2 { margin-bottom: 14px; font-size: 17px; }
    h3 { font-size: 14px; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; word-break: break-word; }
    header { display: flex; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
    section, .card { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
    .subtle { color: var(--muted); font-size: 13px; }
    .grid { display: grid; gap: 14px; }
    .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 14px; }
    .two { grid-template-columns: minmax(0, 1fr) minmax(320px, .8fr); margin-top: 14px; }
    .metric { min-height: 116px; display: flex; flex-direction: column; justify-content: space-between; }
    .metric span { color: var(--muted); font-size: 13px; }
    .metric strong { font-size: 32px; line-height: 1; }
    .critical { color: var(--critical); } .warning { color: var(--warning); } .ok { color: var(--ok); } .info { color: var(--info); }
    .pill { display: inline-flex; width: fit-content; min-height: 26px; align-items: center; padding: 4px 9px; border: 1px solid currentColor; border-radius: 999px; font-size: 12px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { color: #344054; font-size: 12px; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    .list { display: grid; gap: 10px; }
    .item { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: #fbfcfe; }
    .empty { padding: 12px; border: 1px dashed var(--border); border-radius: 8px; color: var(--muted); }
    @media (max-width: 900px) { main { padding: 18px; } header, .metrics, .two { grid-template-columns: 1fr; display: grid; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Operational Intelligence Report</h1>
        <p class="subtle">Generated ${this.escape(report.generatedAt)}</p>
      </div>
      <span class="pill ${this.riskClass(report.operationalOverview.releaseRisk)}">Release risk: ${this.escape(report.operationalOverview.releaseRisk)}</span>
    </header>

    <section class="grid metrics">
      <div class="card metric"><span>Governance Quality</span><strong>${report.operationalOverview.governanceQualityScore ?? "n/a"}</strong></div>
      <div class="card metric"><span>Active Findings</span><strong class="warning">${report.operationalOverview.activeFindingCount}</strong></div>
      <div class="card metric"><span>Routes</span><strong>${report.operationalOverview.routeCount}</strong></div>
      <div class="card metric"><span>Executions</span><strong>${report.operationalOverview.monitoredExecutionCount}</strong></div>
    </section>

    <div class="grid two">
      <section>
        <h2>Governance Trends</h2>
        ${this.trendTable(report)}
      </section>
      <section>
        <h2>Release Risk Indicators</h2>
        ${this.list(report.operationalOverview.releaseRiskIndicators)}
      </section>
    </div>

    <div class="grid two">
      <section>
        <h2>Recurring Violations</h2>
        ${this.recurringTable(report)}
      </section>
      <section>
        <h2>Accessibility Health</h2>
        ${this.accessibility(report)}
      </section>
    </div>

    <section style="margin-top: 14px;">
      <h2>Route Health</h2>
      ${this.routeHealth(report)}
    </section>

    <div class="grid two">
      <section>
        <h2>Component Stability</h2>
        ${this.componentStability(report)}
      </section>
      <section>
        <h2>Drift Analysis</h2>
        ${this.drift(report)}
      </section>
    </div>
  </main>
</body>
</html>`;
  }

  private trendTable(report: OperationalIntelligenceReport): string {
    return `<table><tbody>
      <tr><th>Direction</th><td>${this.escape(report.governanceTrends.direction)}</td></tr>
      <tr><th>Current</th><td>${report.governanceTrends.currentScore ?? "n/a"}</td></tr>
      <tr><th>Previous</th><td>${report.governanceTrends.previousScore ?? "n/a"}</td></tr>
      <tr><th>Delta</th><td>${report.governanceTrends.delta ?? "n/a"}</td></tr>
      <tr><th>Average</th><td>${report.governanceTrends.averageScore ?? "n/a"}</td></tr>
    </tbody></table>`;
  }

  private recurringTable(report: OperationalIntelligenceReport): string {
    if (report.recurringViolations.topRecurringViolations.length === 0) return `<div class="empty">No recurring violations.</div>`;
    return `<table><thead><tr><th>Component</th><th>Severity</th><th>Occurrences</th><th>Route</th></tr></thead><tbody>${report.recurringViolations.topRecurringViolations
      .map((violation) => `<tr><td>${this.escape(violation.component)}</td><td>${this.escape(violation.severity)}</td><td>${violation.occurrenceCount}</td><td><code>${this.escape(violation.route)}</code></td></tr>`)
      .join("")}</tbody></table>`;
  }

  private routeHealth(report: OperationalIntelligenceReport): string {
    if (report.routeHealth.length === 0) return `<div class="empty">No route health data.</div>`;
    return `<table><thead><tr><th>Route</th><th>Status</th><th>Health</th><th>Findings</th><th>Drift</th></tr></thead><tbody>${report.routeHealth
      .map((route) => `<tr><td><code>${this.escape(route.route)}</code></td><td>${this.escape(route.status)}</td><td>${route.healthScore}</td><td>${route.activeFindingCount}</td><td>${route.driftScore ?? "n/a"}</td></tr>`)
      .join("")}</tbody></table>`;
  }

  private accessibility(report: OperationalIntelligenceReport): string {
    return `<div class="list">
      <div class="item"><strong>${report.accessibilityHealth.violationCount}</strong><p class="subtle">accessibility violation(s)</p></div>
      <div class="item"><strong>${report.accessibilityHealth.affectedComponents.length}</strong><p class="subtle">affected component(s)</p></div>
      <div class="item"><strong>${report.accessibilityHealth.trendDirection ?? "n/a"}</strong><p class="subtle">trend direction</p></div>
    </div>`;
  }

  private componentStability(report: OperationalIntelligenceReport): string {
    if (report.componentStability.components.length === 0) return `<div class="empty">No unstable components.</div>`;
    return `<table><thead><tr><th>Component</th><th>Occurrences</th><th>Runs</th><th>Severity</th></tr></thead><tbody>${report.componentStability.components
      .map((component) => `<tr><td>${this.escape(component.component)}</td><td>${component.occurrenceCount}</td><td>${component.affectedRunCount}</td><td>${this.escape(component.highestSeverity)}</td></tr>`)
      .join("")}</tbody></table>`;
  }

  private drift(report: OperationalIntelligenceReport): string {
    return `<div class="list">
      <div class="item"><strong>${report.driftAnalysis.overallDriftScore ?? "n/a"}</strong><p class="subtle">overall drift score</p></div>
      <div class="item"><strong>${report.driftAnalysis.governanceScoreDegradationAmount}</strong><p class="subtle">score degradation amount</p></div>
      ${this.list(report.driftAnalysis.driftSummaries)}
    </div>`;
  }

  private list(items: readonly string[]): string {
    if (items.length === 0) return `<div class="empty">No indicators.</div>`;
    return `<div class="list">${items.map((item) => `<div class="item">${this.escape(item)}</div>`).join("")}</div>`;
  }

  private riskClass(risk: string): string {
    return risk === "critical" ? "critical" : risk === "high" || risk === "medium" ? "warning" : "ok";
  }

  private escape(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }
}
