import { createAgentLogger, type OperationalLogger } from "../../shared/logger/index.js";
import type { PrioritizedRemediationItem, PrioritizedRemediationPlan } from "../../intelligence/prioritization/index.js";
import type { ReleaseReadinessReport } from "../../intelligence/release-readiness/index.js";
import type { RootCauseInsight, RootCauseReport } from "../../intelligence/root-cause/index.js";

export type PMInsightCategory =
  | "release-risk"
  | "prioritization"
  | "business-impact"
  | "governance-readiness"
  | "stakeholder-reporting";

export interface PMInsightEvidence {
  readonly readinessReportId: string;
  readonly rootCauseReportId: string;
  readonly remediationPlanId: string;
  readonly findingIds: readonly string[];
  readonly rootCauseIds: readonly string[];
  readonly routes: readonly string[];
  readonly components: readonly string[];
  readonly releaseDecision: ReleaseReadinessReport["decision"];
}

export interface PMInsight {
  readonly id: string;
  readonly category: PMInsightCategory;
  readonly severity: "info" | "warning" | "critical";
  readonly summary: string;
  readonly audience: "executive" | "product" | "engineering" | "design" | "qa";
  readonly evidence: PMInsightEvidence;
  readonly recommendedAction: string;
}

export interface PMInsightsReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly releaseDecision: ReleaseReadinessReport["decision"];
  readonly executiveSummary: string;
  readonly releaseRiskSummary: string;
  readonly governanceReadinessSummary: string;
  readonly prioritizationSummary: string;
  readonly businessImpactSummary: string;
  readonly stakeholderUpdates: readonly PMInsight[];
  readonly insights: readonly PMInsight[];
}

export interface PMAgentRequest {
  readonly releaseReadinessReport: ReleaseReadinessReport;
  readonly rootCauseReport: RootCauseReport;
  readonly prioritizedRemediationPlan: PrioritizedRemediationPlan;
  readonly generatedAt?: string | undefined;
}

export interface PMAgentDependencies {
  readonly logger?: OperationalLogger | undefined;
}

export class PMAgent {
  private readonly logger: OperationalLogger;

  constructor(private readonly dependencies: PMAgentDependencies = {}) {
    this.logger = dependencies.logger ?? createAgentLogger("PMAgent");
  }

  analyze(request: PMAgentRequest): PMInsightsReport {
    const generatedAt = request.generatedAt ?? new Date().toISOString();
    const trace = this.logger.start("pm.analysis", {
      correlationId: `pm:${generatedAt}`,
      metadata: {
        releaseDecision: request.releaseReadinessReport.decision,
        rootCauseCount: request.rootCauseReport.systemicCauseCount,
        remediationItemCount: request.prioritizedRemediationPlan.findingCount,
      },
    });

    try {
      const insights = [
        releaseRiskInsight(request),
        governanceReadinessInsight(request),
        prioritizationInsight(request),
        businessImpactInsight(request),
        stakeholderReportingInsight(request),
      ].filter(hasEvidence);
      const report = {
        reportId: `pm-insights:${request.releaseReadinessReport.reportId}`,
        generatedAt,
        releaseDecision: request.releaseReadinessReport.decision,
        executiveSummary: executiveSummary(request),
        releaseRiskSummary: releaseRiskSummary(request.releaseReadinessReport),
        governanceReadinessSummary: governanceReadinessSummary(request.releaseReadinessReport),
        prioritizationSummary: prioritizationSummary(request.prioritizedRemediationPlan),
        businessImpactSummary: businessImpactSummary(request),
        stakeholderUpdates: insights,
        insights,
      };

      this.logger.complete(trace, {
        insightCount: insights.length,
        releaseDecision: report.releaseDecision,
      });

      return report;
    } catch (error) {
      this.logger.fail(trace, error);
      throw error;
    }
  }
}

