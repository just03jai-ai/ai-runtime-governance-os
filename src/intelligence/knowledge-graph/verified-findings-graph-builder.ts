import type { VerifiedFinding } from "../../agents/verifier/verified-finding.js";
import { buildGraph, graphEdgeId, graphNodeId } from "./graph-utils.js";
import type { GovernanceKnowledgeGraph, GovernanceKnowledgeGraphEdge, GovernanceKnowledgeGraphNode } from "./types.js";

export interface VerifiedFindingsGraphBuilderOptions {
  readonly releaseId?: string | undefined;
  readonly generatedAt?: string | undefined;
}

export class VerifiedFindingsGraphBuilder {
  build(
    findings: readonly VerifiedFinding[],
    options: VerifiedFindingsGraphBuilderOptions = {},
  ): GovernanceKnowledgeGraph {
    const activeFindings = findings.filter((finding) => finding.status !== "rejected");
    const routeNodes = [...new Set(activeFindings.map((finding) => finding.route))].map((route) => ({
      id: graphNodeId("route", route),
      type: "route" as const,
      label: route,
      route,
    }));
    const componentNodes = [...new Map(activeFindings.map((finding) => [finding.component, finding])).values()].map(
      (finding) => ({
        id: graphNodeId("component", finding.component),
        type: "component" as const,
        label: componentLabel(finding),
        componentId: finding.component,
        componentName: componentLabel(finding),
        metadata: {
          evidence: finding.evidence,
        },
      }),
    );
    const findingNodes = activeFindings.map((finding) => ({
      id: graphNodeId("finding", finding.id),
      type: "finding" as const,
      label: finding.id,
      findingId: finding.id,
      severity: finding.severity,
      status: finding.status,
      expected: finding.expected,
      actual: finding.actual,
      metadata: {
        confidence: finding.confidence,
        integrity: finding.integrity,
        reasons: finding.reasons,
      },
    }));
    const policyNodes = [...new Set(activeFindings.map(policyIdForFinding))].map((policyId) => ({
      id: graphNodeId("policy", policyId),
      type: "policy" as const,
      label: policyId,
      policyId,
    }));
    const releaseNodes: GovernanceKnowledgeGraphNode[] = options.releaseId
      ? [
          {
            id: graphNodeId("release", options.releaseId),
            type: "release",
            label: options.releaseId,
            releaseId: options.releaseId,
          },
        ]
      : [];
    const edges: GovernanceKnowledgeGraphEdge[] = [
      ...activeFindings.map((finding) => ({
        id: graphEdgeId("route_contains_component", graphNodeId("route", finding.route), graphNodeId("component", finding.component)),
        type: "route_contains_component" as const,
        from: graphNodeId("route", finding.route),
        to: graphNodeId("component", finding.component),
      })),
      ...activeFindings.map((finding) => ({
        id: graphEdgeId("finding_affects_component", graphNodeId("finding", finding.id), graphNodeId("component", finding.component)),
        type: "finding_affects_component" as const,
        from: graphNodeId("finding", finding.id),
        to: graphNodeId("component", finding.component),
      })),
      ...activeFindings.map((finding) => ({
        id: graphEdgeId("policy_validates_component", graphNodeId("policy", policyIdForFinding(finding)), graphNodeId("component", finding.component)),
        type: "policy_validates_component" as const,
        from: graphNodeId("policy", policyIdForFinding(finding)),
        to: graphNodeId("component", finding.component),
      })),
      ...(options.releaseId
        ? routeNodes.map((route) => {
            const routeFindings = activeFindings.filter((finding) => finding.route === route.route);
            return {
              id: graphEdgeId("release_contains_route", graphNodeId("release", options.releaseId!), route.id),
              type: "release_contains_route" as const,
              from: graphNodeId("release", options.releaseId!),
              to: route.id,
              metadata: {
                findingCount: routeFindings.length,
                criticalCount: routeFindings.filter((finding) => finding.severity === "critical").length,
                warningCount: routeFindings.filter((finding) => finding.severity === "warning").length,
                infoCount: routeFindings.filter((finding) => finding.severity === "info").length,
              },
            };
          })
        : []),
    ];

    return buildGraph({
      graphId: `verified-findings:${options.releaseId ?? "adhoc"}`,
      generatedAt: options.generatedAt,
      nodes: [...releaseNodes, ...routeNodes, ...componentNodes, ...findingNodes, ...policyNodes],
      edges,
    });
  }
}

function componentLabel(finding: VerifiedFinding): string {
  const evidenceName = finding.evidence.componentName;
  return typeof evidenceName === "string" && evidenceName.trim().length > 0 ? evidenceName : finding.component;
}

function policyIdForFinding(finding: VerifiedFinding): string {
  const parts = finding.id.split(":").filter(Boolean);
  if (parts.length >= 3) {
    return parts.at(-2) ?? finding.originalFindingId;
  }
  return finding.originalFindingId || finding.id;
}
