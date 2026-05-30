import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type {
  ComponentGraphNode,
  FindingGraphNode,
  GovernanceKnowledgeGraph,
  RouteGraphNode,
} from "../../intelligence/knowledge-graph/index.js";
import type { RuntimeEvidence, RuntimeEvidenceComponent } from "../../shared/types/runtime-evidence.js";

export type TestingInsightCategory =
  | "state-coverage"
  | "interaction-coverage"
  | "accessibility-scenario-coverage"
  | "edge-case-discovery"
  | "risk-prioritization";

export interface TestingInsightEvidence {
  readonly nodeIds: readonly string[];
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly findingIds: readonly string[];
  readonly runtimeEvidenceIds: readonly string[];
  readonly scenarioIds: readonly string[];
}

export interface TestingInsightFinding {
  readonly id: string;
  readonly category: TestingInsightCategory;
  readonly severity: "info" | "warning" | "critical";
  readonly summary: string;
  readonly evidence: TestingInsightEvidence;
  readonly recommendation: string;
}

export interface TestingScenario {
  readonly id: string;
  readonly category: TestingInsightCategory;
  readonly priority: "low" | "medium" | "high" | "critical";
  readonly summary: string;
  readonly componentIds: readonly string[];
  readonly routes: readonly string[];
  readonly evidence: TestingInsightEvidence;
}

export interface TestingInsightsReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly testingReadinessScore: number;
  readonly scenarioCount: number;
  readonly highRiskScenarioCount: number;
  readonly findings: readonly TestingInsightFinding[];
  readonly scenarios: readonly TestingScenario[];
}

export interface TesterAgentRequest {
  readonly graph: GovernanceKnowledgeGraph;
  readonly runtimeEvidence: RuntimeEvidence;
  readonly generatedAt?: string | undefined;
}

export interface TesterAgentDependencies {
  readonly logger?: OperationalLogger | undefined;
  readonly scenarioEngine?: TestingScenarioEngine | undefined;
}

export class TesterAgent {
  private readonly logger: OperationalLogger;
  private readonly scenarioEngine: TestingScenarioEngine;

  constructor(private readonly dependencies: TesterAgentDependencies = {}) {
    this.logger = dependencies.logger ?? createAgentLogger("TesterAgent");
    this.scenarioEngine = dependencies.scenarioEngine ?? new TestingScenarioEngine();
  }

