import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { RuntimePipelineStageMetric } from "../../orchestration/runtime-pipeline-orchestrator.js";
import type { RuntimeEvidenceScreenshot } from "../../shared/types/runtime-evidence.js";
import type { OperationalDashboardModel } from "./operational-dashboard.js";

export class OperationalDashboardHtmlRenderer {
  render(model: OperationalDashboardModel): string {
    const decision = releaseDecision(model);
    const reliability = executionReliability(model.executionMetrics);
    const confidence = Math.max(45, Math.min(96, Math.round(model.governanceScore * 0.55 + reliability * 0.45)));

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Runtime Governance OS Dashboard</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --nav: #0f1b2a;
      --nav-soft: #13263a;
      --panel: #ffffff;
      --panel-soft: #f9fbfd;
      --border: #dce3ec;
      --text: #111827;
      --muted: #64748b;
      --critical: #dc2626;
      --warning: #d97706;
      --info: #2563eb;
      --ok: #0f766e;
      --accent: #0f766e;
      --shadow: 0 14px 36px rgba(15, 23, 42, .08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.45; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 20px; line-height: 1.2; letter-spacing: 0; }
    h2 { font-size: 15px; letter-spacing: 0; }
    h3 { font-size: 13px; letter-spacing: 0; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; word-break: break-word; }
    .shell { display: grid; grid-template-columns: 232px minmax(0, 1fr); min-height: 100vh; }
    .sidebar { display: grid; grid-template-rows: auto 1fr auto; gap: 22px; padding: 22px 16px; background: var(--nav); color: #f8fafc; }
    .brand { display: flex; align-items: center; gap: 11px; font-weight: 800; }
    .brand-mark { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 8px; background: var(--accent); color: #fff; }
    .nav { display: grid; align-content: start; gap: 6px; }
    .nav-item { display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 9px 10px; border-radius: 8px; color: #cbd5e1; font-size: 14px; font-weight: 650; }
    .nav-item.active { background: var(--nav-soft); color: #fff; }
    .nav-icon { display: grid; width: 22px; height: 22px; place-items: center; border: 1px solid rgba(255,255,255,.18); border-radius: 6px; font-size: 11px; font-weight: 800; }
    .profile { display: grid; gap: 4px; padding: 12px; border: 1px solid rgba(255,255,255,.15); border-radius: 8px; background: rgba(255,255,255,.04); font-size: 13px; }
    .profile span, .subtle { color: var(--muted); font-size: 13px; }
    main { min-width: 0; padding: 24px; }
    .topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
    .status, .badge { display: inline-flex; align-items: center; min-height: 24px; padding: 4px 8px; border: 1px solid currentColor; border-radius: 999px; font-size: 12px; font-weight: 800; white-space: nowrap; }
    .status { min-height: 28px; padding: 5px 10px; }
    .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 1px 2px rgba(15, 23, 42, .04); }
    .audit-panel { display: grid; gap: 8px; padding: 16px; margin-bottom: 16px; box-shadow: var(--shadow); }
    .dashboard { display: grid; gap: 16px; }
    .summary-grid { display: grid; grid-template-columns: 1.15fr repeat(3, minmax(0, 1fr)); gap: 14px; }
    .metric { display: grid; gap: 12px; min-height: 142px; padding: 18px; align-content: space-between; }
    .metric-label { display: flex; align-items: center; justify-content: space-between; gap: 12px; color: #334155; font-size: 13px; font-weight: 800; }
    .metric-value { font-size: 34px; line-height: 1; font-weight: 850; }
    .decision { display: flex; align-items: center; gap: 12px; }
    .decision-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 50%; background: #fee2e2; color: var(--critical); font-size: 22px; font-weight: 900; }
    .ok { color: var(--ok); }
    .warning { color: var(--warning); }
    .critical { color: var(--critical); }
    .info { color: var(--info); }
    .layout { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(320px, .95fr); gap: 16px; }
    .wide { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, .8fr); gap: 16px; }
    .section { padding: 17px; }
    .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 11px 10px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: middle; }
    th { color: #475569; font-size: 11px; font-weight: 850; text-transform: uppercase; }
    tr:last-child td { border-bottom: 0; }
    .list { display: grid; gap: 10px; }
    .item { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-soft); }
    .evidence-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 11px 0; border-bottom: 1px solid var(--border); }
    .evidence-row:last-child { border-bottom: 0; }
    .mini-icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 7px; background: #ecfdf5; color: var(--ok); font-size: 12px; font-weight: 900; }
    .screenshots { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .screenshot { overflow: hidden; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-soft); }
    .screenshot img { display: block; width: 100%; max-height: 220px; object-fit: contain; background: #fff; border-bottom: 1px solid var(--border); }
    .screenshot div { padding: 10px; }
    .pipeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 10px; }
    .stage { display: grid; gap: 8px; min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-soft); }
    .stage-index { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 50%; background: var(--accent); color: #fff; font-size: 12px; font-weight: 900; }
    .skills-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .skill-card { display: grid; gap: 10px; min-height: 150px; padding: 14px; border: 1px solid var(--border); border-radius: 8px; background: var(--panel-soft); }
    .skill-card h3 { font-size: 14px; }
    .skill-list { display: flex; flex-wrap: wrap; gap: 7px; }
    .skill-chip { display: inline-flex; align-items: center; min-height: 24px; padding: 4px 7px; border: 1px solid #cbd5e1; border-radius: 7px; background: #fff; color: #334155; font-size: 11px; font-weight: 750; }
    .empty { padding: 12px; border: 1px dashed var(--border); border-radius: 8px; color: var(--muted); font-size: 13px; }
    @media (max-width: 1080px) {
      .shell { grid-template-columns: 1fr; }
      .sidebar { display: none; }
      .summary-grid, .layout, .wide, .pipeline, .skills-grid { grid-template-columns: 1fr; }
      main { padding: 18px; }
      .topbar { display: grid; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <aside class="sidebar" aria-label="Dashboard navigation">
      <div class="brand"><span class="brand-mark">G</span><div><div>AI Runtime</div><div>Governance OS</div></div></div>
      <nav class="nav">
        <div class="nav-item active"><span class="nav-icon">O</span>Overview</div>
        <div class="nav-item"><span class="nav-icon">E</span>Evidence</div>
        <div class="nav-item"><span class="nav-icon">R</span>Routes</div>
        <div class="nav-item"><span class="nav-icon">C</span>Components</div>
        <div class="nav-item"><span class="nav-icon">S</span>Skills</div>
        <div class="nav-item"><span class="nav-icon">G</span>Release Gate</div>
      </nav>
      <div class="profile"><strong>Generated report</strong><span>${this.escape(model.generatedAt)}</span></div>
    </aside>
    <main>
      <header class="topbar">
        <div>
          <h1>AI Runtime Governance OS Dashboard</h1>
          <p class="subtle">Generated from verified runtime governance evidence.</p>
        </div>
        <span class="status ${decision.className}">${decision.label}</span>
      </header>

      <section class="panel audit-panel">
        <h2>Audit Target</h2>
        <code>${this.escape(model.routeSummaries[0]?.route ?? "No route supplied")}</code>
      </section>

      <section class="dashboard">
        <div class="summary-grid">
          <article class="panel metric">
            <div class="metric-label">Release Readiness <span class="badge ${decision.className}">${decision.label}</span></div>
            <div class="decision"><span class="decision-mark ${decision.className}">${decision.symbol}</span><strong class="metric-value ${decision.className}">${decision.title}</strong></div>
            <p class="subtle">${model.severitySummary.critical} critical blocker(s), ${model.severitySummary.total} active finding(s).</p>
          </article>
          <article class="panel metric"><div class="metric-label">Governance Score</div><strong class="metric-value ${scoreClass(model.governanceScore)}">${model.governanceScore}</strong><p class="subtle">${model.severitySummary.total} active finding(s)</p></article>
          <article class="panel metric"><div class="metric-label">Execution Reliability</div><strong class="metric-value ${scoreClass(reliability)}">${reliability}%</strong><p class="subtle">${model.executionMetrics.filter((metric) => metric.status === "passed").length}/${model.executionMetrics.length} stages passed</p></article>
          <article class="panel metric"><div class="metric-label">Evidence Confidence</div><strong class="metric-value ${scoreClass(confidence)}">${confidence}</strong><p class="subtle">Verification and evidence quality signal.</p></article>
        </div>

        <div class="layout">
          <section class="panel section">
            <div class="section-head"><div><h2>Top Prioritized Remediation</h2><p class="subtle">Highest-value fixes before release.</p></div><span class="badge critical">${model.severitySummary.critical} critical</span></div>
            ${this.remediationTable(model)}
          </section>
          <section class="panel section">
            <div class="section-head"><div><h2>Evidence Snapshot</h2><p class="subtle">Useful signals only.</p></div></div>
            ${this.evidenceList(model)}
          </section>
        </div>

        <div class="wide">
          <section class="panel section">
            <div class="section-head"><div><h2>Route Health</h2><p class="subtle">Current route governance density.</p></div></div>
            ${this.routeTable(model.routeSummaries)}
          </section>
          <section class="panel section">
            <div class="section-head"><div><h2>Governance Pipeline</h2><p class="subtle">Execution stages from capture to report.</p></div></div>
            ${this.pipeline(model.executionMetrics)}
          </section>
        </div>

        <section class="panel section">
          <div class="section-head"><div><h2>Screenshot Evidence</h2><p class="subtle">Captured runtime state for review.</p></div></div>
          ${this.screenshotGrid(model.screenshots)}
        </section>

        <section class="panel section">
          <div class="section-head"><div><h2>Recurring Patterns</h2><p class="subtle">Operational intelligence from verified findings.</p></div></div>
          ${this.patternList(model)}
        </section>

        ${this.systemSkillsSection()}
      </section>
    </main>
  </div>
</body>
</html>
`;
  }

  private remediationTable(model: OperationalDashboardModel): string {
    const findings = [...model.criticalFindings, ...model.warningFindings, ...model.infoFindings].slice(0, 5);

    if (findings.length === 0) {
      return `<div class="empty">No remediation items for this run.</div>`;
    }

    return `<table><thead><tr><th>Priority</th><th>Finding</th><th>Area</th><th>Impact</th></tr></thead><tbody>${findings
      .map((finding, index) => {
        const priority = finding.severity === "critical" ? "P0" : finding.severity === "warning" ? "P1" : "P2";
        return `<tr><td><span class="badge ${this.classForSeverity(finding.severity)}">${priority}</span></td><td><strong>${this.escape(finding.expected)}</strong><p class="subtle">${this.escape(finding.actual)}</p></td><td>${this.escape(this.componentDisplayName(finding))}</td><td>-${Math.max(4, 14 - index * 2)}</td></tr>`;
      })
      .join("")}</tbody></table>`;
  }

  private evidenceList(model: OperationalDashboardModel): string {
    const items = [
      ["F", "Verified findings", `${model.severitySummary.total} active`, "Found"],
      ["S", "Screenshots", `${model.screenshots.length} captured`, model.screenshots.length > 0 ? "Found" : "Missing"],
      ["R", "Routes", `${model.routeSummaries.length} route(s)`, "Found"],
      ["P", "Pipeline metrics", `${model.executionMetrics.length} stage(s)`, model.executionMetrics.length > 0 ? "Found" : "Missing"],
    ];

    return `<div>${items
      .map(
        ([icon, label, detail, status]) =>
          `<div class="evidence-row"><span class="mini-icon">${icon}</span><div><strong>${label}</strong><p class="subtle">${detail}</p></div><span class="badge ${status === "Missing" ? "warning" : "ok"}">${status}</span></div>`,
      )
      .join("")}</div>`;
  }

  private routeTable(routes: OperationalDashboardModel["routeSummaries"]): string {
    if (routes.length === 0) {
      return `<div class="empty">No route findings.</div>`;
    }

    return `<table><thead><tr><th>Route</th><th>Total</th><th>Critical</th><th>Warning</th><th>Info</th></tr></thead><tbody>${routes
      .map(
        (route) =>
          `<tr><td><code>${this.escape(route.route)}</code></td><td>${route.findingCount}</td><td class="critical">${route.criticalCount}</td><td class="warning">${route.warningCount}</td><td class="info">${route.infoCount}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  }

  private pipeline(metrics: readonly RuntimePipelineStageMetric[]): string {
    if (metrics.length === 0) {
      return `<div class="empty">No pipeline metrics supplied.</div>`;
    }

    return `<div class="pipeline">${metrics
      .map(
        (metric, index) =>
          `<div class="stage"><span class="stage-index">${index + 1}</span><strong>${this.escape(metric.stage)}</strong><p class="subtle">${this.escape(metric.status)} - ${metric.durationMs}ms</p></div>`,
      )
      .join("")}</div>`;
  }

  private screenshotGrid(screenshots: readonly RuntimeEvidenceScreenshot[]): string {
    if (screenshots.length === 0) {
      return `<div class="empty">No screenshots supplied.</div>`;
    }

    return `<div class="screenshots">${screenshots
      .map(
        (screenshot) =>
          `<article class="screenshot"><img src="${this.escape(screenshot.path)}" alt="${this.escape(screenshot.id)} screenshot evidence"><div><strong>${this.escape(screenshot.id)}</strong><p class="subtle">${screenshot.viewport.width}x${screenshot.viewport.height} - ${this.escape(screenshot.capturedAt)}</p><p><code>${this.escape(screenshot.path)}</code></p></div></article>`,
      )
      .join("")}</div>`;
  }

  private patternList(model: OperationalDashboardModel): string {
    const patterns = model.insights.recurringPatterns;
    const rootCauses = model.insights.rootCauseSummaries;

    if (patterns.length === 0 && rootCauses.length === 0) {
      return `<div class="empty">No analyzer insights supplied.</div>`;
    }

    return `<div class="list">${[
      ...patterns.map(
        (pattern) =>
          `<div class="item"><strong>${this.escape(pattern.category)}</strong><p>${this.escape(pattern.summary)}</p><p class="subtle">${pattern.findingCount} finding(s), confidence ${pattern.confidence}</p></div>`,
      ),
      ...rootCauses.map(
        (rootCause) =>
          `<div class="item"><strong>${this.escape(rootCause.id)}</strong><p>${this.escape(rootCause.summary)}</p><p class="subtle">${rootCause.supportingFindingIds.length} supporting finding(s), confidence ${rootCause.confidence}</p></div>`,
      ),
    ].join("")}</div>`;
  }

  private systemSkillsSection(): string {
    return `<section class="panel section">
      <div class="section-head">
        <div>
          <h2>System Skills</h2>
          <p class="subtle">Current production capabilities available in AI Runtime Governance OS.</p>
        </div>
        <span class="badge ok">Capability map</span>
      </div>
      <div class="skills-grid">
        ${this.skillCard(
          "Runtime Governance",
          "Capture, normalize, validate, verify, and score runtime UI evidence.",
          ["ExecutionAgent", "GovernanceAgent", "VerifierAgent", "AnalyzerAgent"],
        )}
        ${this.skillCard(
          "Operational Intelligence",
          "Turn findings and history into monitoring, drift, readiness, and release insight.",
          ["MemoryAgent", "MonitoringAgent", "Release Comparison", "Drift Intelligence"],
        )}
        ${this.skillCard(
          "Design & Quality Review",
          "Analyze design-system adoption, implementation risks, UX consistency, and test gaps.",
          ["DesignerAgent", "FrontendAgent", "TesterAgent", "Registry Contracts"],
        )}
        ${this.skillCard(
          "Planning & Remediation",
          "Rank fixes, explain root causes, recommend remediation, and forecast release impact.",
          ["Root Cause", "Prioritization", "Remediation", "SimulationAgent", "PMAgent", "PlannerAgent"],
        )}
      </div>
    </section>`;
  }

  private skillCard(title: string, description: string, skills: readonly string[]): string {
    return `<article class="skill-card">
      <h3>${this.escape(title)}</h3>
      <p class="subtle">${this.escape(description)}</p>
      <div class="skill-list">${skills.map((skill) => `<span class="skill-chip">${this.escape(skill)}</span>`).join("")}</div>
    </article>`;
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

  private classForSeverity(severity: VerifiedFinding["severity"]): string {
    return severity === "critical" ? "critical" : severity === "warning" ? "warning" : "info";
  }

  private escape(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
}

function releaseDecision(model: OperationalDashboardModel): {
  readonly label: string;
  readonly title: string;
  readonly symbol: string;
  readonly className: string;
} {
  if (model.severitySummary.critical > 0 || model.governanceScore < 50) {
    return { label: "Release blocked", title: "No-go", symbol: "!", className: "critical" };
  }

  if (model.governanceScore < 75 || model.severitySummary.warning > 0) {
    return { label: "Conditional release", title: "Conditional", symbol: "•", className: "warning" };
  }

  return { label: "Release ready", title: "Go", symbol: "✓", className: "ok" };
}

function executionReliability(metrics: readonly RuntimePipelineStageMetric[]): number {
  if (metrics.length === 0) {
    return 0;
  }

  const passed = metrics.filter((metric) => metric.status === "passed").length;
  return Math.round((passed / metrics.length) * 100);
}

function scoreClass(score: number): string {
  return score >= 80 ? "ok" : score >= 60 ? "warning" : "critical";
}
