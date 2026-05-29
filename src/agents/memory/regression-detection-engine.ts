import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { MemoryExecutionSnapshot, RegressionFinding } from "./types.js";
import { violationSignature } from "./violation-signature.js";

export class RegressionDetectionEngine {
  detect(
    currentSnapshot: MemoryExecutionSnapshot,
    previousSnapshots: readonly MemoryExecutionSnapshot[],
  ): readonly RegressionFinding[] {
    const currentFindings = currentSnapshot.verifiedFindings.filter((finding) => finding.status !== "rejected");
    const routeHistory = previousSnapshots
      .filter((snapshot) => snapshot.metadata.route === currentSnapshot.metadata.route)
      .sort((a, b) => b.metadata.startedAt.localeCompare(a.metadata.startedAt));
    const latestRouteSnapshot = routeHistory[0];

    const latestRouteSignatures = new Set(
      latestRouteSnapshot?.verifiedFindings
        .filter((finding) => finding.status !== "rejected")
        .map((finding) => violationSignature(finding)) ?? [],
    );

    const historicalBySignature = new Map<string, MemoryExecutionSnapshot[]>();
    for (const snapshot of routeHistory.slice(1)) {
      for (const finding of snapshot.verifiedFindings.filter((item) => item.status !== "rejected")) {
        const signature = violationSignature(finding);
        historicalBySignature.set(signature, [...(historicalBySignature.get(signature) ?? []), snapshot]);
      }
    }

    return currentFindings
      .filter((finding) => !latestRouteSignatures.has(violationSignature(finding)))
      .map((finding) => this.toRegression(finding, latestRouteSnapshot, historicalBySignature.get(violationSignature(finding))))
      .sort((a, b) => a.signature.localeCompare(b.signature));
  }

  private toRegression(
    finding: VerifiedFinding,
    latestRouteSnapshot: MemoryExecutionSnapshot | undefined,
    olderMatches: readonly MemoryExecutionSnapshot[] | undefined,
  ): RegressionFinding {
    const latestOlderMatch = [...(olderMatches ?? [])].sort((a, b) =>
      b.metadata.startedAt.localeCompare(a.metadata.startedAt),
    )[0];
    return {
      signature: violationSignature(finding),
      findingId: finding.id,
      route: finding.route,
      component: finding.component,
      severity: finding.severity,
      regressionType: latestOlderMatch ? "returned-after-clean-run" : "new-violation",
      ...(latestRouteSnapshot ? { previousCleanRunId: latestRouteSnapshot.metadata.runId } : {}),
      ...(latestOlderMatch ? { lastSeenRunId: latestOlderMatch.metadata.runId } : {}),
    };
  }
}
