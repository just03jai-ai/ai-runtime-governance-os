import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { MemoryExecutionSnapshot, ViolationRecurrence } from "./types.js";
import { violationSignature } from "./violation-signature.js";

export class ViolationRecurrenceEngine {
  findRecurringViolations(
    currentFindings: readonly VerifiedFinding[],
    history: readonly MemoryExecutionSnapshot[],
    recurrenceThreshold = 2,
  ): readonly ViolationRecurrence[] {
    const currentSignatures = new Map<string, string[]>();
    for (const finding of currentFindings) {
      const signature = violationSignature(finding);
      currentSignatures.set(signature, [...(currentSignatures.get(signature) ?? []), finding.id]);
    }

    const grouped = new Map<
      string,
      {
        route: string;
        component: string;
        severity: VerifiedFinding["severity"];
        runIds: Set<string>;
        seenAt: string[];
      }
    >();

    for (const snapshot of history) {
      for (const finding of activeFindings(snapshot.verifiedFindings)) {
        const signature = violationSignature(finding);
        if (!currentSignatures.has(signature)) {
          continue;
        }

        const existing =
          grouped.get(signature) ??
          ({
            route: finding.route,
            component: finding.component,
            severity: finding.severity,
            runIds: new Set<string>(),
            seenAt: [],
          } satisfies {
            route: string;
            component: string;
            severity: VerifiedFinding["severity"];
            runIds: Set<string>;
            seenAt: string[];
          });

        existing.runIds.add(snapshot.metadata.runId);
        existing.seenAt.push(snapshot.metadata.startedAt);
        grouped.set(signature, existing);
      }
    }

    return [...grouped.entries()]
      .filter(([, value]) => value.runIds.size >= recurrenceThreshold)
      .map(([signature, value]) => {
        const sortedSeenAt = [...value.seenAt].sort();
        return {
          signature,
          route: value.route,
          component: value.component,
            severity: value.severity,
          occurrenceCount: value.runIds.size,
          affectedRunIds: [...value.runIds].sort(),
          firstSeenAt: sortedSeenAt[0] ?? "",
          lastSeenAt: sortedSeenAt[sortedSeenAt.length - 1] ?? "",
          currentFindingIds: currentSignatures.get(signature) ?? [],
        };
      })
      .sort((a, b) => b.occurrenceCount - a.occurrenceCount || a.signature.localeCompare(b.signature));
  }
}

function activeFindings(findings: readonly VerifiedFinding[]): readonly VerifiedFinding[] {
  return findings.filter((finding) => finding.status !== "rejected");
}
