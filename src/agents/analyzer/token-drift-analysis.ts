import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { TokenDriftInsight } from "./operational-insights-report.js";

const tokenPattern = /[a-z]+(?:\.[a-zA-Z0-9_-]+)+/g;

export class TokenDriftAnalysisService {
  analyze(findings: readonly VerifiedFinding[]): readonly TokenDriftInsight[] {
    const tokenMap = new Map<string, Set<string>>();

    for (const finding of findings) {
      const tokenNames = `${finding.expected} ${finding.actual}`.match(tokenPattern) ?? [];

      for (const tokenName of tokenNames) {
        tokenMap.set(tokenName, new Set([...(tokenMap.get(tokenName) ?? []), finding.component]));
      }
    }

    return [...tokenMap.entries()]
      .map(([tokenName, components]) => ({
        tokenName,
        occurrenceCount: findings.filter((finding) => `${finding.expected} ${finding.actual}`.includes(tokenName))
          .length,
        affectedComponents: [...components].sort(),
      }))
      .sort((left, right) => right.occurrenceCount - left.occurrenceCount || left.tokenName.localeCompare(right.tokenName));
  }
}
