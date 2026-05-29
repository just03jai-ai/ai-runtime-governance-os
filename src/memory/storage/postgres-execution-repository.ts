import type { OperationalInsightsReport } from "../../agents/analyzer/operational-insights-report.js";
import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type { GovernanceValidationFinding } from "../../governance/validation/governance-finding.js";
import type { RuntimePipelineStageMetric } from "../../orchestration/runtime-pipeline-orchestrator.js";
import type { FindingsReportGovernanceScore } from "../../reports/findings/findings-report.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import type { PostgresPool, PostgresQueryable } from "./postgres-client.js";
import { withPostgresTransaction } from "./postgres-client.js";
import type {
  ExecutionHistoryQuery,
  ExecutionHistorySummary,
  GovernanceExecutionRepository,
  HistoricalExecutionRecord,
} from "./types.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined };

interface ExecutionHistoryRow {
  readonly run_id: string;
  readonly route: string;
  readonly route_id: string | null;
  readonly status: "passed" | "failed";
  readonly started_at: Date;
  readonly completed_at: Date | null;
  readonly duration_ms: number | null;
  readonly governance_score: number | null;
  readonly finding_count: number | null;
  readonly verified_finding_count: number | null;
}

interface ExecutionRecordRow {
  readonly run_id: string;
  readonly correlation_id: string | null;
  readonly raw_evidence: RuntimeEvidence;
  readonly governance_findings: GovernanceValidationFinding[];
  readonly verified_findings: VerifiedFinding[];
  readonly analyzer_insights: OperationalInsightsReport;
  readonly execution_metrics: RuntimePipelineStageMetric[];
  readonly governance_score_payload: FindingsReportGovernanceScore | null;
  readonly metadata: Record<string, unknown> | null;
}

export class PostgresGovernanceExecutionRepository implements GovernanceExecutionRepository {
  constructor(private readonly pool: PostgresPool) {}

  async saveExecution(record: HistoricalExecutionRecord): Promise<void> {
    await withPostgresTransaction(this.pool, async (client) => {
      await this.upsertExecution(client, record);
      await this.replaceExecutionChildren(client, record.runtimeEvidence.execution.runId);
      await this.insertRuntimeEvidenceChildren(client, record.runtimeEvidence);
      await this.insertGovernanceFindings(client, record.runtimeEvidence.execution.runId, record.governanceFindings);
      await this.insertVerifiedFindings(client, record.runtimeEvidence.execution.runId, record.verifiedFindings);
      await this.insertAnalyzerInsights(client, record.runtimeEvidence.execution.runId, record.analyzerInsights);
      await this.insertExecutionMetrics(client, record.runtimeEvidence.execution.runId, record.executionMetrics);
      await this.insertGovernanceScore(client, record.runtimeEvidence.execution.runId, record.governanceScore);
    });
  }

  async findExecution(runId: string): Promise<HistoricalExecutionRecord | undefined> {
    const result = await this.pool.query<ExecutionRecordRow>(
      `
        SELECT
          run_id,
          correlation_id,
          raw_evidence,
          governance_findings,
          verified_findings,
          analyzer_insights,
          execution_metrics,
          governance_score_payload,
          metadata
        FROM governance_execution_records
        WHERE run_id = $1
      `,
      [runId],
    );

    const row = result.rows[0];
    if (!row) {
      return undefined;
    }

    return {
      ...(row.correlation_id ? { correlationId: row.correlation_id } : {}),
      runtimeEvidence: row.raw_evidence,
      governanceFindings: row.governance_findings,
      verifiedFindings: row.verified_findings,
      analyzerInsights: row.analyzer_insights,
      executionMetrics: row.execution_metrics,
      governanceScore:
        row.governance_score_payload ??
        ({
          score: 0,
          verifiedFindingCount: row.verified_findings.length,
          needsReviewFindingCount: 0,
          rejectedFindingCount: 0,
        } satisfies FindingsReportGovernanceScore),
      ...(row.metadata ? { metadata: row.metadata } : {}),
    };
  }

