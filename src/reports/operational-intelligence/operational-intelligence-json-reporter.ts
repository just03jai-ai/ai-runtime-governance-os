import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OperationalIntelligenceReport } from "./operational-intelligence-report.js";

export class OperationalIntelligenceJsonReporter {
  async write(report: OperationalIntelligenceReport, outputDirectory: string): Promise<string> {
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = join(outputDirectory, "operational-intelligence.json");
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return outputPath;
  }
}
