import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { RuntimePipelineStageMetric } from "../../orchestration/runtime-pipeline-orchestrator.js";
import type { OperationalInsightsReport } from "../../shared/types/operational-insights-report.js";
import type { RuntimeEvidenceComponent, RuntimeEvidenceScreenshot } from "../../shared/types/runtime-evidence.js";

export interface OperationalDashboardInput {
  readonly findings: readonly VerifiedFinding[];
  readonly insights: OperationalInsightsReport;
  readonly screenshots?: readonly RuntimeEvidenceScreenshot[] | undefined;
  readonly components?: readonly RuntimeEvidenceComponent[] | undefined;
  readonly executionMetrics?: readonly RuntimePipelineStageMetric[] | undefined;
  readonly generatedAt?: string | undefined;
}

export interface DashboardSeveritySummary {
  readonly critical: number;
  readonly warning: number;
  readonly info: number;
  readonly total: number;
}

export interface DashboardRouteSummary {
  readonly route: string;
  readonly findingCount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
}

export interface DashboardComponentSummary {
  readonly componentName: string;
  readonly category: string;
  readonly source: string;
  readonly tagName: string;
  readonly role?: string | undefined;
  readonly selectorHint: string;
  readonly count: number;
  readonly visibleCount: number;
}

export interface OperationalDashboardModel {
  readonly generatedAt: string;
  readonly governanceScore: number;
  readonly severitySummary: DashboardSeveritySummary;
  readonly routeSummaries: readonly DashboardRouteSummary[];
  readonly criticalFindings: readonly VerifiedFinding[];
  readonly warningFindings: readonly VerifiedFinding[];
  readonly infoFindings: readonly VerifiedFinding[];
  readonly screenshots: readonly RuntimeEvidenceScreenshot[];
  readonly componentSummaries: readonly DashboardComponentSummary[];
  readonly executionMetrics: readonly RuntimePipelineStageMetric[];
  readonly insights: OperationalInsightsReport;
}

export function buildOperationalDashboardModel(input: OperationalDashboardInput): OperationalDashboardModel {
  const activeFindings = input.findings.filter((finding) => finding.status !== "rejected");
  const criticalFindings = activeFindings.filter((finding) => finding.severity === "critical");
  const warningFindings = activeFindings.filter((finding) => finding.severity === "warning");
  const infoFindings = activeFindings.filter((finding) => finding.severity === "info");

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    governanceScore: scoreGovernance(activeFindings),
    severitySummary: {
      critical: criticalFindings.length,
      warning: warningFindings.length,
      info: infoFindings.length,
      total: activeFindings.length,
    },
    routeSummaries: summarizeRoutes(activeFindings),
    criticalFindings,
    warningFindings,
    infoFindings,
    screenshots: input.screenshots ?? [],
    componentSummaries: summarizeComponents(input.components ?? []),
    executionMetrics: input.executionMetrics ?? [],
    insights: input.insights,
  };
}

export function summarizeComponents(components: readonly RuntimeEvidenceComponent[]): readonly DashboardComponentSummary[] {
  const byComponent = new Map<string, RuntimeEvidenceComponent[]>();

  for (const component of components) {
    const key = [
      standardComponentName(component.name),
      componentCategoryFor(component),
      sourceForComponent(component),
      component.tagName,
      component.role ?? "",
      component.selectorHint,
    ].join("::");
    byComponent.set(key, [...(byComponent.get(key) ?? []), component]);
  }

  return [...byComponent.values()]
    .map((items) => {
      const component = items[0]!;
      return {
        componentName: standardComponentName(component.name),
        category: componentCategoryFor(component),
        source: sourceForComponent(component),
        tagName: component.tagName,
        ...(component.role ? { role: component.role } : {}),
        selectorHint: component.selectorHint,
        count: items.length,
        visibleCount: items.filter((item) => item.visible).length,
      };
    })
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.category.localeCompare(right.category) ||
        left.componentName.localeCompare(right.componentName),
    );
}

function scoreGovernance(findings: readonly VerifiedFinding[]): number {
  const penalty = findings.reduce((total, finding) => {
    const severityWeight = finding.severity === "critical" ? 15 : finding.severity === "warning" ? 8 : 3;
    return total + severityWeight * finding.confidence;
  }, 0);

  return Math.max(0, Math.round(100 - penalty));
}

function summarizeRoutes(findings: readonly VerifiedFinding[]): readonly DashboardRouteSummary[] {
  const byRoute = new Map<string, VerifiedFinding[]>();

  for (const finding of findings) {
    byRoute.set(finding.route, [...(byRoute.get(finding.route) ?? []), finding]);
  }

  return [...byRoute.entries()]
    .map(([route, routeFindings]) => ({
      route,
      findingCount: routeFindings.length,
      criticalCount: routeFindings.filter((finding) => finding.severity === "critical").length,
      warningCount: routeFindings.filter((finding) => finding.severity === "warning").length,
      infoCount: routeFindings.filter((finding) => finding.severity === "info").length,
    }))
    .sort((left, right) => right.findingCount - left.findingCount || left.route.localeCompare(right.route));
}

function sourceForComponent(component: RuntimeEvidenceComponent): string {
  if (component.attributes?.["data-component"]) {
    return "data-component";
  }

  if (component.attributes?.["data-testid"]) {
    return "data-testid";
  }

  if (component.role) {
    return "role";
  }

  return component.source;
}

function standardComponentName(componentName: string): string {
  const componentNameMap: Readonly<Record<string, string>> = {
    Input: "TextField",
    TextInput: "TextField",
    Textarea: "TextArea",
    Typography: "Text",
  };

  return componentNameMap[componentName] ?? componentName;
}

function componentCategoryFor(component: RuntimeEvidenceComponent): string {
  const name = standardComponentName(component.name);
  const categoryByName: Readonly<Record<string, string>> = {
    Alert: "Feedback and Status",
    Button: "Actions",
    Card: "Data Display",
    Checkbox: "Inputs and Forms",
    Combobox: "Inputs and Forms",
    Dialog: "Feedback and Status",
    Image: "Media and Content",
    Link: "Navigation",
    Menu: "Navigation",
    MenuItem: "Navigation",
    Navigation: "Navigation",
    NumberField: "Inputs and Forms",
    PasswordField: "Inputs and Forms",
    RadioButton: "Inputs and Forms",
    SearchBox: "Inputs and Forms",
    SearchField: "Inputs and Forms",
    Select: "Inputs and Forms",
    Slider: "Inputs and Forms",
    Switch: "Inputs and Forms",
    Tab: "Navigation",
    Tabs: "Navigation",
    Text: "Foundations",
    TextArea: "Inputs and Forms",
    TextField: "Inputs and Forms",
  };

  if (categoryByName[name]) {
    return categoryByName[name];
  }

  if (component.tagName === "a") {
    return "Navigation";
  }

  if (["input", "select", "textarea"].includes(component.tagName)) {
    return "Inputs and Forms";
  }

  if (component.tagName === "button") {
    return "Actions";
  }

  return "Runtime Intelligence Layer";
}