  analyze(request: TesterAgentRequest): TestingInsightsReport {
    const generatedAt = request.generatedAt ?? new Date().toISOString();
    const trace = this.logger.start("tester.analysis", {
      correlationId: `tester:${generatedAt}`,
      metadata: {
        graphId: request.graph.graphId,
        runId: request.runtimeEvidence.execution.runId,
        componentCount: request.runtimeEvidence.componentInventory.length,
      },
    });

    try {
      const scenarios = this.scenarioEngine.buildScenarios(request);
      const findings = findingsFromScenarios(scenarios);
      const highRiskScenarioCount = scenarios.filter(
        (scenario) => scenario.priority === "high" || scenario.priority === "critical",
      ).length;
      const testingReadinessScore = score(findings, highRiskScenarioCount);

      this.logger.complete(trace, {
        testingReadinessScore,
        scenarioCount: scenarios.length,
        findingCount: findings.length,
      });

      return {
        reportId: `testing-insights:${request.graph.graphId}:${request.runtimeEvidence.execution.runId}`,
        generatedAt,
        testingReadinessScore,
        scenarioCount: scenarios.length,
        highRiskScenarioCount,
        findings,
        scenarios,
      };
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }
}

export class TestingScenarioEngine {
  buildScenarios(request: TesterAgentRequest): readonly TestingScenario[] {
    return [
      ...stateCoverageScenarios(request.graph, request.runtimeEvidence),
      ...interactionCoverageScenarios(request.graph, request.runtimeEvidence),
      ...accessibilityCoverageScenarios(request.graph, request.runtimeEvidence),
      ...edgeCaseScenarios(request.graph, request.runtimeEvidence),
      ...riskPrioritizationScenarios(request.graph, request.runtimeEvidence),
    ].filter((scenario) => hasEvidence(scenario.evidence));
  }
}

function stateCoverageScenarios(
  graph: GovernanceKnowledgeGraph,
  evidence: RuntimeEvidence,
): readonly TestingScenario[] {
  const statefulComponents = evidence.componentInventory.filter(isStatefulComponent);
  if (statefulComponents.length === 0) {
    return [];
  }

  return [
    scenario({
      id: "testing.state-coverage.interactive-states",
      category: "state-coverage",
      priority: statefulComponents.some(hasRiskyStateEvidence) ? "high" : "medium",
      summary: `${statefulComponents.length} stateful component(s) need explicit default, disabled, focus, and error-state coverage.`,
      graph,
      evidence,
      components: statefulComponents,
      findings: findingsForRuntimeComponents(graph, statefulComponents),
      recommendationEvidenceIds: statefulComponents.map((component) => component.id),
    }),
  ];
}

function interactionCoverageScenarios(
  graph: GovernanceKnowledgeGraph,
  evidence: RuntimeEvidence,
): readonly TestingScenario[] {
  const interactiveComponents = evidence.componentInventory.filter(isInteractiveComponent);
  const interactionEvents = evidence.telemetry.filter(isInteractionEvent);
  const uncoveredComponents = interactiveComponents.filter((component) => !eventMatchesComponent(interactionEvents, component));
  if (interactiveComponents.length === 0 || uncoveredComponents.length === 0) {
    return [];
  }

  return [
    scenario({
      id: "testing.interaction-coverage.uncovered-controls",
      category: "interaction-coverage",
      priority: interactionEvents.length === 0 ? "critical" : "high",
      summary: `${uncoveredComponents.length} interactive component(s) have no matching interaction telemetry.`,
      graph,
      evidence,
      components: uncoveredComponents,
      findings: findingsForRuntimeComponents(graph, uncoveredComponents),
      recommendationEvidenceIds: [
        ...uncoveredComponents.map((component) => component.id),
        ...interactionEvents.map((event) => event.eventId),
      ],
    }),
  ];
}

function accessibilityCoverageScenarios(
  graph: GovernanceKnowledgeGraph,
  evidence: RuntimeEvidence,
): readonly TestingScenario[] {
  const unlabeledInteractiveComponents = evidence.componentInventory.filter(
    (component) => isInteractiveComponent(component) && component.label.trim().length === 0,
  );
  const accessibilityFindings = findingNodes(graph).filter(isAccessibilityFinding);
  const runtimeAccessibilityIds = evidence.accessibilityFindings.map((finding) => finding.id);
  if (unlabeledInteractiveComponents.length === 0 && accessibilityFindings.length === 0 && runtimeAccessibilityIds.length === 0) {
    return [];
  }
  const graphComponents = componentsForFindings(graph, accessibilityFindings);
  const runtimeComponents = unlabeledInteractiveComponents.length > 0 ? unlabeledInteractiveComponents : runtimeComponentsForGraphComponents(evidence, graphComponents);

  return [
    scenario({
      id: "testing.accessibility-scenario-coverage.keyboard-label-focus",
      category: "accessibility-scenario-coverage",
      priority: accessibilityFindings.some((finding) => finding.severity === "critical") ? "critical" : "high",
      summary: "Accessibility scenario coverage is required for labels, keyboard operation, focus order, and announcements.",
      graph,
      evidence,
      components: runtimeComponents,
      findings: accessibilityFindings,
      recommendationEvidenceIds: [...runtimeAccessibilityIds, ...runtimeComponents.map((component) => component.id)],
    }),
  ];
}

function edgeCaseScenarios(
  graph: GovernanceKnowledgeGraph,
  evidence: RuntimeEvidence,
): readonly TestingScenario[] {
  const formComponents = evidence.componentInventory.filter(isFormComponent);
  const emptyLabelComponents = evidence.componentInventory.filter((component) => component.label.trim().length === 0);
  const components = uniqueRuntimeComponents([...formComponents, ...emptyLabelComponents]);
  if (components.length === 0) {
    return [];
  }

  return [
    scenario({
      id: "testing.edge-case-discovery.form-empty-error-paths",
      category: "edge-case-discovery",
      priority: formComponents.length > 0 ? "high" : "medium",
      summary: `${components.length} component(s) need edge-case scenarios for empty, invalid, loading, and error paths.`,
      graph,
      evidence,
      components,
      findings: findingsForRuntimeComponents(graph, components),
      recommendationEvidenceIds: components.map((component) => component.id),
    }),
  ];
}

function riskPrioritizationScenarios(
  graph: GovernanceKnowledgeGraph,
  evidence: RuntimeEvidence,
): readonly TestingScenario[] {
  const criticalFindings = findingNodes(graph).filter((finding) => finding.severity === "critical");
  if (criticalFindings.length === 0) {
    return [];
  }
  const components = runtimeComponentsForGraphComponents(evidence, componentsForFindings(graph, criticalFindings));

  return [
    scenario({
      id: "testing.risk-prioritization.critical-findings",
      category: "risk-prioritization",
      priority: "critical",
      summary: `${criticalFindings.length} critical governance finding(s) should drive the next test priority set.`,
      graph,
      evidence,
      components,
      findings: criticalFindings,
      recommendationEvidenceIds: components.map((component) => component.id),
    }),
  ];
}

function scenario(input: {
  readonly id: string;
  readonly category: TestingInsightCategory;
  readonly priority: TestingScenario["priority"];
  readonly summary: string;
  readonly graph: GovernanceKnowledgeGraph;
  readonly evidence: RuntimeEvidence;
  readonly components: readonly RuntimeEvidenceComponent[];
  readonly findings: readonly FindingGraphNode[];
  readonly recommendationEvidenceIds: readonly string[];
}): TestingScenario {
  const graphComponents = graphComponentsForRuntimeComponents(input.graph, input.components);
  const routes = unique([
    input.evidence.route.resolvedUrl || input.evidence.route.targetUrl,
    ...routesForGraphComponents(input.graph, graphComponents),
  ]);
  const findingIds = unique(input.findings.map((finding) => finding.findingId));
  const nodeIds = unique([
    ...graphComponents.map((component) => component.id),
    ...input.findings.map((finding) => finding.id),
  ]);
  const componentIds = unique([
    ...input.components.map((component) => component.id),
    ...graphComponents.map((component) => component.componentId),
  ]);

  return {
    id: input.id,
    category: input.category,
    priority: input.priority,
    summary: input.summary,
    componentIds,
    routes,
    evidence: {
      nodeIds,
      componentIds,
      routes,
      findingIds,
      runtimeEvidenceIds: unique(input.recommendationEvidenceIds),
      scenarioIds: [input.id],
    },
  };
}

function findingsFromScenarios(scenarios: readonly TestingScenario[]): readonly TestingInsightFinding[] {
  return scenarios.map((scenario) => ({
    id: scenario.id,
    category: scenario.category,
    severity: severityForPriority(scenario.priority),
    summary: scenario.summary,
    evidence: scenario.evidence,
    recommendation: recommendationForScenario(scenario),
  }));
}

function recommendationForScenario(scenario: TestingScenario): string {
  switch (scenario.category) {
    case "state-coverage":
      return "Add deterministic state tests for observed stateful components, including default, disabled, focus, and validation states.";
    case "interaction-coverage":
      return "Add interaction tests that exercise each observed control and persist telemetry evidence for click, keyboard, change, and submit paths.";
    case "accessibility-scenario-coverage":
      return "Add accessibility scenarios for labels, keyboard navigation, focus visibility, announcements, and violation regression checks.";
    case "edge-case-discovery":
      return "Add edge-case tests for empty data, invalid input, loading, disabled, and error responses for the evidenced components.";
    case "risk-prioritization":
      return "Prioritize test creation around components and routes with critical governance findings before broadening coverage.";
  }
}

function severityForPriority(priority: TestingScenario["priority"]): TestingInsightFinding["severity"] {
  if (priority === "critical") {
    return "critical";
  }
  if (priority === "high") {
    return "warning";
  }
  return "info";
}

function isInteractiveComponent(component: RuntimeEvidenceComponent): boolean {
  const tag = component.tagName.toLowerCase();
  const role = component.role?.toLowerCase();
  return (
    ["button", "a", "input", "select", "textarea", "summary"].includes(tag) ||
    ["button", "link", "checkbox", "combobox", "menuitem", "radio", "switch", "tab", "textbox"].includes(role ?? "")
  );
}

function isStatefulComponent(component: RuntimeEvidenceComponent): boolean {
  const attributes = component.attributes ?? {};
  return (
    isInteractiveComponent(component) ||
    ["aria-expanded", "aria-checked", "aria-selected", "disabled", "checked", "selected", "data-state"].some(
      (attribute) => attributes[attribute] !== undefined,
    )
  );
}

function hasRiskyStateEvidence(component: RuntimeEvidenceComponent): boolean {
  const attributes = component.attributes ?? {};
  const className = attributes["class"] ?? "";
  return (
    component.label.trim().length === 0 ||
    attributes["aria-invalid"] === "true" ||
    attributes["disabled"] !== undefined ||
    className.includes("error") ||
    className.includes("danger")
  );
}

function isFormComponent(component: RuntimeEvidenceComponent): boolean {
  const tag = component.tagName.toLowerCase();
  const role = component.role?.toLowerCase();
  return ["form", "input", "select", "textarea"].includes(tag) || ["textbox", "combobox", "searchbox"].includes(role ?? "");
}

function isInteractionEvent(event: RuntimeEvidence["telemetry"][number]): boolean {
  return /click|input|change|submit|key|focus|blur|select|press/i.test(event.type);
}

function eventMatchesComponent(
  events: readonly RuntimeEvidence["telemetry"][number][],
  component: RuntimeEvidenceComponent,
): boolean {
  return events.some((event) => {
    const metadata = event.metadata ?? {};
    const values = Object.values(metadata).map(String);
    return values.some(
      (value) =>
        value === component.id ||
        value === component.selectorHint ||
        value === component.name ||
        value.includes(component.selectorHint),
    );
  });
}

function isAccessibilityFinding(finding: FindingGraphNode): boolean {
  return textMatches(finding, ["accessib", "aria", "label", "focus", "keyboard", "contrast"]);
}

function findingsForRuntimeComponents(
  graph: GovernanceKnowledgeGraph,
  components: readonly RuntimeEvidenceComponent[],
): readonly FindingGraphNode[] {
  return findingsForGraphComponents(graph, graphComponentsForRuntimeComponents(graph, components));
}

function graphComponentsForRuntimeComponents(
  graph: GovernanceKnowledgeGraph,
  components: readonly RuntimeEvidenceComponent[],
): readonly ComponentGraphNode[] {
  const ids = new Set(components.flatMap((component) => [component.id, component.name]));
  return componentNodes(graph).filter(
    (component) => ids.has(component.componentId) || ids.has(component.componentName),
  );
}

function runtimeComponentsForGraphComponents(
  evidence: RuntimeEvidence,
  components: readonly ComponentGraphNode[],
): readonly RuntimeEvidenceComponent[] {
  const ids = new Set(components.flatMap((component) => [component.componentId, component.componentName]));
  return evidence.componentInventory.filter((component) => ids.has(component.id) || ids.has(component.name));
}

function componentsForFindings(
  graph: GovernanceKnowledgeGraph,
  findings: readonly FindingGraphNode[],
): readonly ComponentGraphNode[] {
  const findingIds = new Set(findings.map((finding) => finding.id));
  return uniqueGraphComponents(
    graph.edges
      .filter((edge) => edge.type === "finding_affects_component" && findingIds.has(edge.from))
      .flatMap((edge) => graph.nodes.find((node) => node.id === edge.to))
      .filter((node): node is ComponentGraphNode => node?.type === "component"),
  );
}

function findingsForGraphComponents(
  graph: GovernanceKnowledgeGraph,
  components: readonly ComponentGraphNode[],
): readonly FindingGraphNode[] {
  const componentNodeIds = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "finding_affects_component" && componentNodeIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is FindingGraphNode => node?.type === "finding");
}

