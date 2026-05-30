import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type { MonitoringInsights, RouteHealthMonitoring } from "../monitoring/index.js";
import type { HistoricalInsights, RouteHistoryInsight } from "../memory/types.js";
import type { PrioritizedRemediationItem, PrioritizedRemediationPlan } from "../../intelligence/prioritization/index.js";
import type { ReleaseReadinessReport } from "../../intelligence/release-readiness/index.js";

export type PlanningStrategy = "release-blocker-first" | "risk-balanced" | "route-coverage";
export type ExecutionPlanPhase = "stabilize" | "remediate" | "verify" | "monitor";

export interface PlannerStrategyConfig {
  readonly strategy: PlanningStrategy;
  readonly maxParallelRoutes: number;
  readonly auditCapacityPerCycle: number;
  readonly includeMonitoringPhase: boolean;
}

export const defaultPlannerStrategyConfig: PlannerStrategyConfig = {
  strategy: "risk-balanced",
  maxParallelRoutes: 2,
  auditCapacityPerCycle: 5,
  includeMonitoringPhase: true,
};

export interface ExecutionPlanEvidence {
  readonly monitoringReportId: string;
  readonly historicalRunId: string;
  readonly releaseReadinessReportId: string;
  readonly remediationPlanId: string;
  readonly findingIds: readonly string[];
  readonly routes: readonly string[];
  readonly components: readonly string[];
  readonly signals: readonly string[];
}

export interface RouteExecutionPriority {
  readonly rank: number;
  readonly route: string;
  readonly priorityScore: number;
  readonly riskLevel: "low" | "medium" | "high" | "critical";
  readonly reasons: readonly string[];
  readonly evidence: ExecutionPlanEvidence;
}

export interface AuditPriority {
  readonly rank: number;
  readonly auditType: "accessibility" | "token-drift" | "component-contract" | "release-blocker" | "regression";
  readonly priorityScore: number;
  readonly targetRoutes: readonly string[];
  readonly targetComponents: readonly string[];
  readonly findingIds: readonly string[];
  readonly rationale: string;
}

export interface GovernanceScheduleItem {
  readonly sequence: number;
  readonly phase: ExecutionPlanPhase;
  readonly routes: readonly string[];
  readonly auditTypes: readonly AuditPriority["auditType"][];
  readonly ownerHint: "engineering" | "design-system" | "qa" | "release-management";
  readonly entryCriteria: readonly string[];
  readonly exitCriteria: readonly string[];
}

export interface ResourceAllocation {
  readonly team: "engineering" | "design-system" | "qa" | "release-management";
  readonly allocationWeight: number;
  readonly focus: string;
  readonly evidence: ExecutionPlanEvidence;
}

export interface ExecutionPlan {
  readonly planId: string;
  readonly generatedAt: string;
  readonly strategy: PlannerStrategyConfig;
  readonly releaseDecision: ReleaseReadinessReport["decision"];
  readonly routePriorities: readonly RouteExecutionPriority[];
  readonly auditPriorities: readonly AuditPriority[];
  readonly schedule: readonly GovernanceScheduleItem[];
  readonly resourceAllocations: readonly ResourceAllocation[];
  readonly summary: string;
}

export interface PlannerAgentRequest {
  readonly monitoringInsights: MonitoringInsights;
  readonly historicalInsights: HistoricalInsights;
  readonly releaseReadinessReport: ReleaseReadinessReport;
  readonly prioritizedRemediationPlan: PrioritizedRemediationPlan;
  readonly strategy?: Partial<PlannerStrategyConfig> | undefined;
  readonly generatedAt?: string | undefined;
}

export interface PlannerAgentDependencies {
  readonly logger?: OperationalLogger | undefined;
}

export class PlannerAgent {
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: PlannerAgentDependencies = {}) {
    this.logger = dependencies.logger ?? createAgentLogger("PlannerAgent");
  }

  plan(request: PlannerAgentRequest): ExecutionPlan {
    const generatedAt = request.generatedAt ?? new Date().toISOString();
    const strategy = { ...defaultPlannerStrategyConfig, ...(request.strategy ?? {}) };
    const trace = this.logger.start("planner.plan", {
      correlationId: `planner:${generatedAt}`,
      metadata: {
        strategy: strategy.strategy,
        releaseDecision: request.releaseReadinessReport.decision,
        remediationItemCount: request.prioritizedRemediationPlan.findingCount,
      },
    });

    try {
      const routePriorities = routePrioritiesFor(request, strategy);
      const auditPriorities = auditPrioritiesFor(request, routePriorities, strategy);
      const schedule = scheduleFor(request, routePriorities, auditPriorities, strategy);
      const resourceAllocations = resourceAllocationsFor(request, routePriorities, auditPriorities);
      const plan = {
        planId: `execution-plan:${request.releaseReadinessReport.reportId}`,
        generatedAt,
        strategy,
        releaseDecision: request.releaseReadinessReport.decision,
        routePriorities,
        auditPriorities,
        schedule,
        resourceAllocations,
        summary: summaryFor(request, routePriorities, auditPriorities, schedule),
      };

      this.logger.complete(trace, {
        routeCount: routePriorities.length,
        auditCount: auditPriorities.length,
        scheduleCount: schedule.length,
      });

      return plan;
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }
}