  async listExecutionHistory(query: ExecutionHistoryQuery = {}): Promise<readonly ExecutionHistorySummary[]> {
    const predicates: string[] = [];
    const values: unknown[] = [];

    if (query.route) {
      values.push(query.route);
      predicates.push(`e.route_target_url = $${values.length}`);
    }

    if (query.routeId) {
      values.push(query.routeId);
      predicates.push(`e.route_id = $${values.length}`);
    }

    if (query.severity) {
      values.push(query.severity);
      predicates.push(`EXISTS (
        SELECT 1
        FROM governance_findings gf
        WHERE gf.run_id = e.run_id AND gf.severity = $${values.length}
      )`);
    }

    values.push(query.limit ?? 50);
    const limitPlaceholder = `$${values.length}`;
    const whereClause = predicates.length > 0 ? `WHERE ${predicates.join(" AND ")}` : "";

    const result = await this.pool.query<ExecutionHistoryRow>(
      `
        SELECT
          e.run_id,
          e.route_target_url AS route,
          e.route_id,
          e.status,
          e.started_at,
          e.completed_at,
          e.duration_ms,
          gs.score AS governance_score,
          count(DISTINCT gf.finding_id)::int AS finding_count,
          count(DISTINCT vf.finding_id)::int AS verified_finding_count
        FROM governance_executions e
        LEFT JOIN governance_scores gs ON gs.run_id = e.run_id
        LEFT JOIN governance_findings gf ON gf.run_id = e.run_id
        LEFT JOIN verified_findings vf ON vf.run_id = e.run_id
        ${whereClause}
        GROUP BY e.run_id, gs.score
        ORDER BY e.started_at DESC
        LIMIT ${limitPlaceholder}
      `,
      values,
    );

    return result.rows.map((row) => ({
      runId: row.run_id,
      route: row.route,
      ...(row.route_id ? { routeId: row.route_id } : {}),
      status: row.status,
      startedAt: row.started_at.toISOString(),
      ...(row.completed_at ? { completedAt: row.completed_at.toISOString() } : {}),
      ...(row.duration_ms === null ? {} : { durationMs: row.duration_ms }),
      ...(row.governance_score === null ? {} : { governanceScore: row.governance_score }),
      findingCount: row.finding_count ?? 0,
      verifiedFindingCount: row.verified_finding_count ?? 0,
    }));
  }

  private async upsertExecution(client: PostgresQueryable, record: HistoricalExecutionRecord): Promise<void> {
    const evidence = record.runtimeEvidence;
    await client.query(
      `
        INSERT INTO governance_executions (
          run_id,
          correlation_id,
          schema_version,
          environment,
          executor,
          status,
          route_id,
          route_target_url,
          route_resolved_url,
          route_title,
          run_label,
          started_at,
          captured_at,
          completed_at,
          duration_ms,
          dom_captured_at,
          dom_element_count,
          dom_interactive_element_count,
          dom_extraction_strategy,
          confidence_score,
          confidence_basis,
          raw_evidence,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        ON CONFLICT (run_id) DO UPDATE SET
          correlation_id = EXCLUDED.correlation_id,
          schema_version = EXCLUDED.schema_version,
          environment = EXCLUDED.environment,
          executor = EXCLUDED.executor,
          status = EXCLUDED.status,
          route_id = EXCLUDED.route_id,
          route_target_url = EXCLUDED.route_target_url,
          route_resolved_url = EXCLUDED.route_resolved_url,
          route_title = EXCLUDED.route_title,
          run_label = EXCLUDED.run_label,
          started_at = EXCLUDED.started_at,
          captured_at = EXCLUDED.captured_at,
          completed_at = EXCLUDED.completed_at,
          duration_ms = EXCLUDED.duration_ms,
          dom_captured_at = EXCLUDED.dom_captured_at,
          dom_element_count = EXCLUDED.dom_element_count,
          dom_interactive_element_count = EXCLUDED.dom_interactive_element_count,
          dom_extraction_strategy = EXCLUDED.dom_extraction_strategy,
          confidence_score = EXCLUDED.confidence_score,
          confidence_basis = EXCLUDED.confidence_basis,
          raw_evidence = EXCLUDED.raw_evidence,
          metadata = EXCLUDED.metadata
      `,
      [
        evidence.execution.runId,
        record.correlationId ?? evidence.execution.runId,
        evidence.schemaVersion,
        evidence.execution.environment,
        evidence.execution.executor,
        evidence.execution.status,
        evidence.route.routeId ?? null,
        evidence.route.targetUrl,
        evidence.route.resolvedUrl,
        evidence.route.title,
        evidence.route.runLabel ?? null,
        evidence.timestamps.startedAt,
        evidence.timestamps.capturedAt,
        evidence.timestamps.completedAt ?? null,
        evidence.execution.durationMs ?? null,
        evidence.domSnapshot.capturedAt,
        evidence.domSnapshot.elementCount,
        evidence.domSnapshot.interactiveElementCount,
        evidence.domSnapshot.extractionStrategy,
        evidence.confidence.score,
        evidence.confidence.basis,
        json(evidence),
        json(record.metadata ?? {}),
      ],
    );
  }

