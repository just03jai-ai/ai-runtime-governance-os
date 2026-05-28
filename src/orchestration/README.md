# Orchestration

Explicit operational pipelines live here.

`RuntimePipelineOrchestrator` coordinates fixed stages in order:

1. `ExecutionAgent`
2. `GovernanceAgent`
3. `VerifierAgent`
4. `FindingsReportEngine`
5. `AnalyzerAgent`

The orchestrator passes typed outputs between stages, records stage metrics, supports deterministic retries, and emits structured execution traces. It does not implement autonomous agent communication.
