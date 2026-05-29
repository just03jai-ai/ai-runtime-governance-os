CREATE TABLE IF NOT EXISTS memory_execution_snapshots (
  run_id text PRIMARY KEY,
  route text NOT NULL,
  route_id text,
  environment text,
  status text,
  governance_score integer CHECK (governance_score IS NULL OR (governance_score >= 0 AND governance_score <= 100)),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_execution_snapshots_started_at
  ON memory_execution_snapshots (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_execution_snapshots_route
  ON memory_execution_snapshots (route, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_memory_execution_snapshots_route_id
  ON memory_execution_snapshots (route_id, started_at DESC)
  WHERE route_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memory_execution_snapshots_score
  ON memory_execution_snapshots (governance_score, started_at DESC)
  WHERE governance_score IS NOT NULL;

CREATE TABLE IF NOT EXISTS memory_verified_findings (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES memory_execution_snapshots(run_id) ON DELETE CASCADE,
  finding_id text NOT NULL,
  original_finding_id text NOT NULL,
  violation_signature text NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_memory_verified_findings_run_id
  ON memory_verified_findings (run_id);

CREATE INDEX IF NOT EXISTS idx_memory_verified_findings_signature
  ON memory_verified_findings (violation_signature, run_id);

CREATE INDEX IF NOT EXISTS idx_memory_verified_findings_route
  ON memory_verified_findings (route, run_id);

CREATE INDEX IF NOT EXISTS idx_memory_verified_findings_component
  ON memory_verified_findings (component, run_id);

CREATE INDEX IF NOT EXISTS idx_memory_verified_findings_severity
  ON memory_verified_findings (severity, run_id);
