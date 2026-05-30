# Skill Architecture Framework

AI Runtime Governance OS uses deterministic, evidence-backed skills for runtime governance, operational intelligence, design-system analysis, release decisioning, and governance planning. This framework defines ownership boundaries so the platform can scale without adding overlapping agents.

## Agent Skill Matrix

| Agent | Purpose | Core Skills | Inputs | Outputs | Dependencies | Success Metrics | Failure Conditions | Expansion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ExecutionAgent` | Collect normalized runtime evidence. | Runtime capture, DOM extraction, screenshot capture, telemetry, evidence validation. | `RuntimeExecutionRequest`. | `RuntimeEvidence`. | Playwright, runtime extraction, screenshot, telemetry, normalizer, evidence writer. | Valid evidence, screenshot captured, component inventory present, bounded duration. | Browser launch/navigation failure, invalid evidence, filesystem write failure. | Auth flows, multi-viewport capture, network controls, route groups. |
| `GovernanceAgent` | Validate runtime evidence against governance contracts. | Contract loading, policy execution, deterministic finding generation. | `RuntimeEvidence`, contracts or contracts directory. | `GovernanceValidationFinding[]`. | Contract loader, governance pipeline executor. | Contract coverage, stable finding IDs, actionable findings. | Missing contracts, malformed contracts, policy execution failure. | Registry-derived policies, policy lifecycle, exception handling. |
| `VerifierAgent` | Verify and score governance findings. | Evidence integrity, confidence scoring, duplicate suppression, status classification. | Governance findings, optional runtime evidence. | `VerifierAgentResult`. | Verifier pipeline executor, scoring service. | Verified ratio, confidence consistency, rejected false positives. | Missing evidence, weak confidence, duplicate ambiguity. | Human review state, audit trail, reviewer feedback loops. |
| `AnalyzerAgent` | Summarize verified findings into operational insight. | Finding clustering, route clustering, token drift summaries, component misuse summaries, recurring pattern summaries. | `VerifiedFinding[]`. | `OperationalInsightsReport`. | Analyzer services. | Low-noise summaries, useful clusters, route/component clarity. | Empty findings, duplicate summaries, over-broad root-cause claims. | Narrow ownership to finding summarization only. |
| `MemoryAgent` | Persist and analyze historical governance memory. | Snapshot storage, recurrence detection, regression detection, score trends, route history, component failure frequency. | Verified findings, execution metadata. | `HistoricalInsights`. | Historical memory repository. | Trend accuracy, recurrence detection, repository reliability. | Missing history, repository failure, inconsistent run metadata. | Retention policy, workspace-aware history, historical baselines. |
| `MonitoringAgent` | Aggregate governance health and operational stability. | Health scoring, severity distribution, route health, reliability scoring, trend summaries, observability signals. | Historical executions, execution metrics, optional drift analysis. | `MonitoringInsights`. | Historical snapshots, drift analysis, execution metrics. | Health score stability, route risk accuracy, metric completeness. | Insufficient data, malformed metrics, missing drift inputs. | Alerting, SLOs, external metrics sinks. |
| `DesignerAgent` | Analyze visual governance and design-system consistency. | Typography, spacing, token adoption, hierarchy, design-system compliance. | Governance graph, component health, route health. | `DesignerInsightsReport`. | Knowledge graph, component intelligence, route intelligence. | Evidence-backed findings, visual governance score, token coverage. | Sparse graph, missing token evidence, unsupported design semantics. | Figma alignment, design review workflows, registry promotion. |
| `FrontendAgent` | Analyze implementation quality and design-system adoption. | Component misuse, variant misuse, token misuse, implementation risk. | Governance graph. | `FrontendInsightsReport`. | Knowledge graph. | Contract misuse accuracy, high-risk component detection. | Ambiguous component mapping, missing graph edges, sparse token evidence. | PR annotations, code ownership mapping, migration guidance. |
| `TesterAgent` | Identify testing gaps and interaction risks. | State coverage, interaction coverage, accessibility scenario coverage, edge-case discovery, risk prioritization. | Governance graph, runtime evidence. | `TestingInsightsReport`. | Runtime evidence, knowledge graph, scenario engine. | Scenario usefulness, high-risk coverage, evidence links. | Missing telemetry, no runtime components, graph mismatch. | Playwright scenario export, test coverage dashboards. |
| `PMAgent` | Translate governance intelligence into stakeholder and release communication. | Release risk communication, prioritization summary, business impact summary, readiness summary, stakeholder reporting. | Release readiness, root cause report, prioritized remediation plan. | `PMInsightsReport`. | Readiness, root cause, prioritization. | Clear decision narrative, stakeholder-ready summaries. | Duplicating release decision logic, unsupported business claims. | Approval summaries, executive dashboards, exception communication. |
| `PlannerAgent` | Generate governance execution strategy. | Route prioritization, audit prioritization, governance scheduling, resource allocation. | Monitoring, history, release readiness, prioritized remediation. | `ExecutionPlan`. | Monitoring, memory, readiness, prioritization. | Sequenced plan, owner hints, capacity-aware schedule. | Re-ranking conflicts, weak capacity data, duplicated PM summaries. | Sprint planning integration, owner assignment, workflow export. |
| `SimulationAgent` | Forecast governance outcomes from simulations. | Release forecasting, regression forecasting, drift forecasting, governance risk forecasting. | Simulation report, historical insights. | `SimulationInsights`. | Simulation engine, memory. | Forecast confidence, evidence linkage, risk explanation. | Sparse history, speculative confidence, no impact estimates. | Scenario comparison, what-if release planning. |

## Platform Shared Skills

| Skill Name | Description | Required Inputs | Generated Outputs | Related Agents | Dependencies | Maturity |
| --- | --- | --- | --- | --- | --- | --- |
| Runtime Intelligence | Converts a live route into normalized runtime evidence. | URL, viewport, environment. | DOM snapshot, screenshot, telemetry, component inventory. | `ExecutionAgent`. | Playwright, runtime schemas. | Intermediate |
| Governance Intelligence | Validates evidence against contracts and policy rules. | Runtime evidence, contracts, policies. | Findings, governance score signals. | `GovernanceAgent`, `VerifierAgent`. | Contracts, policy engine, verifier. | Intermediate |
| Knowledge Graph Intelligence | Normalizes governance relationships across routes, components, tokens, findings, policies, screenshots, and releases. | Runtime evidence, verified findings. | `GovernanceKnowledgeGraph`. | Designer, Frontend, Tester. | Graph builders, graph repositories. | Basic |
| Reporting Intelligence | Converts findings and insights into JSON, HTML, dashboard, and operational reports. | Findings, evidence, insights, metrics. | Findings report, dashboard report, operational intelligence report. | Analyzer, PM. | Report engines, renderers. | Intermediate |
| Release Intelligence | Determines release readiness from score, drift, monitoring, and prioritized remediation. | Governance score, drift analysis, monitoring insights, remediation plan. | `ReleaseReadinessReport`. | PM, Planner. | Scoring, monitoring, prioritization. | Advanced |
| Simulation Intelligence | Estimates governance impact of proposed token, component, policy, and release changes. | Graph, history, registry, proposed changes. | Simulation report, forecasts. | `SimulationAgent`. | Simulation engine, memory. | Intermediate |
| Monitoring Intelligence | Tracks governance health, severity trends, route health, and execution reliability. | Historical executions, metrics, drift analysis. | `MonitoringInsights`. | `MonitoringAgent`. | Memory, metrics. | Intermediate |
| Design System Intelligence | Keeps components, variants, states, tokens, accessibility requirements, and ownership metadata aligned. | Registry, graph, findings. | Registry contracts, design/frontend insights. | Designer, Frontend, Governance. | Design System Registry, graph. | Intermediate |

## Skill Dependency Graph

```text
Runtime Intelligence
  -> Governance Intelligence
    -> Verification Skill
      -> Reporting Intelligence
      -> Memory Intelligence
        -> Drift Intelligence
        -> Monitoring Intelligence
          -> Release Intelligence
            -> PM Communication Skill
            -> Planner Execution Strategy

