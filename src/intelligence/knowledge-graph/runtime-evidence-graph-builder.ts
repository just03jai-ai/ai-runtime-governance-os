import type { RuntimeEvidence } from "../../shared/types/runtime-evidence.js";
import { buildGraph, graphEdgeId, graphNodeId } from "./graph-utils.js";
import type { GovernanceKnowledgeGraph, GovernanceKnowledgeGraphEdge, GovernanceKnowledgeGraphNode } from "./types.js";

export interface RuntimeEvidenceGraphBuilderOptions {
  readonly releaseId?: string | undefined;
  readonly generatedAt?: string | undefined;
}

export class RuntimeEvidenceGraphBuilder {
  build(evidence: RuntimeEvidence, options: RuntimeEvidenceGraphBuilderOptions = {}): GovernanceKnowledgeGraph {
    const routeId = graphNodeId("route", evidence.route.resolvedUrl || evidence.route.targetUrl);
    const releaseId = graphNodeId("release", options.releaseId ?? evidence.execution.runId);
    const nodes: GovernanceKnowledgeGraphNode[] = [
      {
        id: releaseId,
        type: "release",
        label: options.releaseId ?? evidence.execution.runId,
        releaseId: options.releaseId ?? evidence.execution.runId,
        runId: evidence.execution.runId,
        startedAt: evidence.timestamps.startedAt,
        metadata: {
          environment: evidence.execution.environment,
          status: evidence.execution.status,
        },
      },
      {
        id: routeId,
        type: "route",
        label: evidence.route.title || evidence.route.resolvedUrl || evidence.route.targetUrl,
        route: evidence.route.resolvedUrl || evidence.route.targetUrl,
        ...(evidence.route.routeId ? { routeId: evidence.route.routeId } : {}),
        title: evidence.route.title,
        metadata: {
          targetUrl: evidence.route.targetUrl,
          runLabel: evidence.route.runLabel,
        },
      },
      ...evidence.componentInventory.map((component) => ({
        id: graphNodeId("component", component.id),
        type: "component" as const,
        label: component.name,
        componentId: component.id,
        componentName: component.name,
        tagName: component.tagName,
        role: component.role,
        selectorHint: component.selectorHint,
        metadata: {
          visible: component.visible,
          attributes: component.attributes,
          boundingBox: component.boundingBox,
        },
      })),
      ...evidence.designTokens.map((token) => ({
        id: graphNodeId("token", token.name),
        type: "design-token" as const,
        label: token.name,
        tokenName: token.name,
        category: token.category,
        value: token.value,
        metadata: {
          source: token.source,
        },
      })),
      ...evidence.screenshots.map((screenshot) => ({
        id: graphNodeId("screenshot", `${evidence.execution.runId}:${screenshot.id}`),
        type: "screenshot" as const,
        label: screenshot.id,
        screenshotId: screenshot.id,
        path: screenshot.path,
        capturedAt: screenshot.capturedAt,
        metadata: {
          viewport: screenshot.viewport,
          fullPage: screenshot.fullPage,
        },
      })),
      ...evidence.governanceViolations.map((violation) => ({
        id: graphNodeId("policy", violation.policyId),
        type: "policy" as const,
        label: violation.policyId,
        policyId: violation.policyId,
        metadata: {
          title: violation.title,
          severity: violation.severity,
        },
      })),
    ];

    const componentIds = evidence.componentInventory.map((component) => graphNodeId("component", component.id));
    const tokenIds = evidence.designTokens.map((token) => graphNodeId("token", token.name));
    const edges: GovernanceKnowledgeGraphEdge[] = [
      {
        id: graphEdgeId("release_contains_route", releaseId, routeId),
        type: "release_contains_route",
        from: releaseId,
        to: routeId,
      },
      ...componentIds.map((componentId) => ({
        id: graphEdgeId("route_contains_component", routeId, componentId),
        type: "route_contains_component" as const,
        from: routeId,
        to: componentId,
      })),
      ...componentIds.flatMap((componentId) =>
        tokenIds.map((tokenId) => ({
          id: graphEdgeId("component_uses_token", componentId, tokenId),
          type: "component_uses_token" as const,
          from: componentId,
          to: tokenId,
          metadata: {
            inferred: true,
          },
        })),
      ),
      ...policyValidationEdges(evidence, componentIds),
    ];

    return buildGraph({
      graphId: `runtime-evidence:${evidence.execution.runId}`,
      generatedAt: options.generatedAt,
      nodes,
      edges,
    });
  }
}

function policyValidationEdges(evidence: RuntimeEvidence, componentIds: readonly string[]): GovernanceKnowledgeGraphEdge[] {
  return evidence.governanceViolations.flatMap((violation) => {
    const policyId = graphNodeId("policy", violation.policyId);
    const matchedComponents = evidence.componentInventory
      .filter((component) => {
        if (!violation.selectorHint) {
          return false;
        }
        return (
          component.selectorHint.includes(violation.selectorHint) ||
          violation.selectorHint.includes(component.selectorHint)
        );
      })
      .map((component) => graphNodeId("component", component.id));
    const targets = matchedComponents.length > 0 ? matchedComponents : componentIds;

    return targets.map((componentId) => ({
      id: graphEdgeId("policy_validates_component", policyId, componentId),
      type: "policy_validates_component" as const,
      from: policyId,
      to: componentId,
      metadata: {
        inferred: matchedComponents.length === 0,
      },
    }));
  });
}
