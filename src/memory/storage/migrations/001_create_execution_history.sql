CREATE TABLE IF NOT EXISTS governance_executions (
  run_id text PRIMARY KEY,
  correlation_id text NOT NULL,
  schema_version text NOT NULL,
  environment text NOT NULL,
  executor text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed', 'failed')),
  route_id text,
  route_target_url text NOT NULL,
  route_resolved_url text NOT NULL,
  route_title text NOT NULL,
  run_label text,
  started_at timestamptz NOT NULL,
  captured_at timestamptz NOT NULL,
  completed_at timestamptz,
  duration_ms integer,
  dom_captured_at timestamptz NOT NULL,
  dom_element_count integer NOT NULL,
  dom_interactive_element_count integer NOT NULL,
  dom_extraction_strategy text NOT NULL,
  confidence_score numeric(5, 4) NOT NULL,
  confidence_basis text NOT NULL,
  raw_evidence jsonb NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_executions_started_at
  ON governance_executions (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_executions_route
  ON governance_executions (route_target_url, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_governance_executions_route_id
  ON governance_executions (route_id, started_at DESC)
  WHERE route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_governance_executions_status
  ON governance_executions (status, started_at DESC);

CREATE TABLE IF NOT EXISTS runtime_components (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  component_index integer NOT NULL,
  component_id text,
  component_name text,
  selector text,
  component_data jsonb NOT NULL,
  UNIQUE (run_id, component_index)
);

CREATE INDEX IF NOT EXISTS idx_runtime_components_run_id
  ON runtime_components (run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_components_name
  ON runtime_components (component_name)
  WHERE component_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS runtime_design_tokens (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  token_name text NOT NULL,
  token_value text NOT NULL,
  category text NOT NULL,
  source text NOT NULL,
  token_data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_design_tokens_run_id
  ON runtime_design_tokens (run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_design_tokens_category
  ON runtime_design_tokens (category, token_name);

CREATE TABLE IF NOT EXISTS runtime_accessibility_findings (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  finding_id text,
  severity text,
  finding_data jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_accessibility_findings_run_id
  ON runtime_accessibility_findings (run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_accessibility_findings_severity
  ON runtime_accessibility_findings (severity)
  WHERE severity IS NOT NULL;

CREATE TABLE IF NOT EXISTS runtime_screenshots (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  screenshot_id text NOT NULL,
  path text NOT NULL,
  captured_at timestamptz NOT NULL,
  viewport_width integer NOT NULL,
  viewport_height integer NOT NULL,
  full_page boolean NOT NULL,
  screenshot_data jsonb NOT NULL,
  UNIQUE (run_id, screenshot_id)
);

CREATE INDEX IF NOT EXISTS idx_runtime_screenshots_run_id
  ON runtime_screenshots (run_id);

CREATE TABLE IF NOT EXISTS runtime_telemetry_events (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  event_index integer NOT NULL,
  event_name text,
  occurred_at timestamptz,
  event_data jsonb NOT NULL,
  UNIQUE (run_id, event_index)
);

CREATE INDEX IF NOT EXISTS idx_runtime_telemetry_events_run_id
  ON runtime_telemetry_events (run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_telemetry_events_name
  ON runtime_telemetry_events (event_name)
  WHERE event_name IS NOT NULL;

CREATE TABLE IF NOT EXISTS runtime_governance_violations (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  violation_id text NOT NULL,
  policy_id text NOT NULL,
  severity text NOT NULL,
  title text NOT NULL,
  selector_hint text,
  violation_data jsonb NOT NULL,
  UNIQUE (run_id, violation_id)
);

CREATE INDEX IF NOT EXISTS idx_runtime_governance_violations_run_id
  ON runtime_governance_violations (run_id);

CREATE INDEX IF NOT EXISTS idx_runtime_governance_violations_severity
  ON runtime_governance_violations (severity);

CREATE TABLE IF NOT EXISTS governance_findings (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  finding_id text NOT NULL,
  policy text NOT NULL,
  severity text NOT NULL,
  route text NOT NULL,
  component text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  confidence numeric(5, 4) NOT NULL,
  evidence jsonb NOT NULL,
  finding_data jsonb NOT NULL,
  UNIQUE (run_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_governance_findings_run_id
  ON governance_findings (run_id);

CREATE INDEX IF NOT EXISTS idx_governance_findings_route
  ON governance_findings (route, run_id);

CREATE INDEX IF NOT EXISTS idx_governance_findings_severity
  ON governance_findings (severity, run_id);

CREATE INDEX IF NOT EXISTS idx_governance_findings_policy
  ON governance_findings (policy, severity);

CREATE TABLE IF NOT EXISTS verified_findings (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  finding_id text NOT NULL,
  original_finding_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('verified', 'rejected', 'needs-review')),
  severity text NOT NULL,
  route text NOT NULL,
  component text NOT NULL,
  expected text NOT NULL,
  actual text NOT NULL,
  confidence numeric(5, 4) NOT NULL,
  evidence jsonb NOT NULL,
  integrity jsonb NOT NULL,
  reasons text[] NOT NULL,
  finding_data jsonb NOT NULL,
  UNIQUE (run_id, finding_id)
);

CREATE INDEX IF NOT EXISTS idx_verified_findings_run_id
  ON verified_findings (run_id);

CREATE INDEX IF NOT EXISTS idx_verified_findings_route
  ON verified_findings (route, run_id);

CREATE INDEX IF NOT EXISTS idx_verified_findings_status
  ON verified_findings (status, run_id);

CREATE INDEX IF NOT EXISTS idx_verified_findings_severity
  ON verified_findings (severity, run_id);

CREATE TABLE IF NOT EXISTS analyzer_insights (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  report_id text NOT NULL,
  insight_id text NOT NULL,
  insight_type text NOT NULL,
  category text NOT NULL,
  summary text NOT NULL,
  severity text,
  confidence numeric(5, 4) NOT NULL,
  supporting_finding_ids text[] NOT NULL,
  insight_data jsonb NOT NULL,
  report_data jsonb NOT NULL,
  UNIQUE (run_id, insight_id, insight_type)
);

CREATE INDEX IF NOT EXISTS idx_analyzer_insights_run_id
  ON analyzer_insights (run_id);

CREATE INDEX IF NOT EXISTS idx_analyzer_insights_category
  ON analyzer_insights (category, run_id);

CREATE INDEX IF NOT EXISTS idx_analyzer_insights_severity
  ON analyzer_insights (severity, run_id)
  WHERE severity IS NOT NULL;

CREATE TABLE IF NOT EXISTS execution_metrics (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  stage text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed', 'failed')),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  duration_ms integer NOT NULL,
  attempts integer NOT NULL,
  error_message text,
  metric_data jsonb NOT NULL,
  UNIQUE (run_id, stage, attempts)
);

CREATE INDEX IF NOT EXISTS idx_execution_metrics_run_id
  ON execution_metrics (run_id);

CREATE INDEX IF NOT EXISTS idx_execution_metrics_stage
  ON execution_metrics (stage, status);

CREATE TABLE IF NOT EXISTS governance_scores (
  run_id text PRIMARY KEY REFERENCES governance_executions(run_id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score >= 0 AND score <= 100),
  verified_finding_count integer NOT NULL,
  needs_review_finding_count integer NOT NULL,
  rejected_finding_count integer NOT NULL,
  score_data jsonb NOT NULL,
  scored_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_governance_scores_score
  ON governance_scores (score, scored_at DESC);

CREATE OR REPLACE VIEW governance_execution_records AS
SELECT
  e.run_id,
  e.correlation_id,
  e.raw_evidence,
  COALESCE(
    jsonb_agg(DISTINCT gf.finding_data) FILTER (WHERE gf.id IS NOT NULL),
    '[]'::jsonb
  ) AS governance_findings,
  COALESCE(
    jsonb_agg(DISTINCT vf.finding_data) FILTER (WHERE vf.id IS NOT NULL),
    '[]'::jsonb
  ) AS verified_findings,
  COALESCE(
    (SELECT ai.report_data FROM analyzer_insights ai WHERE ai.run_id = e.run_id ORDER BY ai.id LIMIT 1),
    '{
      "reportId": "missing",
      "generatedAt": "1970-01-01T00:00:00.000Z",
      "findingCount": 0,
      "clusters": [],
      "routeClusters": [],
      "recurringPatterns": [],
      "tokenDrift": [],
      "componentMisuse": [],
      "rootCauseSummaries": []
    }'::jsonb
  ) AS analyzer_insights,
  COALESCE(
    (SELECT jsonb_agg(em.metric_data ORDER BY em.started_at, em.id) FROM execution_metrics em WHERE em.run_id = e.run_id),
    '[]'::jsonb
  ) AS execution_metrics,
  gs.score_data AS governance_score_payload,
  e.metadata
FROM governance_executions e
LEFT JOIN governance_findings gf ON gf.run_id = e.run_id
LEFT JOIN verified_findings vf ON vf.run_id = e.run_id
LEFT JOIN governance_scores gs ON gs.run_id = e.run_id
GROUP BY e.run_id, gs.score_data;
