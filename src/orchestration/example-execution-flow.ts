import { resolve } from "node:path";
import { ExecutionAgent } from "../agents/execution/execution-agent.js";
import type { RuntimeExecutionRequest } from "../governance/contracts/execution.js";
import { EvidenceWriterService } from "../runtime/evidence/evidence-writer.service.js";
import { ScreenshotService } from "../runtime/evidence/screenshot.service.js";
import { RuntimeExtractionService } from "../runtime/extraction/runtime-extraction.service.js";
import { RuntimeEvidenceNormalizerService } from "../runtime/normalization/runtime-evidence-normalizer.service.js";
import { TelemetryService } from "../runtime/telemetry/telemetry-service.js";
import { createAgentLogger } from "../shared/logger/index.js";

const request: RuntimeExecutionRequest = {
  targetUrl: process.env.TARGET_URL ?? "https://example.com",
  environment: "local",
  viewport: {
    width: 1366,
    height: 768,
  },
  runLabel: "example-runtime-execution",
};

const agent = new ExecutionAgent({
  telemetry: new TelemetryService(),
  runtimeExtraction: new RuntimeExtractionService(),
  screenshot: new ScreenshotService(),
  evidenceNormalizer: new RuntimeEvidenceNormalizerService(),
  evidenceWriter: new EvidenceWriterService(),
  evidenceRoot: resolve("artifacts", "evidence"),
  logger: createAgentLogger("ExecutionAgent"),
});

const evidence = await agent.execute(request);

console.log(
  JSON.stringify(
    {
      runId: evidence.execution.runId,
      status: evidence.execution.status,
      schemaVersion: evidence.schemaVersion,
      componentCount: evidence.componentInventory.length,
      screenshotCount: evidence.screenshots.length,
    },
    null,
    2,
  ),
);
