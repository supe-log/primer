import { describe, expect, it } from "vitest";
import { CompilationResult, type CurriculumGraph } from "@contracts";
import { findCycle, validateGraph } from "../server/compiler/validators/graph";
import { auditGraphWithRepair, repairGraph } from "../server/compiler/stages/graphAuditor";
import compilationResult from "../fixtures/compilation-result.json";

const sample = CompilationResult.parse(compilationResult);
const graph = sample.graph!;

function withCycles(count: number): CurriculumGraph {
  const extras = graph.knowledgeComponents.slice(0, count * 2);
  const edges = [...graph.prerequisiteEdges];
  for (let index = 0; index < count; index += 1) {
    const a = extras[index * 2];
    const b = extras[index * 2 + 1] ?? extras[0];
    if (!a || !b) continue;
    edges.push({
      from: a.knowledgeComponentId,
      to: b.knowledgeComponentId,
      justification: `Deliberate cycle ${index} forward.`,
      evidence: [],
    });
    edges.push({
      from: b.knowledgeComponentId,
      to: a.knowledgeComponentId,
      justification: `Deliberate cycle ${index} back.`,
      evidence: [],
    });
  }
  return { ...graph, prerequisiteEdges: edges };
}

describe("graph auditor repair loop", () => {
  it("accepts the sample graph with no revisions", () => {
    const result = auditGraphWithRepair(graph);
    expect(result.abstained).toBe(false);
    expect(result.graph).toBeDefined();
    expect(result.revisions).toHaveLength(0);
    expect(validateGraph(result.graph!).every((check) => check.status !== "fail" || !check.blocking)).toBe(
      true,
    );
  });

  it("repairs a single cycle in one pass and keeps the graph", () => {
    const broken = withCycles(1);
    expect(findCycle(broken).acyclic).toBe(false);

    const result = auditGraphWithRepair(broken);
    expect(result.abstained).toBe(false);
    expect(result.graph).toBeDefined();
    expect(result.revisions.length).toBeGreaterThan(0);
    expect(result.revisions[0]?.kept).toBe(true);
    expect(findCycle(result.graph!).acyclic).toBe(true);
    expect(validateGraph(result.graph!).find((check) => check.checkId === "check:graph.acyclic")?.status).toBe(
      "pass",
    );
  });

  it("abstains with graph_unsound when two passes cannot clear every cycle", () => {
    const broken = withCycles(3);
    expect(findCycle(broken).acyclic).toBe(false);

    const result = auditGraphWithRepair(broken, 2);
    expect(result.abstained).toBe(true);
    expect(result.graph).toBeUndefined();
    expect(result.refusal?.code).toBe("graph_unsound");
    expect(result.refusal?.collectionPlan.length).toBeGreaterThan(0);
    expect(result.revisions.length).toBeGreaterThan(0);
    expect(result.revisions.every((revision) => !revision.kept)).toBe(true);
  });

  it("does not revise a graph that already passed", () => {
    const first = auditGraphWithRepair(graph);
    expect(first.graph).toBeDefined();
    const second = auditGraphWithRepair(first.graph!);
    expect(second.abstained).toBe(false);
    expect(second.revisions).toHaveLength(0);
    expect(JSON.stringify(second.graph)).toBe(JSON.stringify(first.graph));
  });

  it("flags orphans as atomic entry points rather than inventing edges", () => {
    const broken: CurriculumGraph = {
      ...graph,
      knowledgeComponents: [
        ...graph.knowledgeComponents,
        {
          ...graph.knowledgeComponents[1]!,
          knowledgeComponentId: "kc:au.y7.math.floating",
          atomicEntry: false,
          misconceptionIds: [],
        },
      ],
    };
    const { graph: repaired, repairs } = repairGraph(broken);
    expect(repairs.some((entry) => entry.includes("orphans"))).toBe(true);
    expect(
      repaired.knowledgeComponents.find((kc) => kc.knowledgeComponentId === "kc:au.y7.math.floating")
        ?.atomicEntry,
    ).toBe(true);
  });
});
