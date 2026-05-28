import { join } from "node:path";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import { writeJsonFile } from "../../shared/utils/json-file.js";

export interface EvidenceWriteInput {
  readonly evidenceDirectory: string;
  readonly evidence: RuntimeEvidence;
}

export class EvidenceWriterService {
  async writeRuntimeEvidence(input: EvidenceWriteInput): Promise<RuntimeEvidence> {
    await writeJsonFile(join(input.evidenceDirectory, "runtime-evidence.json"), input.evidence);
    return input.evidence;
  }
}