function routesForGraphComponents(
  graph: GovernanceKnowledgeGraph,
  components: readonly ComponentGraphNode[],
): readonly string[] {
  const componentNodeIds = new Set(components.map((component) => component.id));
  return graph.edges
    .filter((edge) => edge.type === "route_contains_component" && componentNodeIds.has(edge.to))
    .flatMap((edge) => graph.nodes.find((node) => node.id === edge.from))
    .filter((node): node is RouteGraphNode => node?.type === "route")
    .map((route) => route.route);
}

function componentNodes(graph: GovernanceKnowledgeGraph): readonly ComponentGraphNode[] {
  return graph.nodes.filter((node): node is ComponentGraphNode => node.type === "component");
}

function findingNodes(graph: GovernanceKnowledgeGraph): readonly FindingGraphNode[] {
  return graph.nodes.filter((node): node is FindingGraphNode => node.type === "finding");
}

function textMatches(finding: FindingGraphNode, needles: readonly string[]): boolean {
  const haystack = [finding.findingId, finding.expected, finding.actual].join(" ").toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

function hasEvidence(evidence: TestingInsightEvidence): boolean {
  return (
    evidence.nodeIds.length > 0 ||
    evidence.componentIds.length > 0 ||
    evidence.routes.length > 0 ||
    evidence.findingIds.length > 0 ||
    evidence.runtimeEvidenceIds.length > 0 ||
    evidence.scenarioIds.length > 0
  );
}

function score(findings: readonly TestingInsightFinding[], highRiskScenarioCount: number): number {
  const penalty = findings.reduce((total, finding) => {
    return total + (finding.severity === "critical" ? 24 : finding.severity === "warning" ? 12 : 4);
  }, highRiskScenarioCount * 5);
  return clampScore(100 - penalty);
}

function uniqueRuntimeComponents(components: readonly RuntimeEvidenceComponent[]): readonly RuntimeEvidenceComponent[] {
  return [...new Map(components.map((component) => [component.id, component])).values()].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
}

function uniqueGraphComponents(components: readonly ComponentGraphNode[]): readonly ComponentGraphNode[] {
  return [...new Map(components.map((component) => [component.id, component])).values()].sort((left, right) =>
    left.componentId.localeCompare(right.componentId),
  );
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
