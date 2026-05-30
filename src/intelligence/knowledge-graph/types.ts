import type { SeverityLevel } from "../../shared/types/severity.js";

export type GovernanceKnowledgeGraphNodeType =
  | "route"
  | "component"
  | "design-token"
  | "finding"
  | "policy"
  | "screenshot"
  | "release";

export type GovernanceKnowledgeGraphRelationshipType =
  | "route_contains_component"
  | "component_uses_token"
  | "finding_affects_component"
  | "policy_validates_component"
  | "release_contains_route";

export interface GovernanceKnowledgeGraphNodeBase {
  readonly id: string;
  readonly type: GovernanceKnowledgeGraphNodeType;
  readonly label: string;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface RouteGraphNode extends GovernanceKnowledgeGraphNodeBase {
  readonly type: "route";
  readonly route: string;
  readonly routeId?: string | undefined;
  readonly title?: string | undefined;
}

export interface ComponentGraphNode extends GovernanceKnowledgeGraphNodeBase {
  readonly type: "component";
  readonly componentId: string;
  readonly componentName: string;
  readonly tagName?: string | undefined;
  readonly role?: string | null | undefined;
  readonly selectorHint?: string | undefined;
}

export interface DesignTokenGraphNode extends GovernanceKnowledgeGraphNodeBase {
  readonly type: "design-token";
  readonly tokenName: string;
  readonly category: string;
  readonly value?: string | undefined;
}

export interface FindingGraphNode extends GovernanceKnowledgeGraphNodeBase {
  readonly type: "finding";
  readonly findingId: string;
  readonly severity: SeverityLevel;
  readonly status?: string | undefined;
  readonly expected: string;
  readonly actual: string;
}

export interface PolicyGraphNode extends GovernanceKnowledgeGraphNodeBase {
  readonly type: "policy";
  readonly policyId: string;
}

export interface ScreenshotGraphNode extends GovernanceKnowledgeGraphNodeBase {
  readonly type: "screenshot";
  readonly screenshotId: string;
  readonly path: string;
  readonly capturedAt: string;
}

export interface ReleaseGraphNode extends GovernanceKnowledgeGraphNodeBase {
  readonly type: "release";
  readonly releaseId: string;
  readonly runId?: string | undefined;
  readonly startedAt?: string | undefined;
}

export type GovernanceKnowledgeGraphNode =
  | RouteGraphNode
  | ComponentGraphNode
  | DesignTokenGraphNode
  | FindingGraphNode
  | PolicyGraphNode
  | ScreenshotGraphNode
  | ReleaseGraphNode;

export interface GovernanceKnowledgeGraphEdge {
  readonly id: string;
  readonly type: GovernanceKnowledgeGraphRelationshipType;
  readonly from: string;
  readonly to: string;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface GovernanceKnowledgeGraph {
  readonly graphId: string;
  readonly generatedAt: string;
  readonly nodes: readonly GovernanceKnowledgeGraphNode[];
  readonly edges: readonly GovernanceKnowledgeGraphEdge[];
}

export interface GovernanceKnowledgeGraphQuery {
  readonly nodeType?: GovernanceKnowledgeGraphNodeType | undefined;
  readonly relationshipType?: GovernanceKnowledgeGraphRelationshipType | undefined;
  readonly nodeId?: string | undefined;
}

export interface GovernanceKnowledgeGraphRepository {
  save(graph: GovernanceKnowledgeGraph): Promise<void>;
  load(graphId: string): Promise<GovernanceKnowledgeGraph | undefined>;
  query(query?: GovernanceKnowledgeGraphQuery): Promise<GovernanceKnowledgeGraph>;
}
