import type { GovernanceScoreTrend, MemoryExecutionSnapshot } from "./types.js";

export class GovernanceScoreTrendEngine {
  calculate(history: readonly MemoryExecutionSnapshot[]): GovernanceScoreTrend {
    const points = history
      .filter((snapshot) => snapshot.metadata.governanceScore !== undefined)
      .sort((a, b) => a.metadata.startedAt.localeCompare(b.metadata.startedAt))
      .map((snapshot) => ({
        runId: snapshot.metadata.runId,
        route: snapshot.metadata.route,
        startedAt: snapshot.metadata.startedAt,
        score: snapshot.metadata.governanceScore as number,
      }));

    const current = points[points.length - 1];
    const previous = points[points.length - 2];
    const average =
      points.length > 0 ? Math.round(points.reduce((total, point) => total + point.score, 0) / points.length) : undefined;
    const delta = current && previous ? current.score - previous.score : undefined;

    return {
      points,
      ...(current ? { currentScore: current.score } : {}),
      ...(previous ? { previousScore: previous.score } : {}),
      ...(delta === undefined ? {} : { delta }),
      ...(average === undefined ? {} : { averageScore: average }),
      direction: directionForDelta(delta),
    };
  }
}

function directionForDelta(delta: number | undefined): GovernanceScoreTrend["direction"] {
  if (delta === undefined) {
    return "insufficient-data";
  }

  if (delta > 0) {
    return "improving";
  }

  if (delta < 0) {
    return "regressing";
  }

  return "stable";
}
