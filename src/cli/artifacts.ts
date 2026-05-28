import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { RuntimeEvidence } from "../shared/types/runtime-evidence.js";
import type { GovernanceValidationFinding } from "../governance/validation/governance-finding.js";
import type { VerifiedFinding } from "../agents/verifier/verified-finding.js";
import type { FindingsReport } from "../reports/findings/findings-report.js";
import { FindingsHtmlReporter, FindingsJsonReporter } from "../reports/findings/index.js";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function findLatestRuntimeEvidence(evidenceRoot: string): Promise<string> {
  const entries = await readdir(evidenceRoot, { withFileTypes: true });
  const candidates = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const evidencePath = join(evidenceRoot, entry.name, "runtime-evidence.json");
        try {
          const fileStat = await stat(evidencePath);
          return { evidencePath, mtimeMs: fileStat.mtimeMs };
        } catch {
          return undefined;
        }
      }),
  );

  const latest = candidates
    .filter((candidate): candidate is { evidencePath: string; mtimeMs: number } => candidate !== undefined)
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0];

  if (!latest) {
    throw new Error(`No runtime-evidence.json files found in ${evidenceRoot}.`);
  }

  return latest.evidencePath;
}

export async function loadRuntimeEvidence(filePath: string): Promise<RuntimeEvidence> {
  return readJsonFile<RuntimeEvidence>(filePath);
}

export async function loadGovernanceFindings(filePath: string): Promise<readonly GovernanceValidationFinding[]> {
  return readJsonFile<GovernanceValidationFinding[]>(filePath);
}

export async function loadVerifiedFindings(filePath: string): Promise<readonly VerifiedFinding[]> {
  return readJsonFile<VerifiedFinding[]>(filePath);
}

export async function writeFindingsReportArtifacts(input: {
  readonly report: FindingsReport;
  readonly outputDirectory: string;
  readonly writeJson: boolean;
  readonly writeHtml: boolean;
}): Promise<readonly string[]> {
  await mkdir(input.outputDirectory, { recursive: true });
  const paths: string[] = [];
  const safeRunId = input.report.executionSummary.runId.replaceAll(/[^a-zA-Z0-9._-]/g, "_");

  if (input.writeJson) {
    const jsonPath = join(input.outputDirectory, `${safeRunId}.findings-report.json`);
    await writeFile(jsonPath, new FindingsJsonReporter().render(input.report), "utf8");
    paths.push(jsonPath);
  }

  if (input.writeHtml) {
    const htmlPath = join(input.outputDirectory, `${safeRunId}.findings-report.html`);
    await writeFile(htmlPath, new FindingsHtmlReporter().render(input.report), "utf8");
    paths.push(htmlPath);
  }

  return paths;
}
