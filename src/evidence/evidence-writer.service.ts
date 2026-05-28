import { join } from "node:path";
import type { EvidenceBundle, GovernanceReport, ScreenshotEvidence } from "../contracts/evidence.js";
import type { RuntimeExecutionContext, RuntimeExecutionSummary } from "../contracts/execution.js";
import type { RuntimeComponentInventory, RuntimeDomSnapshot } from "../contracts/runtime.js";
import type { TelemetryEvent } from "../contracts/telemetry.js";
import { writeJsonFile } from "../shared/json-file.js";

export interface EvidenceWriteInput {
  readonly context: RuntimeExecutionContext;
  readonly evidenceDirectory: string;
  readonly screenshot?: ScreenshotEvidence;
  readonly domSnapshot: RuntimeDomSnapshot;
  readonly componentInventory: RuntimeComponentInventory;
  readonly telemetry: readonly TelemetryEvent[];
  readonly governanceReport: GovernanceReport;
  readonly summary: RuntimeExecutionSummary;
}

export class EvidenceWriterService {
  async writeBundle(input: EvidenceWriteInput): Promise<EvidenceBundle> {
    const bundle: EvidenceBundle = {
      context: input.context,
      ...(input.screenshot ? { screenshot: input.screenshot } : {}),
      domSnapshot: input.domSnapshot,
      componentInventory: input.componentInventory,
      telemetry: input.telemetry,
      governanceReport: input.governanceReport,
      summary: input.summary,
    };

    await Promise.all([
      writeJsonFile(join(input.evidenceDirectory, "context.json"), input.context),
      writeJsonFile(join(input.evidenceDirectory, "dom-snapshot.json"), input.domSnapshot),
      writeJsonFile(join(input.evidenceDirectory, "component-inventory.json"), input.componentInventory),
      writeJsonFile(join(input.evidenceDirectory, "telemetry.json"), input.telemetry),
      writeJsonFile(join(input.evidenceDirectory, "governance-report.json"), input.governanceReport),
      writeJsonFile(join(input.evidenceDirectory, "summary.json"), input.summary),
      writeJsonFile(join(input.evidenceDirectory, "evidence-bundle.json"), bundle),
    ]);

    return bundle;
  }
}
