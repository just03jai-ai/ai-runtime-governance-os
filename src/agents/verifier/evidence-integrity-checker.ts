import type { GovernanceValidationFinding } from "../../governance/validation/governance-finding.js";
import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import type { EvidenceIntegrityResult } from "./verified-finding.js";

export class EvidenceIntegrityChecker {
  check(finding: GovernanceValidationFinding, evidence?: RuntimeEvidence): EvidenceIntegrityResult {
    if (!evidence) {
      return {
        hasComponentEvidence: false,
        hasDomEvidence: false,
        hasScreenshotEvidence: false,
        routeMatches: false,
      };
    }

    const component = evidence.componentInventory.find((item) => item.id === finding.component);
    const findingSelector = typeof finding.evidence.selectorHint === "string" ? finding.evidence.selectorHint : null;
    const hasDomEvidence =
      component !== undefined &&
      (findingSelector === null || component.selectorHint === findingSelector);

    return {
      hasComponentEvidence: component !== undefined || finding.component.length > 0,
      hasDomEvidence,
      hasScreenshotEvidence: evidence.screenshots.length > 0,
      routeMatches: evidence.route.resolvedUrl === finding.route,
    };
  }
}