function routePrioritiesFor(
  request: PlannerAgentRequest,
  strategy: PlannerStrategyConfig,
): readonly RouteExecutionPriority[] {
  const routes = unique([
    ...request.monitoringInsights.routeHealth.map((route) => route.route),
    ...request.historicalInsights.routeHistory.map((route) => route.route),
    ...request.prioritizedRemediationPlan.items.flatMap((item) => item.evidence.routes),
    ...request.releaseReadinessReport.blockingFindings.map((finding) => finding.route),
  ]);

  return routes
    .map((route) => {
      const monitoring = request.monitoringInsights.routeHealth.find((item) => item.route === route);
      const history = request.historicalInsights.routeHistory.find((item) => item.route === route);
      const remediationItems = request.prioritizedRemediationPlan.items.filter((item) => item.evidence.routes.includes(route) || item.route === route);
      const blockerCount = request.releaseReadinessReport.blockingFindings.filter((finding) => finding.route === route).length;
      const priorityScore = routePriorityScore({ monitoring, history, remediationItems, blockerCount, strategy });
      const evidence = evidenceFor(request, remediationItems, [route], remediationItems.flatMap((item) => item.evidence.componentIds), [
        ...(monitoring ? [`route-health:${monitoring.status}:${monitoring.healthScore}`] : []),
        ...(history ? [`route-history:recurring:${history.recurringViolationCount}`] : []),
        ...(blockerCount > 0 ? [`release-blockers:${blockerCount}`] : []),
      ]);

      return {
        rank: 0,
        route,
        priorityScore,
        riskLevel: riskLevel(priorityScore),
        reasons: routeReasons({ monitoring, history, remediationItems, blockerCount }),
        evidence,
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore || left.route.localeCompare(right.route))
    .map((route, index) => ({ ...route, rank: index + 1 }));
}

function auditPrioritiesFor(
  request: PlannerAgentRequest,
  routePriorities: readonly RouteExecutionPriority[],
  strategy: PlannerStrategyConfig,
): readonly AuditPriority[] {
  const candidates = [
    auditPriority("release-blocker", request, routePriorities),
    auditPriority("accessibility", request, routePriorities),
    auditPriority("token-drift", request, routePriorities),
    auditPriority("component-contract", request, routePriorities),
    auditPriority("regression", request, routePriorities),
  ]
    .filter((audit) => audit.priorityScore > 0)
    .sort((left, right) => right.priorityScore - left.priorityScore || left.auditType.localeCompare(right.auditType))
    .slice(0, strategy.auditCapacityPerCycle)
    .map((audit, index) => ({ ...audit, rank: index + 1 }));

  return candidates;
}

function auditPriority(
  auditType: AuditPriority["auditType"],
  request: PlannerAgentRequest,
  routePriorities: readonly RouteExecutionPriority[],
): AuditPriority {
  const items = request.prioritizedRemediationPlan.items.filter((item) => auditMatches(auditType, item));
  const blockerFindings = request.releaseReadinessReport.blockingFindings.filter((finding) =>
    auditType === "release-blocker" ? true : auditMatchesText(auditType, `${finding.findingId} ${finding.reason}`),
  );
  const historicalBoost =
    auditType === "regression"
      ? request.historicalInsights.regressions.length * 12
      : auditType === "accessibility"
        ? request.historicalInsights.recurringViolations.filter((violation) => /accessib|aria|label|focus|keyboard/i.test(violation.signature)).length * 8
        : 0;
  const routeBoost = routePriorities.filter((route) => route.riskLevel === "critical" || route.riskLevel === "high").length * 3;
  const priorityScore = clampScore(
    items.reduce((total, item) => total + Math.round(item.score * 0.35), 0) +
      blockerFindings.length * 18 +
      historicalBoost +
      routeBoost,
  );

  return {
    rank: 0,
    auditType,
    priorityScore,
    targetRoutes: unique([...items.flatMap((item) => item.evidence.routes), ...blockerFindings.map((finding) => finding.route)]),
    targetComponents: unique([...items.flatMap((item) => item.evidence.componentIds), ...blockerFindings.map((finding) => finding.component)]),
    findingIds: unique([...items.flatMap((item) => item.evidence.findingIds), ...blockerFindings.map((finding) => finding.findingId)]),
    rationale: rationaleForAudit(auditType, items.length, blockerFindings.length, historicalBoost),
  };
}

function scheduleFor(
  request: PlannerAgentRequest,
  routePriorities: readonly RouteExecutionPriority[],
  auditPriorities: readonly AuditPriority[],
  strategy: PlannerStrategyConfig,
): readonly GovernanceScheduleItem[] {
  const primaryRoutes = routePriorities.slice(0, strategy.maxParallelRoutes).map((route) => route.route);
  const nextRoutes = routePriorities.slice(strategy.maxParallelRoutes, strategy.maxParallelRoutes * 2).map((route) => route.route);
  const blockerAudits = auditPriorities.filter((audit) => audit.auditType === "release-blocker" || audit.priorityScore >= 60);
  const schedule: GovernanceScheduleItem[] = [
    {
      sequence: 1,
      phase: "stabilize",
      routes: primaryRoutes,
      auditTypes: uniqueAuditTypes(blockerAudits.length > 0 ? blockerAudits : auditPriorities.slice(0, 2)),
      ownerHint: request.releaseReadinessReport.decision === "go" ? "qa" : "release-management",
      entryCriteria: ["release readiness report generated", "prioritized remediation plan available"],
      exitCriteria: ["critical blockers resolved or accepted", "route risk reduced for primary routes"],
    },
    {
      sequence: 2,
      phase: "remediate",
      routes: unique([...primaryRoutes, ...nextRoutes]),
      auditTypes: uniqueAuditTypes(auditPriorities),
      ownerHint: "engineering",
      entryCriteria: ["stabilization scope agreed", "owners assigned for top remediation items"],
      exitCriteria: ["high priority remediation items closed", "root recurring violations have owner updates"],
    },
    {
      sequence: 3,
      phase: "verify",
      routes: routePriorities.slice(0, Math.max(strategy.maxParallelRoutes, 1)).map((route) => route.route),
      auditTypes: uniqueAuditTypes(auditPriorities.slice(0, 3)),
      ownerHint: "qa",
      entryCriteria: ["remediation evidence captured", "governance checks re-run"],
      exitCriteria: ["release readiness re-evaluated", "no unresolved critical verification failures"],
    },
  ];

  if (strategy.includeMonitoringPhase) {
    schedule.push({
      sequence: 4,
      phase: "monitor",
      routes: routePriorities.map((route) => route.route),
      auditTypes: [],
      ownerHint: "release-management",
      entryCriteria: ["release decision made", "monitoring signals configured"],
      exitCriteria: ["post-release governance trend remains stable or improving"],
    });
  }

  return schedule;
}

function resourceAllocationsFor(
  request: PlannerAgentRequest,
  routePriorities: readonly RouteExecutionPriority[],
  auditPriorities: readonly AuditPriority[],
): readonly ResourceAllocation[] {
  const criticalItems = request.prioritizedRemediationPlan.criticalItemCount;
  const highItems = request.prioritizedRemediationPlan.highItemCount;
  const tokenAudit = auditPriorities.find((audit) => audit.auditType === "token-drift");
  const accessibilityAudit = auditPriorities.find((audit) => audit.auditType === "accessibility");
  const topRoutes = routePriorities.slice(0, 3).map((route) => route.route);

  return [
    allocation("engineering", clampScore(35 + criticalItems * 8 + highItems * 3), "Resolve top-ranked remediation items and component contract failures.", request, topRoutes),
    allocation("qa", clampScore(25 + (accessibilityAudit ? 10 : 0)), "Verify high-risk routes and regression paths.", request, topRoutes),
    allocation("design-system", clampScore(20 + (tokenAudit ? 15 : 0)), "Support token, variant, and registry-aligned governance fixes.", request, topRoutes),
    allocation("release-management", clampScore(20 + (request.releaseReadinessReport.decision === "no-go" ? 15 : 0)), "Coordinate release gates, blocker acceptance, and stakeholder readiness.", request, topRoutes),
  ].sort((left, right) => right.allocationWeight - left.allocationWeight || left.team.localeCompare(right.team));
}

function allocation(
  team: ResourceAllocation["team"],
  allocationWeight: number,
  focus: string,
  request: PlannerAgentRequest,
  routes: readonly string[],
): ResourceAllocation {
  const items = request.prioritizedRemediationPlan.items.filter((item) => item.evidence.routes.some((route) => routes.includes(route)));
  return {
    team,
    allocationWeight,
    focus,
    evidence: evidenceFor(request, items, routes, items.flatMap((item) => item.evidence.componentIds), [`team:${team}`]),
  };
}

function routePriorityScore(input: {
  readonly monitoring: RouteHealthMonitoring | undefined;
  readonly history: RouteHistoryInsight | undefined;
  readonly remediationItems: readonly PrioritizedRemediationItem[];
  readonly blockerCount: number;
  readonly strategy: PlannerStrategyConfig;
}): number {
  const monitoringRisk = input.monitoring ? 100 - input.monitoring.healthScore + input.monitoring.activeFindingCount * 4 : 0;
  const historicalRisk = input.history ? input.history.recurringViolationCount * 10 + input.history.totalVerifiedFindings * 2 : 0;
  const remediationRisk = input.remediationItems.reduce((total, item) => total + Math.round(item.score * 0.2), 0);
  const blockerRisk = input.blockerCount * (input.strategy.strategy === "release-blocker-first" ? 35 : 25);
  const coverageBoost = input.strategy.strategy === "route-coverage" ? 8 : 0;
  return clampScore(monitoringRisk + historicalRisk + remediationRisk + blockerRisk + coverageBoost);
}

function routeReasons(input: {
  readonly monitoring: RouteHealthMonitoring | undefined;
  readonly history: RouteHistoryInsight | undefined;
  readonly remediationItems: readonly PrioritizedRemediationItem[];
  readonly blockerCount: number;
}): readonly string[] {
  return [
    ...(input.monitoring ? [`monitoring:${input.monitoring.status}:${input.monitoring.healthScore}`] : []),
    ...(input.history ? [`history:recurring:${input.history.recurringViolationCount}`] : []),
    ...(input.remediationItems.length > 0 ? [`remediation-items:${input.remediationItems.length}`] : []),
    ...(input.blockerCount > 0 ? [`release-blockers:${input.blockerCount}`] : []),
  ];
}

function auditMatches(auditType: AuditPriority["auditType"], item: PrioritizedRemediationItem): boolean {
  if (auditType === "release-blocker") {
    return item.priority === "critical" || item.priority === "high";
  }
  return auditMatchesText(auditType, [item.findingId, item.recommendation, ...item.explanation, ...item.evidence.factorSignals].join(" "));
}

function auditMatchesText(auditType: AuditPriority["auditType"], text: string): boolean {
  const haystack = text.toLowerCase();
  if (auditType === "accessibility") {
    return /accessib|aria|label|focus|keyboard|contrast/.test(haystack);
  }
  if (auditType === "token-drift") {
    return /token|color\.|spacing\.|typography\.|radius\.|shadow\./.test(haystack);
  }
  if (auditType === "component-contract") {
    return /component|contract|variant|misuse/.test(haystack);
  }
  if (auditType === "regression") {
    return /regression|recurring|returned-after-clean-run/.test(haystack);
  }
  return true;
}

function rationaleForAudit(
  auditType: AuditPriority["auditType"],
  itemCount: number,
  blockerCount: number,
  historicalBoost: number,
): string {
  return `${auditType} audit prioritized from ${itemCount} remediation item(s), ${blockerCount} release blocker(s), and historical boost ${historicalBoost}.`;
}

function evidenceFor(
  request: PlannerAgentRequest,
  items: readonly PrioritizedRemediationItem[],
  routes: readonly string[],
  components: readonly string[],
  signals: readonly string[],
): ExecutionPlanEvidence {
  return {
    monitoringReportId: request.monitoringInsights.reportId,
    historicalRunId: request.historicalInsights.runId,
    releaseReadinessReportId: request.releaseReadinessReport.reportId,
    remediationPlanId: request.prioritizedRemediationPlan.planId,
    findingIds: unique(items.flatMap((item) => item.evidence.findingIds)),
    routes: unique(routes),
    components: unique(components),
    signals: unique([
      ...signals,
      `release-decision:${request.releaseReadinessReport.decision}`,
      `governance-health:${request.monitoringInsights.governanceHealth.status}`,
    ]),
  };
}

function summaryFor(
  request: PlannerAgentRequest,
  routes: readonly RouteExecutionPriority[],
  audits: readonly AuditPriority[],
  schedule: readonly GovernanceScheduleItem[],
): string {
  return `${request.releaseReadinessReport.decision} release plan with ${routes.length} route(s), ${audits.length} audit focus area(s), and ${schedule.length} scheduled phase(s).`;
}

function riskLevel(score: number): RouteExecutionPriority["riskLevel"] {
  if (score >= 80) {
    return "critical";
  }
  if (score >= 55) {
    return "high";
  }
  if (score >= 30) {
    return "medium";
  }
  return "low";
}

function uniqueAuditTypes(audits: readonly AuditPriority[]): readonly AuditPriority["auditType"][] {
  return [...new Set(audits.map((audit) => audit.auditType))];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}
