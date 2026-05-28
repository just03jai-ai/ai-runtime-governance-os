import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import type {
  FindingsReportEvidenceReference,
  FindingsReportRouteSummary,
  FindingsReportSeveritySummary,
  ReportSeverityBucket,
} from "./findings-report.js";

export class FindingsAggregationService {
  bucketFor(finding: VerifiedFinding): ReportSeverityBucket {
    if (finding.severity === "critical") {
      return "critical";
    }

    if (finding.severity === "warning") {
      return "medium";
    }

    return "minor";
  }

  byBucket(findings: readonly VerifiedFinding[], bucket: ReportSeverityBucket): readonly VerifiedFinding[] {
    return findings.filter((finding) => this.bucketFor(finding) === bucket);
  }

  severitySummary(findings: readonly VerifiedFinding[]): FindingsReportSeveritySummary {
    const critical = this.byBucket(findings, "critical").length;
    const medium = this.byBucket(findings, "medium").length;
    const minor = this.byBucket(findings, "minor").length;

    return {
      critical,
      medium,
      minor,
      total: findings.length,
    };
  }

  routeSummaries(findings: readonly VerifiedFinding[]): readonly FindingsReportRouteSummary[] {
    const byRoute = new Map<string, VerifiedFinding[]>();

    for (const finding of findings) {
      byRoute.set(finding.route, [...(byRoute.get(finding.route) ?? []), finding]);
    }

    return [...byRoute.entries()]
      .map(([route, routeFindings]) => ({
        route,
        findingCount: routeFindings.length,
        criticalCount: this.byBucket(routeFindings, "critical").length,
        mediumCount: this.byBucket(routeFindings, "medium").length,
        minorCount: this.byBucket(routeFindings, "minor").length,
      }))
      .sort((left, right) => right.findingCount - left.findingCount || left.route.localeCompare(right.route));
  }

  evidenceReferences(findings: readonly VerifiedFinding[]): readonly FindingsReportEvidenceReference[] {
    return findings.map((finding) => ({
      findingId: finding.id,
      component: finding.component,
      route: finding.route,
      evidence: finding.evidence,
    }));
  }
}
