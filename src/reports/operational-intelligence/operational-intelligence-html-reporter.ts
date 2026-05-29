import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OperationalIntelligenceReport } from "./operational-intelligence-report.js";
import { OperationalIntelligenceHtmlRenderer } from "./operational-intelligence-html-renderer.js";

export class OperationalIntelligenceHtmlReporter {
  constructor(private readonly renderer = new OperationalIntelligenceHtmlRenderer()) {}

  async write(report: OperationalIntelligenceReport, outputDirectory: string): Promise<string> {
    await mkdir(outputDirectory, { recursive: true });
    const outputPath = join(outputDirectory, "operational-intelligence.html");
    await writeFile(outputPath, this.renderer.render(report), "utf8");
    return outputPath;
  }
}