function releaseRiskInsight(request: PMAgentRequest): PMInsight {
  const report = request.releaseReadinessReport;
  return {
    id: "pm.release-risk",
    category: "release-risk",
    severity: severityForDecision(report.decision),
    summary: releaseRiskSummary(report),
    audience: "executive",
    evidence: evidenceFor(request, request.prioritizedRemediationPlan.items, request.rootCauseReport.rootCauses),
    recommendedAction:
      report.decision === "no-go"
        ? "Hold release until blocking governance findings are resolved or explicitly accepted by release owners."
        : report.decision === "conditional-go"
          ? "Proceed only with documented acceptance criteria and owner sign-off for remaining blockers."
          : "Proceed with release while continuing standard governance monitoring.",
  };
}

function governanceReadinessInsight(request: PMAgentRequest): PMInsight {
  return {
    id: "pm.governance-readiness",
    category: "governance-readiness",
    severity: readinessSeverity(request.releaseReadinessReport),
    summary: governanceReadinessSummary(request.releaseReadinessReport),
    audience: "engineering",
    evidence: evidenceFor(request, request.prioritizedRemediationPlan.items, request.rootCauseReport.rootCauses),
    recommendedAction: "Use the release readiness reasoning as the source of truth for release governance sign-off.",
  };
}

function prioritizationInsight(request: PMAgentRequest): PMInsight {
  const topItems = request.prioritizedRemediationPlan.items.slice(0, 3);
  return {
    id: "pm.prioritization",
    category: "prioritization",
    severity: topItems.some((item) => item.priority === "critical") ? "critical" : topItems.some((item) => item.priority === "high") ? "warning" : "info",
    summary: prioritizationSummary(request.prioritizedRemediationPlan),
    audience: "product",
    evidence: evidenceFor(request, topItems, rootCausesForItems(topItems, request.rootCauseReport)),
    recommendedAction: "Sequence remediation by rank and resolve critical items before broadening scope.",
  };
}

function businessImpactInsight(request: PMAgentRequest): PMInsight {
  const blockers = request.releaseReadinessReport.blockingFindings;
  const rootCauses = rootCausesForItems(request.prioritizedRemediationPlan.items, request.rootCauseReport);
  return {
    id: "pm.business-impact",
    category: "business-impact",
    severity: blockers.length > 0 ? severityForDecision(request.releaseReadinessReport.decision) : "info",
    summary: businessImpactSummary(request),
    audience: "product",
    evidence: evidenceFor(request, request.prioritizedRemediationPlan.items, rootCauses),
    recommendedAction: "Communicate user-facing and release-schedule impact using affected routes, components, and blocking count.",
  };
}

function stakeholderReportingInsight(request: PMAgentRequest): PMInsight {
  return {
    id: "pm.stakeholder-reporting",
    category: "stakeholder-reporting",
    severity: request.releaseReadinessReport.decision === "go" ? "info" : "warning",
    summary: stakeholderSummary(request),
    audience: "executive",
    evidence: evidenceFor(request, request.prioritizedRemediationPlan.items, request.rootCauseReport.rootCauses),
    recommendedAction: "Share decision, blockers, top root causes, and next owner action in release status updates.",
  };
}

function executiveSummary(request: PMAgentRequest): string {
  const decision = request.releaseReadinessReport.decision;
  const blockers = request.releaseReadinessReport.blockingFindings.length;
  const risk = request.releaseReadinessReport.releaseRiskScore;
  return `Release recommendation is ${decision} with risk score ${risk} and ${blockers} blocking governance item(s).`;
}

function releaseRiskSummary(report: ReleaseReadinessReport): string {
  return `Release risk score is ${report.releaseRiskScore}; decision is ${report.decision}; blocking findings: ${report.blockingFindings.length}.`;
}

function governanceReadinessSummary(report: ReleaseReadinessReport): string {
  return `Governance confidence is ${report.governanceConfidenceScore}; governance score is ${report.evidence.governanceScore}; trend degraded: ${report.trendAnalysis.degraded}.`;
}

function prioritizationSummary(plan: PrioritizedRemediationPlan): string {
  return `${plan.findingCount} remediation item(s) ranked; ${plan.criticalItemCount} critical and ${plan.highItemCount} high priority item(s).`;
}

