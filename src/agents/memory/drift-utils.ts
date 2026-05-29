import type { VerifiedFinding } from "../verifier/verified-finding.js";
import type { DriftTrend, MemoryExecutionSnapshot } from "./types.js";

const tokenPattern = /[a-z]+(?:\.[a-zA-Z0-9_-]+)+/g;
const accessibilityPattern = /\b(a11y|accessibility|accessible|aria|label|role|keyboard|focus|contrast)\b/i;

export function activeFindings(snapshot: MemoryExecutionSnapshot): readonly VerifiedFinding[] {
  return snapshot.verifiedFindings.filter((finding) => finding.status !== "rejected");
}

export function tokenNamesForFinding(finding: VerifiedFinding): readonly string[] {
  return [...new Set(`${finding.expected} ${finding.actual}`.match(tokenPattern) ?? [])].sort();
}

export function isTokenFinding(finding: VerifiedFinding): boolean {
  return tokenNamesForFinding(finding).length > 0;
}

export function isAccessibilityFinding(finding: VerifiedFinding): boolean {
  const searchable = [
    finding.id,
    finding.originalFindingId,
    finding.component,
    finding.expected,
    finding.actual,
    ...finding.reasons,
    ...Object.values(finding.evidence).map((value) => String(value)),
  ].join(" ");

  return accessibilityPattern.test(searchable);
}

export function calculateTrend(values: readonly number[]): DriftTrend {
  if (values.length === 0) {
    return { direction: "insufficient-data" };
  }

  const firstValue = values[0] as number;
  const currentValue = values[values.length - 1] as number;
  const previousValue = values.length > 1 ? values[values.length - 2] : undefined;
  const deltaFromPrevious = previousValue === undefined ? undefined : currentValue - previousValue;
  const deltaFromBaseline = currentValue - firstValue;

  return {
    direction: direction(deltaFromPrevious),
    firstValue,
    ...(previousValue === undefined ? {} : { previousValue }),
    currentValue,
    ...(deltaFromPrevious === undefined ? {} : { deltaFromPrevious }),
    deltaFromBaseline,
  };
}

export function scoreTrend(values: readonly number[]): DriftTrend {
  const trend = calculateTrend(values);
  if (trend.direction === "increasing") {
    return { ...trend, direction: "decreasing" };
  }
  if (trend.direction === "decreasing") {
    return { ...trend, direction: "increasing" };
  }
  return trend;
}

export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function direction(delta: number | undefined): DriftTrend["direction"] {
  if (delta === undefined) {
    return "insufficient-data";
  }
  if (delta > 0) {
    return "increasing";
  }
  if (delta < 0) {
    return "decreasing";
  }
  return "stable";
}
