import type { SeverityLevel } from "./severity.js";

export interface AnalyzerInsight {
  readonly id: string;
  readonly category: "token-drift" | "component-misuse" | "accessibility" | "route-hotspot" | "general";
  readonly summary: string;
  readonly severity?: SeverityLevel | undefined;
  readonly supportingFindingIds: readonly string[];
  readonly confidence: number;
}
