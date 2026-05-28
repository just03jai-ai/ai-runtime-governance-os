import type { GovernanceValidationFinding } from "../../governance/validation/governance-finding.js";

export interface DeduplicatedFinding {
  readonly finding: GovernanceValidationFinding;
  readonly duplicateCount: number;
}

export class DuplicateSuppressionService {
  suppress(findings: readonly GovernanceValidationFinding[]): readonly DeduplicatedFinding[] {
    const grouped = new Map<string, DeduplicatedFinding>();

    for (const finding of findings) {
      const key = this.keyFor(finding);
      const existing = grouped.get(key);

      if (existing) {
        grouped.set(key, {
          finding: existing.finding.confidence >= finding.confidence ? existing.finding : finding,
          duplicateCount: existing.duplicateCount + 1,
        });
        continue;
      }

      grouped.set(key, {
        finding,
        duplicateCount: 1,
      });
    }

    return [...grouped.values()];
  }

  private keyFor(finding: GovernanceValidationFinding): string {
    return [finding.policy, finding.route, finding.component, finding.expected, finding.actual].join("|");
  }
}
