import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { ComponentFailureFrequency, MemoryExecutionSnapshot } from "./types.js";

const severityRank: Record<VerifiedFinding["severity"], number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

export class ComponentFailureFrequencyTracker {
  calculate(history: readonly MemoryExecutionSnapshot[]): readonly ComponentFailureFrequency[] {
    const grouped = new Map<
      string,
      {
        occurrenceCount: number;
        runIds: Set<string>;
        routes: Set<string>;
        highestSeverity: VerifiedFinding["severity"];
        latestSeenAt: string;
      }
    >();

    for (const snapshot of history) {
      for (const finding of snapshot.verifiedFindings.filter((item) => item.status !== "rejected")) {
        const existing =
          grouped.get(finding.component) ??
          ({
            occurrenceCount: 0,
            runIds: new Set<string>(),
            routes: new Set<string>(),
            highestSeverity: finding.severity,
            latestSeenAt: snapshot.metadata.startedAt,
          } satisfies {
            occurrenceCount: number;
            runIds: Set<string>;
            routes: Set<string>;
            highestSeverity: VerifiedFinding["severity"];
            latestSeenAt: string;
          });

        existing.occurrenceCount += 1;
        existing.runIds.add(snapshot.metadata.runId);
        existing.routes.add(finding.route);
        if (severityRank[finding.severity] > severityRank[existing.highestSeverity]) {
          existing.highestSeverity = finding.severity;
        }
        if (snapshot.metadata.startedAt > existing.latestSeenAt) {
          existing.latestSeenAt = snapshot.metadata.startedAt;
        }
        grouped.set(finding.component, existing);
      }
    }

    return [...grouped.entries()]
      .map(([component, value]) => ({
        component,
        occurrenceCount: value.occurrenceCount,
        affectedRunCount: value.runIds.size,
        affectedRoutes: [...value.routes].sort(),
        highestSeverity: value.highestSeverity,
        latestSeenAt: value.latestSeenAt,
      }))
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.component.localeCompare(b.component));
  }
}
