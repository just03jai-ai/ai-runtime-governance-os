import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { VerifiedFinding } from "../../src/agents/verifier/verified-finding.js";
import {
  FileGovernanceKnowledgeGraphRepository,
  GovernanceKnowledgeGraphQueryEngine,
  InMemoryGovernanceKnowledgeGraphRepository,
  RuntimeEvidenceGraphBuilder,
  VerifiedFindingsGraphBuilder,
  mergeGraphs,
} from "../../src/intelligence/knowledge-graph/index.js";
import { mockRuntimeEvidence } from "../fixtures/runtime-evidence.fixture.js";

let tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  tempDirectories = [];
});

describe("Governance Knowledge Graph", () => {
  it("builds a queryable graph from runtime evidence", () => {
    const graph = new RuntimeEvidenceGraphBuilder().build(mockRuntimeEvidence, {
      releaseId: "release-2026-05-29",
      generatedAt: "2026-05-29T00:00:00.000Z",
    });
    const query = new GovernanceKnowledgeGraphQueryEngine(graph);

    expect(graph.nodes.map((node) => node.type)).toEqual(
      expect.arrayContaining(["route", "component", "design-token", "screenshot", "release"]),
    );
    expect(graph.edges.map((edge) => edge.type)).toEqual(
      expect.arrayContaining(["release_contains_route", "route_contains_component", "component_uses_token"]),
    );
    expect(query.componentsForRoute("https://example.test/checkout")[0]).toEqual(
      expect.objectContaining({
        componentId: "component-button-primary",
        componentName: "Button",
      }),
    );
    expect(query.tokensForComponent("component-button-primary")[0]).toEqual(
      expect.objectContaining({
        tokenName: "font.body",
      }),
    );
    expect(query.routesForRelease("release-2026-05-29")[0]).toEqual(
      expect.objectContaining({
        route: "https://example.test/checkout",
      }),
    );
  });

  it("builds finding, component, route, and policy relationships from verified findings", () => {
    const finding = verifiedFinding();
    const graph = new VerifiedFindingsGraphBuilder().build([finding], {
      releaseId: "release-001",
      generatedAt: "2026-05-29T00:00:00.000Z",
    });
    const query = new GovernanceKnowledgeGraphQueryEngine(graph);

    expect(graph.nodes.map((node) => node.type)).toEqual(
      expect.arrayContaining(["route", "component", "finding", "policy", "release"]),
    );
    expect(graph.edges.map((edge) => edge.type)).toEqual(
      expect.arrayContaining(["finding_affects_component", "policy_validates_component", "release_contains_route"]),
    );
    expect(query.findingsForComponent("Button")).toEqual([
      expect.objectContaining({
        findingId: "verified:runtime-001:core.token-drift:Button",
        severity: "warning",
      }),
    ]);
  });

  it("stores and queries graphs through repository adapters", async () => {
    const runtimeGraph = new RuntimeEvidenceGraphBuilder().build(mockRuntimeEvidence, { releaseId: "release-001" });
    const findingsGraph = new VerifiedFindingsGraphBuilder().build([verifiedFinding()], { releaseId: "release-001" });
    const graph = mergeGraphs("governance-graph:release-001", [runtimeGraph, findingsGraph], "2026-05-29T00:00:00.000Z");
    const memoryRepository = new InMemoryGovernanceKnowledgeGraphRepository();

    await memoryRepository.save(graph);
    expect(await memoryRepository.load("governance-graph:release-001")).toEqual(graph);
    expect((await memoryRepository.query({ nodeType: "component" })).nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "component" })]),
    );

    const directory = await mkdtemp(join(tmpdir(), "kg-"));
    tempDirectories.push(directory);
    const fileRepository = new FileGovernanceKnowledgeGraphRepository(directory);
    await fileRepository.save(graph);

    expect(await fileRepository.load("governance-graph:release-001")).toEqual(graph);
    expect((await fileRepository.query({ relationshipType: "route_contains_component" })).edges).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "route_contains_component" })]),
    );
  });
});

function verifiedFinding(): VerifiedFinding {
  return {
    id: "verified:runtime-001:core.token-drift:Button",
    originalFindingId: "original:runtime-001:core.token-drift:Button",
    status: "verified",
    severity: "warning",
    route: "https://example.test/checkout",
    component: "Button",
    evidence: {
      componentName: "Button",
      componentId: "component-button-primary",
    },
    expected: "color.action.primary.background token",
    actual: "missing token evidence",
    confidence: 0.9,
    integrity: {
      hasComponentEvidence: true,
      hasDomEvidence: true,
      hasScreenshotEvidence: true,
      routeMatches: true,
    },
    reasons: [],
  };
}
