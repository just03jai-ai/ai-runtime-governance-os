import type { MemoryExecutionSnapshot, RouteHistoryInsight, ViolationRecurrence } from "./types.js";

export class RouteHistoryAnalysis {
  analyze(
    history: readonly MemoryExecutionSnapshot[],
    recurringViolations: readonly ViolationRecurrence[],
  ): readonly RouteHistoryInsight[] {
    const grouped = new Map<string, MemoryExecutionSnapshot[]>();
    for (const snapshot of history) {
      grouped.set(snapshot.metadata.route, [...(grouped.get(snapshot.metadata.route) ?? []), snapshot]);
    }

    return [...grouped.entries()]
      .map(([route, snapshots]) => {
        const sorted = [...snapshots].sort((a, b) => b.metadata.startedAt.localeCompare(a.metadata.startedAt));
        const latest = sorted[0];
        const scores = sorted
          .map((snapshot) => snapshot.metadata.governanceScore)
          .filter((score): score is number => score !== undefined);
        const averageScore =
          scores.length > 0 ? Math.round(scores.reduce((total, score) => total + score, 0) / scores.length) : undefined;

        return {
          route,
          ...(latest?.metadata.routeId ? { routeId: latest.metadata.routeId } : {}),
          executionCount: snapshots.length,
          latestRunId: latest?.metadata.runId ?? "",
          latestStartedAt: latest?.metadata.startedAt ?? "",
          ...(averageScore === undefined ? {} : { averageGovernanceScore: averageScore }),
          totalVerifiedFindings: snapshots.reduce((total, snapshot) => {
            return total + snapshot.verifiedFindings.filter((finding) => finding.status !== "rejected").length;
          }, 0),
          recurringViolationCount: recurringViolations.filter((violation) => violation.route === route).length,
        };
      })
      .sort((a, b) => b.executionCount - a.executionCount || a.route.localeCompare(b.route));
  }
}
