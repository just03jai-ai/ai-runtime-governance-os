import { resolve } from "node:path";
import { ExecutionAgent } from "../agents/execution-agent.js";
import type { RuntimeExecutionRequest } from "../contracts/execution.js";
import { EvidenceWriterService } from "../evidence/evidence-writer.service.js";
import { RuntimeExtractionService } from "../runtime/runtime-extraction.service.js";
import { ScreenshotService } from "../runtime/screenshot.service.js";
import { TelemetryService } from "../telemetry/telemetry-service.js";

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
  evidenceWriter: new EvidenceWriterService(),
  evidenceRoot: resolve("artifacts", "evidence"),
});

const bundle = await agent.execute(request);

console.log(
  JSON.stringify(
    {
      runId: bundle.summary.runId,
      status: bundle.summary.status,
      evidenceDirectory: bundle.summary.evidenceDirectory,
      componentCount: bundle.summary.componentCount,
    },
    null,
    2,
  ),
);
