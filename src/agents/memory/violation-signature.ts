import type { VerifiedFinding } from "../verifier/verified-finding.js";

export function violationSignature(finding: VerifiedFinding): string {
  return [
    normalize(finding.route),
    normalize(finding.component),
    normalize(finding.severity),
    normalize(finding.expected),
    normalize(finding.actual),
  ].join("|");
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