function businessImpactSummary(request: PMAgentRequest): string {
  const affectedRoutes = unique([
    ...request.releaseReadinessReport.blockingFindings.map((finding) => finding.route),
    ...request.prioritizedRemediationPlan.items.flatMap((item) => item.evidence.routes),
  ]);
  const affectedComponents = unique([
    ...request.releaseReadinessReport.blockingFindings.map((finding) => finding.component),
    ...request.prioritizedRemediationPlan.items.flatMap((item) => item.evidence.componentIds),
  ]);
  return `${affectedRoutes.length} route(s) and ${affectedComponents.length} component(s) have release-relevant governance impact.`;
}

function stakeholderSummary(request: PMAgentRequest): string {
  const topRootCause = request.rootCauseReport.rootCauses[0];
  return topRootCause
    ? `Stakeholder update should lead with ${request.releaseReadinessReport.decision}, ${request.releaseReadinessReport.blockingFindings.length} blocker(s), and top root cause: ${topRootCause.summary}`
    : `Stakeholder update should lead with ${request.releaseReadinessReport.decision} and ${request.releaseReadinessReport.blockingFindings.length} blocker(s).`;
}

function evidenceFor(
  request: PMAgentRequest,
  items: readonly PrioritizedRemediationItem[],
  rootCauses: readonly RootCauseInsight[],
): PMInsightEvidence {
  return {
    readinessReportId: request.releaseReadinessReport.reportId,
    rootCauseReportId: request.rootCauseReport.reportId,
    remediationPlanId: request.prioritizedRemediationPlan.planId,
    findingIds: unique([
      ...items.flatMap((item) => item.evidence.findingIds),
      ...rootCauses.flatMap((cause) => cause.evidence.findingIds),
      ...request.releaseReadinessReport.blockingFindings.map((finding) => finding.findingId),
    ]),
    rootCauseIds: unique([
      ...items.flatMap((item) => item.evidence.rootCauseIds),
      ...rootCauses.map((cause) => cause.id),
    ]),
    routes: unique([
      ...items.flatMap((item) => item.evidence.routes),
      ...rootCauses.flatMap((cause) => cause.evidence.routes),
      ...request.releaseReadinessReport.blockingFindings.map((finding) => finding.route),
    ]),
    components: unique([
      ...items.flatMap((item) => item.evidence.componentIds),
      ...rootCauses.flatMap((cause) => cause.evidence.componentIds),
      ...request.releaseReadinessReport.blockingFindings.map((finding) => finding.component),
    ]),
    releaseDecision: request.releaseReadinessReport.decision,
  };
}

function rootCausesForItems(
  items: readonly PrioritizedRemediationItem[],
  report: RootCauseReport,
): readonly RootCauseInsight[] {
  const rootCauseIds = new Set(items.flatMap((item) => item.evidence.rootCauseIds));
  const findingIds = new Set(items.flatMap((item) => item.evidence.findingIds));
  return report.rootCauses.filter(
    (cause) => rootCauseIds.has(cause.id) || cause.evidence.findingIds.some((findingId) => findingIds.has(findingId)),
  );
}

function severityForDecision(decision: ReleaseReadinessReport["decision"]): PMInsight["severity"] {
  return decision === "no-go" ? "critical" : decision === "conditional-go" ? "warning" : "info";
}

function readinessSeverity(report: ReleaseReadinessReport): PMInsight["severity"] {
  if (report.governanceConfidenceScore < report.thresholds.minimumGovernanceConfidenceScore || report.decision === "no-go") {
    return "critical";
  }
  if (report.decision === "conditional-go" || report.trendAnalysis.degraded) {
    return "warning";
  }
  return "info";
}

function hasEvidence(insight: PMInsight): boolean {
  return (
    insight.evidence.readinessReportId.length > 0 &&
    insight.evidence.rootCauseReportId.length > 0 &&
    insight.evidence.remediationPlanId.length > 0 &&
    (insight.evidence.findingIds.length > 0 ||
      insight.evidence.rootCauseIds.length > 0 ||
      insight.evidence.routes.length > 0 ||
      insight.evidence.components.length > 0)
  );
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((value) => value.length > 0))].sort();
}
