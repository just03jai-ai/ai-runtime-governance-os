import type { FindingsReport } from "./findings-report.js";

export class FindingsJsonReporter {
  render(report: FindingsReport): string {
    return `${JSON.stringify(report, null, 2)}\n`;
  }
}
