import type { RuntimeEvidenceSeverity } from "../../shared/types/runtime-evidence.js";

const severityRank: Record<RuntimeEvidenceSeverity, number> = {
  info: 1,
  warning: 2,
  critical: 3,
};

export function highestSeverity(severities: readonly RuntimeEvidenceSeverity[]): RuntimeEvidenceSeverity {
  return severities.reduce<RuntimeEvidenceSeverity>(
    (highest, severity) => (severityRank[severity] > severityRank[highest] ? severity : highest),
    "info",
  );
}

export function severityWeight(severity: RuntimeEvidenceSeverity): number {
  return severityRank[severity];
}