Runtime Intelligence
  -> Knowledge Graph Intelligence
    -> Component Intelligence
    -> Route Intelligence
    -> Design System Intelligence
      -> DesignerAgent
      -> FrontendAgent
      -> TesterAgent

Knowledge Graph + Historical Memory + Design System Registry
  -> Simulation Intelligence
    -> SimulationAgent Forecasting
      -> Release Intelligence
      -> PlannerAgent
```

## Capability Map

| Platform Capability | Owning Skill | Primary Owner | Supporting Owners |
| --- | --- | --- | --- |
| Runtime evidence collection | Runtime Intelligence | `ExecutionAgent` | Monitoring |
| Contract validation | Governance Intelligence | `GovernanceAgent` | Verifier |
| Finding verification | Verification Skill | `VerifierAgent` | Analyzer |
| Historical memory | Memory Intelligence | `MemoryAgent` | Monitoring |
| Drift analysis | Operational Intelligence | `MemoryAgent` | Monitoring |
| Governance health | Monitoring Intelligence | `MonitoringAgent` | Release readiness |
| Root cause analysis | Root Cause Skill | `RootCauseAnalysisEngine` | Analyzer |
| Remediation ranking | Prioritization Skill | `PrioritizationEngine` | Planner |
| Release gate | Release Intelligence | `ReleaseReadinessEngine` | PM, Planner |
| Stakeholder reporting | Reporting Intelligence | `PMAgent` | Release readiness |
| Execution planning | Planning Skill | `PlannerAgent` | Monitoring |
| Impact prediction | Simulation Intelligence | `SimulationAgent` | Governance simulation engine |
| Design-system compliance | Design System Intelligence | `DesignerAgent` | Frontend |
| Implementation risk | Frontend Governance Skill | `FrontendAgent` | Designer |
| Testing gap analysis | Testing Intelligence | `TesterAgent` | Frontend |

## Ownership Boundaries

- `AnalyzerAgent` summarizes verified findings; it should not own systemic root cause decisions.
- `RootCauseAnalysisEngine` owns component, token, route, release, and policy root causes.
- `PrioritizationEngine` owns remediation ranking and impact scoring.
- `RemediationRecommendationEngine` owns deterministic fix guidance.
- `ReleaseReadinessEngine` owns go, conditional-go, and no-go decisions.
- `PMAgent` communicates decisions; it should not create release decisions.
- `PlannerAgent` sequences execution; it should not independently redefine remediation priority.
- `SimulationAgent` forecasts from simulation outputs; it should not invent proposed changes.
- `DesignerAgent` owns UX/design-system consistency.
- `FrontendAgent` owns implementation and contract misuse.
- `TesterAgent` owns coverage gaps and scenario risk.

## Enterprise Maturity Model

| Level | Name | Required Capability | Current Fit |
| --- | --- | --- | --- |
| Level 1 | Runtime Collection | Capture DOM, screenshots, telemetry, normalized evidence. | Mostly present |
| Level 2 | Governance Validation | Contracts, policy checks, verified findings, scoring. | Present |
| Level 3 | Operational Intelligence | History, monitoring, drift, route/component intelligence. | Partially integrated |
| Level 4 | Decision Intelligence | Release readiness, prioritization, remediation, PM/planner workflows. | Built but not fully productized |
| Level 5 | Predictive Governance | Simulation, forecasting, what-if impact, trend prediction. | Early stage |

## Roadmap

### Missing Skills

- Workspace/project skill for project boundaries, route groups, environments, and ownership.
- Policy lifecycle skill for draft, active, deprecated, exception, and approval states.
- Audit log skill for immutable governance event history.
- Evidence explorer skill for screenshots, DOM, graph, findings, and contracts.
- RBAC skill for viewer, auditor, governance admin, release approver, and platform admin roles.
- Benchmark skill for duration, memory, graph size, finding volume, and route throughput.

### Redundant Skills

- Analyzer root cause summaries overlap with root cause analysis.
- PM prioritization summaries overlap with prioritization.
- Planner route scoring overlaps with monitoring and route intelligence.
- Designer and Frontend both touch token misuse; Designer should own design consistency, Frontend should own implementation misuse.

### Consolidation Opportunities

- Centralize severity, score, confidence, average, clamp, and trend utilities.
- Create one shared evidence reference model used by all reports.
- Create one canonical `GovernanceRun` artifact containing evidence, findings, graph, scores, monitoring, readiness, remediation, and reports.
- Move dashboard skill definitions into a reusable capability registry.
- Productize the existing intelligence modules before adding agents.

### Future Enterprise Skills

- Approval workflow skill.
- Exception management skill.
- Policy versioning skill.
- Multi-project governance skill.
- Compliance export skill.
- Release gate enforcement skill.
- Ownership and escalation skill.
- Observability and SLO skill.