  private async replaceExecutionChildren(client: PostgresQueryable, runId: string): Promise<void> {
    await client.query("DELETE FROM runtime_components WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM runtime_design_tokens WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM runtime_accessibility_findings WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM runtime_screenshots WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM runtime_telemetry_events WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM runtime_governance_violations WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM governance_findings WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM verified_findings WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM analyzer_insights WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM execution_metrics WHERE run_id = $1", [runId]);
    await client.query("DELETE FROM governance_scores WHERE run_id = $1", [runId]);
  }

  private async insertRuntimeEvidenceChildren(client: PostgresQueryable, evidence: RuntimeEvidence): Promise<void> {
    const runId = evidence.execution.runId;

    for (const [index, component] of evidence.componentInventory.entries()) {
      await client.query(
        `
          INSERT INTO runtime_components (run_id, component_index, component_id, component_name, selector, component_data)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          runId,
          index,
          "id" in component ? component.id : null,
          "name" in component ? component.name : null,
          "selector" in component ? component.selector : null,
          json(component),
        ],
      );
    }

    for (const token of evidence.designTokens) {
      await client.query(
        `
          INSERT INTO runtime_design_tokens (run_id, token_name, token_value, category, source, token_data)
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [runId, token.name, token.value, token.category, token.source, json(token)],
      );
    }

    for (const finding of evidence.accessibilityFindings) {
      await client.query(
        `
          INSERT INTO runtime_accessibility_findings (run_id, finding_id, severity, finding_data)
          VALUES ($1, $2, $3, $4)
        `,
        [runId, "id" in finding ? finding.id : null, "severity" in finding ? finding.severity : null, json(finding)],
      );
    }

    for (const screenshot of evidence.screenshots) {
      await client.query(
        `
          INSERT INTO runtime_screenshots (run_id, screenshot_id, path, captured_at, viewport_width, viewport_height, full_page, screenshot_data)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          runId,
          screenshot.id,
          screenshot.path,
          screenshot.capturedAt,
          screenshot.viewport.width,
          screenshot.viewport.height,
          screenshot.fullPage,
          json(screenshot),
        ],
      );
    }

    for (const [index, event] of evidence.telemetry.entries()) {
      await client.query(
        `
          INSERT INTO runtime_telemetry_events (run_id, event_index, event_name, occurred_at, event_data)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          runId,
          index,
          "eventName" in event ? event.eventName : "type" in event ? event.type : null,
          "timestamp" in event ? event.timestamp : null,
          json(event),
        ],
      );
    }

