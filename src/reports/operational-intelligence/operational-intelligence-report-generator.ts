import type { OperationalIntelligenceReportInput } from "./operational-intelligence-report.js";
import { buildOperationalIntelligenceReport } from "./operational-intelligence-report.js";
import { OperationalIntelligenceHtmlReporter } from "./operational-intelligence-html-reporter.js";
import { OperationalIntelligenceJsonReporter } from "./operational-intelligence-json-reporter.js";

export interface OperationalIntelligenceReportGeneratorOptions {
  readonly outputDirectory?: string | undefined;
}

export class OperationalIntelligenceReportGenerator {
  constructor(
    private readonly jsonReporter = new OperationalIntelligenceJsonReporter(),
    private readonly htmlReporter = new OperationalIntelligenceHtmlReporter(),
    private readonly options: OperationalIntelligenceReportGeneratorOptions = {},
  ) {}

  async generate(input: OperationalIntelligenceReportInput): Promise<{
    readonly jsonPath: string;
    readonly htmlPath: string;
  }> {
    const outputDirectory = this.options.outputDirectory ?? "reports/operational-intelligence";
    const report = buildOperationalIntelligenceReport(input);
    const [jsonPath, htmlPath] = await Promise.all([
      this.jsonReporter.write(report, outputDirectory),
      this.htmlReporter.write(report, outputDirectory),
    ]);
    return { jsonPath, htmlPath };
  }
}
