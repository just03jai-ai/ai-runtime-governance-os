import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { OperationalPattern, RouteCluster, TokenDriftInsight } from "./operational-insights-report.js";

export class PatternAnalysisService {
  analyze(input: {
    readonly findings: readonly VerifiedFinding[];
    readonly routeClusters: readonly RouteCluster[];
    readonly tokenDrift: readonly TokenDriftInsight[];
  }): readonly OperationalPattern[] {
    const patterns: OperationalPattern[] = [];
    const accessibilityFindings = input.findings.filter((finding) =>
      `${finding.expected} ${finding.actual}`.toLowerCase().includes("accessible"),
    );

    const topToken = input.tokenDrift[0];
    if (topToken) {
      patterns.push({
        id: "pattern-token-drift",
        category: "token-drift",
        summary: `Design token drift detected around ${topToken.tokenName}.`,
        findingCount: topToken.occurrenceCount,
        confidence: 1,
      });
    }

    if (accessibilityFindings.length > 0) {
      patterns.push({
        id: "pattern-accessibility",
        category: "accessibility",
        summary: "Accessibility evidence gaps recur across verified findings.",
        findingCount: accessibilityFindings.length,
        confidence: this.averageConfidence(accessibilityFindings),
      });
    }

    const hotspot = input.routeClusters[0];
    if (hotspot && hotspot.findingCount > 1) {
      patterns.push({
        id: "pattern-route-hotspot",
        category: "route-hotspot",
        summary: `Route ${hotspot.route} concentrates ${hotspot.findingCount} verified findings.`,
        findingCount: hotspot.findingCount,
        confidence: 1,
      });
    }

    return patterns;
  }

  private averageConfidence(findings: readonly VerifiedFinding[]): number {
    return Number((findings.reduce((total, finding) => total + finding.confidence, 0) / findings.length).toFixed(2));
  }
}
