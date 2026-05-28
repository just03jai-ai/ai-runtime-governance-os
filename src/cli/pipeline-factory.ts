import { resolve } from "node:path";
import { AnalyzerAgent } from "../agents/analyzer/analyzer-agent.js";
import { ExecutionAgent } from "../agents/execution/execution-agent.js";
import { GovernanceAgent } from "../agents/governance/governance-agent.js";
import { VerifierAgent } from "../agents/verifier/verifier-agent.js";
import type { AppConfig, RouteConfig } from "../config/app-config.js";
import type { RuntimeExecutionRequest } from "../governance/contracts/execution.js";
import { RuntimePipelineOrchestrator } from "../orchestration/runtime-pipeline-orchestrator.js";
import { FindingsReportEngine } from "../reports/findings/findings-report-engine.js";
import { EvidenceWriterService } from "../runtime/evidence/evidence-writer.service.js";
import { ScreenshotService } from "../runtime/evidence/screenshot.service.js";
import { RuntimeExtractionService } from "../runtime/extraction/runtime-extraction.service.js";
import { RuntimeEvidenceNormalizerService } from "../runtime/normalization/runtime-evidence-normalizer.service.js";
import { TelemetryService } from "../runtime/telemetry/telemetry-service.js";
import { createCliLogger } from "./cli-logger.js";

export function createRuntimePipeline(config: AppConfig, options: { readonly verbose: boolean }): RuntimePipelineOrchestrator {
  return new RuntimePipelineOrchestrator(
    {
      executionAgent: new ExecutionAgent({
        telemetry: new TelemetryService(),
        runtimeExtraction: new RuntimeExtractionService(),
        screenshot: new ScreenshotService(),
        evidenceNormalizer: new RuntimeEvidenceNormalizerService(),
        evidenceWriter: new EvidenceWriterService(),
        evidenceRoot: config.screenshots.outputDirectory,
        logger: createCliLogger("ExecutionAgent", options.verbose),
      }),
      governanceAgent: new GovernanceAgent({ logger: createCliLogger("GovernanceAgent", options.verbose) }),
      verifierAgent: new VerifierAgent({ logger: createCliLogger("VerifierAgent", options.verbose) }),
      findingsEngine: new FindingsReportEngine(),
      analyzerAgent: new AnalyzerAgent({ logger: createCliLogger("AnalyzerAgent", options.verbose) }),
    },
    createCliLogger("RuntimePipelineOrchestrator", options.verbose),
  );
}

export function createExecutionRequest(config: AppConfig, route: RouteConfig): RuntimeExecutionRequest {
  return {
    targetUrl: route.targetUrl,
    environment: config.execution.environment,
    viewport: {
      width: config.execution.viewport.width,
      height: config.execution.viewport.height,
      ...(config.execution.viewport.deviceScaleFactor === undefined
        ? {}
        : { deviceScaleFactor: config.execution.viewport.deviceScaleFactor }),
    },
    ...(route.runLabel ? { runLabel: route.runLabel } : {}),
    timeoutMs: config.execution.timeoutMs,
  };
}

export function resolveContractsDirectory(flagValue?: string): string {
  return resolve(flagValue ?? "src/governance/contracts");
}