    for (const violation of evidence.governanceViolations) {
      await client.query(
        `
          INSERT INTO runtime_governance_violations (
            run_id, violation_id, policy_id, severity, title, selector_hint, violation_data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [runId, violation.id, violation.policyId, violation.severity, violation.title, violation.selectorHint ?? null, json(violation)],
      );
    }
  }

  private async insertGovernanceFindings(
    client: PostgresQueryable,
    runId: string,
    findings: readonly GovernanceValidationFinding[],
  ): Promise<void> {
    for (const finding of findings) {
      await client.query(
        `
          INSERT INTO governance_findings (
            run_id, finding_id, policy, severity, route, component, expected, actual, confidence, evidence, finding_data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          runId,
          finding.id,
          finding.policy,
          finding.severity,
          finding.route,
          finding.component,
          finding.expected,
          finding.actual,
          finding.confidence,
          json(finding.evidence),
          json(finding),
        ],
      );
    }
  }

  private async insertVerifiedFindings(
    client: PostgresQueryable,
    runId: string,
    findings: readonly VerifiedFinding[],
  ): Promise<void> {
    for (const finding of findings) {
      await client.query(
        `
          INSERT INTO verified_findings (
            run_id,
            finding_id,
            original_finding_id,
            status,
            severity,
            route,
            component,
            expected,
            actual,
            confidence,
            evidence,
            integrity,
            reasons,
            finding_data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          runId,
          finding.id,
          finding.originalFindingId,
          finding.status,
          finding.severity,
          finding.route,
          finding.component,
          finding.expected,
          finding.actual,
          finding.confidence,
          json(finding.evidence),
          json(finding.integrity),
          finding.reasons,
          json(finding),
        ],
      );
    }
  }

  private async insertAnalyzerInsights(
    client: PostgresQueryable,
    runId: string,
    report: OperationalInsightsReport,
  ): Promise<void> {
    const insights = [
      ...report.recurringPatterns.map((insight) => ({
        insightId: insight.id,
        category: insight.category,
        summary: insight.summary,
        severity: null,
        confidence: insight.confidence,
        supportingFindingIds: [] as readonly string[],
        insightType: "recurring-pattern",
        data: insight,
      })),
      ...report.rootCauseSummaries.map((insight) => ({
        insightId: insight.id,
        category: "general",
        summary: insight.summary,
        severity: null,
        confidence: insight.confidence,
        supportingFindingIds: insight.supportingFindingIds,
        insightType: "root-cause",
        data: insight,
      })),
      ...report.routeClusters.map((insight) => ({
        insightId: `route:${insight.route}`,
        category: "route-hotspot",
        summary: `${insight.findingCount} findings on ${insight.route}`,
        severity: insight.criticalCount > 0 ? "critical" : insight.warningCount > 0 ? "medium" : "minor",
        confidence: 1,
        supportingFindingIds: [] as readonly string[],
        insightType: "route-cluster",
        data: insight,
      })),
      ...report.tokenDrift.map((insight) => ({
        insightId: `token-drift:${insight.tokenName}`,
        category: "token-drift",
        summary: `${insight.tokenName} drift affected ${insight.affectedComponents.length} components`,
        severity: null,
        confidence: 1,
        supportingFindingIds: [] as readonly string[],
        insightType: "token-drift",
        data: insight,
      })),
      ...report.componentMisuse.map((insight) => ({
        insightId: `component-misuse:${insight.component}`,
        category: "component-misuse",
        summary: `${insight.component} misuse appeared on ${insight.routes.length} routes`,
        severity: null,
        confidence: 1,
        supportingFindingIds: [] as readonly string[],
        insightType: "component-misuse",
        data: insight,
      })),
    ];

    for (const insight of insights) {
      await client.query(
        `
          INSERT INTO analyzer_insights (
            run_id,
            report_id,
            insight_id,
            insight_type,
            category,
            summary,
            severity,
            confidence,
            supporting_finding_ids,
            insight_data,
            report_data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          runId,
          report.reportId,
          insight.insightId,
          insight.insightType,
          insight.category,
          insight.summary,
          insight.severity,
          insight.confidence,
          insight.supportingFindingIds,
          json(insight.data),
          json(report),
        ],
      );
    }

    if (insights.length === 0) {
      await client.query(
        `
          INSERT INTO analyzer_insights (
            run_id, report_id, insight_id, insight_type, category, summary, severity, confidence,
            supporting_finding_ids, insight_data, report_data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          runId,
          report.reportId,
          `${report.reportId}:empty`,
          "report",
          "general",
          "No analyzer insights generated",
          null,
          1,
          [],
          json({ findingCount: report.findingCount }),
          json(report),
        ],
      );
    }
  }

  private async insertExecutionMetrics(
    client: PostgresQueryable,
    runId: string,
    metrics: readonly RuntimePipelineStageMetric[],
  ): Promise<void> {
    for (const metric of metrics) {
      await client.query(
        `
          INSERT INTO execution_metrics (
            run_id, stage, status, started_at, completed_at, duration_ms, attempts, error_message, metric_data
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          runId,
          metric.stage,
          metric.status,
          metric.startedAt,
          metric.completedAt,
          metric.durationMs,
          metric.attempts,
          metric.errorMessage ?? null,
          json(metric),
        ],
      );
    }
  }

  private async insertGovernanceScore(
    client: PostgresQueryable,
    runId: string,
    score: FindingsReportGovernanceScore,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO governance_scores (
          run_id,
          score,
          verified_finding_count,
          needs_review_finding_count,
          rejected_finding_count,
          score_data
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [
        runId,
        score.score,
        score.verifiedFindingCount,
        score.needsReviewFindingCount,
        score.rejectedFindingCount,
        json(score),
      ],
    );
  }
}

function json(value: unknown): JsonValue {
  return value === undefined ? null : (value as JsonValue);
}
