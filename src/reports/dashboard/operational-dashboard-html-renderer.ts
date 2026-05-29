import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { RuntimePipelineStageMetric } from "../../orchestration/runtime-pipeline-orchestrator.js";
import type {
  ComponentMisuseInsight,
  OperationalPattern,
  RootCauseSummary,
  TokenDriftInsight,
} from "../../shared/types/operational-insights-report.js";
import type { RuntimeEvidenceScreenshot } from "../../shared/types/runtime-evidence.js";
import type { OperationalDashboardModel } from "./operational-dashboard.js";

export class OperationalDashboardHtmlRenderer {
  render(model: OperationalDashboardModel): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Runtime Governance OS Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7fa;
      --panel: #ffffff;
      --border: #d9e0e8;
      --text: #18212f;
      --muted: #5d6b7c;
      --critical: #b42318;
      --warning: #9a6700;
      --info: #175cd3;
      --ok: #067647;
    }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: var(--bg); color: var(--text); }
    main { max-width: 1280px; margin: 0 auto; padding: 28px; }
    header { margin-bottom: 22px; }
    h1 { margin: 0 0 6px; font-size: 28px; line-height: 1.2; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 18px; letter-spacing: 0; }
    h3 { margin: 0 0 8px; font-size: 15px; letter-spacing: 0; }
    p { margin: 0; }
    .subtle { color: var(--muted); font-size: 13px; }
    .grid { display: grid; gap: 16px; }
    .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .two { grid-template-columns: minmax(0, 1.15fr) minmax(0, .85fr); }
    section, .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 18px; }
    .metric { min-height: 96px; display: flex; flex-direction: column; justify-content: space-between; }
    .metric span { color: var(--muted); font-size: 13px; }
    .metric strong { font-size: 34px; line-height: 1; }
    .score strong { color: var(--ok); }
    .critical { color: var(--critical); }
    .warning { color: var(--warning); }
    .info { color: var(--info); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; }
    th { background: #eef2f6; color: #344054; font-weight: 700; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; word-break: break-word; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 999px; border: 1px solid currentColor; font-size: 12px; font-weight: 700; }
    .finding { border: 1px solid var(--border); border-radius: 8px; padding: 14px; margin-bottom: 10px; background: #fbfcfe; }
    .finding:last-child { margin-bottom: 0; }
    .finding-grid { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 8px 14px; font-size: 13px; }
    .screenshots { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
    .screenshot { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: #f8fafc; }
    .screenshot img { width: 100%; max-height: 260px; object-fit: contain; display: block; background: #fff; border-bottom: 1px solid var(--border); }
    .screenshot div { padding: 10px; }
    .list { display: grid; gap: 10px; }
    .list-item { padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: #fbfcfe; }
    .empty { color: var(--muted); padding: 12px; background: #fbfcfe; border: 1px dashed var(--border); border-radius: 8px; }
    @media (max-width: 900px) {
      main { padding: 18px; }
      .metrics, .two { grid-template-columns: 1fr; }
      .finding-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>AI Runtime Governance OS Dashboard</h1>
      <p class="subtle">Generated ${this.escape(model.generatedAt)} from verified runtime governance evidence.</p>
    </header>

    <section class="grid metrics">
      <div class="metric score"><span>Governance Score</span><strong>${model.governanceScore}</strong></div>
      <div class="metric"><span>Critical Findings</span><strong class="critical">${model.severitySummary.critical}</strong></div>
      <div class="metric"><span>Warning Findings</span><strong class="warning">${model.severitySummary.warning}</strong></div>
      <div class="metric"><span>Total Active Findings</span><strong>${model.severitySummary.total}</strong></div>
    </section>

    <div class="grid two" style="margin-top: 16px;">
      <section>
        <h2>Route Summaries</h2>
        ${this.routeTable(model.routeSummaries)}
      </section>
      <section>
        <h2>Execution Metrics</h2>
        ${this.metricsTable(model.executionMetrics)}
      </section>
    </div>

    <section style="margin-top: 16px;">
      <h2>Critical Findings</h2>
      ${this.findingList(model.criticalFindings)}
    </section>

    <section style="margin-top: 16px;">
      <h2>Warning Findings</h2>
      ${this.findingList(model.warningFindings)}
    </section>

    <section style="margin-top: 16px;">
      <h2>Minor Findings</h2>
      ${this.findingList(model.infoFindings)}
    </section>

    <section style="margin-top: 16px;">
      <h2>Screenshot Evidence</h2>
      ${this.screenshotGrid(model.screenshots)}
    </section>

    <div class="grid two" style="margin-top: 16px;">
      <section>
        <h2>Recurring Patterns</h2>
        ${this.patternList(model.insights.recurringPatterns)}
      </section>
      <section>
        <h2>Root Cause Summaries</h2>
        ${this.rootCauseList(model.insights.rootCauseSummaries)}
      </section>
    </div>

    <div class="grid two" style="margin-top: 16px;">
      <section>
        <h2>Token Drift</h2>
        ${this.tokenDriftList(model.insights.tokenDrift)}
      </section>
      <section>
        <h2>Component Misuse</h2>
        ${this.componentMisuseList(model.insights.componentMisuse)}
      </section>
    </div>
  </main>
</body>
</html>
`;
  }

  private routeTable(routes: OperationalDashboardModel["routeSummaries"]): string {
    if (routes.length === 0) {
      return `<div class="empty">No route findings.</div>`;
    }

    return `<table>
      <thead><tr><th>Route</th><th>Total</th><th>Critical</th><th>Warning</th><th>Info</th></tr></thead>
      <tbody>${routes
        .map(
          (route) =>
            `<tr><td><code>${this.escape(route.route)}</code></td><td>${route.findingCount}</td><td class="critical">${route.criticalCount}</td><td class="warning">${route.warningCount}</td><td class="info">${route.infoCount}</td></tr>`,
        )
        .join("")}</tbody>
    </table>`;
  }

  private metricsTable(metrics: readonly RuntimePipelineStageMetric[]): string {
    if (metrics.length === 0) {
      return `<div class="empty">No pipeline metrics supplied.</div>`;
    }

    return `<table>
      <thead><tr><th>Stage</th><th>Status</th><th>Duration</th><th>Attempts</th></tr></thead>
      <tbody>${metrics
        .map(
          (metric) =>
            `<tr><td>${this.escape(metric.stage)}</td><td>${this.escape(metric.status)}</td><td>${metric.durationMs}ms</td><td>${metric.attempts}</td></tr>`,
        )
        .join("")}</tbody>
    </table>`;
  }

  private findingList(findings: readonly VerifiedFinding[]): string {
    if (findings.length === 0) {
      return `<div class="empty">No findings in this severity group.</div>`;
    }

    return findings.map((finding) => this.findingCard(finding)).join("");
  }

  private findingCard(finding: VerifiedFinding): string {
    const componentName = this.componentDisplayName(finding);

    return `<article class="finding">
      <h3><span class="badge ${this.escape(finding.severity)}">${this.escape(finding.severity)}</span> ${this.escape(finding.id)}</h3>
      <div class="finding-grid">
        <div class="subtle">Status</div><div>${this.escape(finding.status)}</div>
        <div class="subtle">Route</div><div><code>${this.escape(finding.route)}</code></div>
        <div class="subtle">Component</div><div><strong>${this.escape(componentName)}</strong> <code>${this.escape(finding.component)}</code></div>
        <div class="subtle">Expected</div><div>${this.escape(finding.expected)}</div>
        <div class="subtle">Actual</div><div>${this.escape(finding.actual)}</div>
        <div class="subtle">Confidence</div><div>${finding.confidence}</div>
        <div class="subtle">Evidence</div><div><code>${this.escape(JSON.stringify(finding.evidence))}</code></div>
      </div>
    </article>`;
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

  private screenshotGrid(screenshots: readonly RuntimeEvidenceScreenshot[]): string {
    if (screenshots.length === 0) {
      return `<div class="empty">No screenshots supplied.</div>`;
    }

    return `<div class="screenshots">${screenshots.map((screenshot) => this.screenshotCard(screenshot)).join("")}</div>`;
  }

  private screenshotCard(screenshot: RuntimeEvidenceScreenshot): string {
    return `<article class="screenshot">
      <img src="${this.escape(screenshot.path)}" alt="${this.escape(screenshot.id)} screenshot evidence">
      <div>
        <strong>${this.escape(screenshot.id)}</strong>
        <p class="subtle">${screenshot.viewport.width}x${screenshot.viewport.height} - ${this.escape(screenshot.capturedAt)}</p>
        <p><code>${this.escape(screenshot.path)}</code></p>
      </div>
    </article>`;
  }

  private patternList(patterns: readonly OperationalPattern[]): string {
    return this.simpleList(
      patterns,
      (pattern) =>
        `<strong>${this.escape(pattern.category)}</strong><p>${this.escape(pattern.summary)}</p><p class="subtle">${pattern.findingCount} finding(s), confidence ${pattern.confidence}</p>`,
    );
  }

  private rootCauseList(rootCauses: readonly RootCauseSummary[]): string {
    return this.simpleList(
      rootCauses,
      (rootCause) =>
        `<strong>${this.escape(rootCause.id)}</strong><p>${this.escape(rootCause.summary)}</p><p class="subtle">${rootCause.supportingFindingIds.length} supporting finding(s), confidence ${rootCause.confidence}</p>`,
    );
  }

  private tokenDriftList(tokenDrift: readonly TokenDriftInsight[]): string {
    return this.simpleList(
      tokenDrift,
      (drift) =>
        `<strong>${this.escape(drift.tokenName)}</strong><p class="subtle">${drift.occurrenceCount} occurrence(s) across ${drift.affectedComponents.length} component(s)</p>`,
    );
  }

  private componentMisuseList(componentMisuse: readonly ComponentMisuseInsight[]): string {
    return this.simpleList(
      componentMisuse,
      (misuse) =>
        `<strong>${this.escape(misuse.component)}</strong><p class="subtle">${misuse.occurrenceCount} occurrence(s) across ${misuse.routes.length} route(s)</p>`,
    );
  }

  private simpleList<T>(items: readonly T[], renderItem: (item: T) => string): string {
    if (items.length === 0) {
      return `<div class="empty">No analyzer insights supplied.</div>`;
    }

    return `<div class="list">${items.map((item) => `<div class="list-item">${renderItem(item)}</div>`).join("")}</div>`;
  }

  private escape(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
}
