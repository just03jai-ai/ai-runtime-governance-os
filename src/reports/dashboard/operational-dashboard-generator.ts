import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { OperationalDashboardInput } from "./operational-dashboard.js";
import { buildOperationalDashboardModel } from "./operational-dashboard.js";
import { OperationalDashboardHtmlRenderer } from "./operational-dashboard-html-renderer.js";

export interface OperationalDashboardGeneratorOptions {
  readonly outputDirectory?: string | undefined;
}

export class OperationalDashboardGenerator {
  constructor(
    private readonly renderer = new OperationalDashboardHtmlRenderer(),
    private readonly options: OperationalDashboardGeneratorOptions = {},
  ) {}

  async generate(input: OperationalDashboardInput): Promise<string> {
    const outputDirectory = this.options.outputDirectory ?? "reports/dashboard";
    const outputPath = join(outputDirectory, "index.html");
    const model = buildOperationalDashboardModel(input);
    const html = this.renderer.render(model);

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(outputPath, html, "utf8");

    return outputPath;
  }
}
