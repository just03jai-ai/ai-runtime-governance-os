# ai-runtime-governance-os
AI Runtime Governance OS is an AI-native operational governance platform that continuously inspects, validates, verifies, analyzes, and monitors production UI systems using runtime evidence, governance contracts, and design-system intelligence to deliver continuous operational observability and release confidence.

## Runtime infrastructure

This scaffold implements the first operational runtime layer only:

- `src/agents/execution` contains the `ExecutionAgent` skeleton that orchestrates one runtime inspection.
- `src/agents/governance`, `src/agents/verifier`, and `src/agents/analyzer` are reserved for future agent implementations.
- `src/runtime/extraction` contains Playwright-backed DOM extraction services.
- `src/runtime/evidence` captures screenshots and writes validated `runtime-evidence.json` artifacts to `artifacts/evidence/<run-id>/`.
- `src/runtime/telemetry` records observable execution events.
- `src/runtime/normalization` is reserved for runtime normalization services.
- `src/shared/types/runtime-evidence.ts` and `src/shared/schemas/runtime-evidence.schema.ts` define the canonical normalized runtime evidence output.
- `src/governance/contracts` contains strongly typed execution, runtime, evidence, and telemetry contracts.
- `src/governance/policies`, `src/governance/severity`, and `src/governance/validation` are reserved for future governance infrastructure.
- `src/governance/contracts/*.contract.json` contains approved design-system governance contracts.
- `src/governance/validation` validates normalized runtime evidence against governance contracts and returns deterministic findings.
- `src/agents/governance` contains `GovernanceAgent`, a deterministic policy engine over normalized runtime evidence.
- `src/agents/verifier` contains `VerifierAgent`, a deterministic verification layer for governance findings.
- `src/agents/analyzer` contains `AnalyzerAgent`, deterministic operational intelligence over verified findings.
- `src/reports/findings` generates structured JSON reports and static HTML summaries from verified findings.
- `src/reports/findings` is reserved for future finding builders; runtime execution does not generate mock reports.
- `src/shared/types`, `src/shared/utils`, and `src/shared/schemas` contain platform-level shared primitives and barrel exports.
- `src/shared/logger` contains vendor-neutral structured JSON logging with correlation IDs, route tracking, timing, and agent scope.
- `src/dashboard/routes` contains the starter runtime dashboard route contract.
- `src/orchestration` contains an example execution flow.
- `src/orchestration/runtime-pipeline-orchestrator.ts` coordinates the explicit operational runtime pipeline.

No AI evaluation or autonomous multi-agent behavior is implemented yet.
Execution writes validated `runtime-evidence.json` artifacts instead of mock governance reports.

## Commands

```bash
npm run build
npm run execute:example
```

Use `TARGET_URL` to inspect a specific page:

```bash
TARGET_URL="https://example.com" npm run execute:example
```
