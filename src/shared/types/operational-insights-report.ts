import type { SeverityLevel } from "./severity.js";

export interface FindingCluster {
  readonly id: string;
  readonly key: string;
  readonly findingIds: readonly string[];
  readonly count: number;
  readonly severity: SeverityLevel;
}

export interface RouteCluster {
  readonly route: string;
  readonly findingCount: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly infoCount: number;
}

export interface OperationalPattern {
  readonly id: string;
  readonly category: "token-drift" | "component-misuse" | "accessibility" | "route-hotspot" | "general";
  readonly summary: string;
  readonly findingCount: number;
  readonly confidence: number;
}

export interface TokenDriftInsight {
  readonly tokenName: string;
  readonly occurrenceCount: number;
  readonly affectedComponents: readonly string[];
}

export interface ComponentMisuseInsight {
  readonly component: string;
  readonly occurrenceCount: number;
  readonly routes: readonly string[];
}

export interface RootCauseSummary {
  readonly id: string;
  readonly summary: string;
  readonly supportingFindingIds: readonly string[];
  readonly confidence: number;
}

export interface OperationalInsightsReport {
  readonly reportId: string;
  readonly generatedAt: string;
  readonly findingCount: number;
  readonly clusters: readonly FindingCluster[];
  readonly routeClusters: readonly RouteCluster[];
  readonly recurringPatterns: readonly OperationalPattern[];
  readonly tokenDrift: readonly TokenDriftInsight[];
  readonly componentMisuse: readonly ComponentMisuseInsight[];
  readonly rootCauseSummaries: readonly RootCauseSummary[];
}
