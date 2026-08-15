import { describe, expect, it } from "vitest";
import { CompilationResult, type CurriculumGraph, type QuestionItem } from "@contracts";
import {
  findCycle,
  topologicalOrder,
  validateGraph,
  validateItems,
  validatePrivacy,
} from "../server/compiler/validators";
import compilationResult from "../fixtures/compilation-result.json";

const sample = CompilationResult.parse(compilationResult);
const graph = sample.graph!;

function withCycle(base: CurriculumGraph): CurriculumGraph {
  return {
    ...base,
    prerequisiteEdges: [
      ...base.prerequisiteEdges,
      {
        from: "kc:au.y7.math.rate-problems",
        to: "kc:au.y7.math.ratio-notation",
        justification: "Deliberately wrong edge that closes a loop.",
        evidence: [],
      },
    ],
  };
}

describe("graph validator", () => {
  it("accepts the sample graph", () => {
    const checks = validateGraph(graph);
    const failures = checks.filter((check) => check.status === "fail");
    expect(failures).toHaveLength(0);
  });

  it("produces a topological order that respects every edge", () => {
    const order = topologicalOrder(graph);
    expect(order).toHaveLength(graph.knowledgeComponents.length);
    for (const edge of graph.prerequisiteEdges) {
      expect(order.indexOf(edge.from)).toBeLessThan(order.indexOf(edge.to));
    }
  });

  it("fails on a cycle and names it", () => {
    const broken = withCycle(graph);
    const result = findCycle(broken);
    expect(result.acyclic).toBe(false);
    expect(result.cycle.length).toBeGreaterThan(1);

    const check = validateGraph(broken).find((entry) => entry.checkId === "check:graph.acyclic");
    expect(check?.status).toBe("fail");
    expect(check?.detail).toContain("Cycle found");
    expect(topologicalOrder(broken)).toHaveLength(0);
  });

  it("fails on an unjustified edge", () => {
    const broken: CurriculumGraph = {
      ...graph,
      prerequisiteEdges: graph.prerequisiteEdges.map((edge, index) =>
        index === 0 ? { ...edge, justification: "   " } : edge,
      ),
    };
    const check = validateGraph(broken).find(
      (entry) => entry.checkId === "check:graph.edges-justified",
    );
    expect(check?.status).toBe("fail");
  });

  it("fails on an orphan without an atomic-entry flag", () => {
    const broken: CurriculumGraph = {
      ...graph,
      knowledgeComponents: [
        ...graph.knowledgeComponents,
        {
          ...graph.knowledgeComponents[1],
          knowledgeComponentId: "kc:au.y7.math.floating",
          atomicEntry: false,
          misconceptionIds: [],
        },
      ],
    };
    const check = validateGraph(broken).find((entry) => entry.checkId === "check:graph.no-orphans");
    expect(check?.status).toBe("fail");
  });
});

describe("item validator", () => {
  it("rejects the double-keyed sample item and passes the rest", () => {
    const check = validateItems(sample.items, graph).find(
      (entry) => entry.checkId === "check:item.single-defensible-key",
    );
    expect(check?.status).toBe("fail");
    expect(check?.counts.rejected).toBe(1);
    expect(check?.detail).toContain("item:au.y7.math.0005");
  });

  it("passes when the double-keyed item is removed", () => {
    const clean = sample.items.filter((item) => !item.rejection);
    const failures = validateItems(clean, graph).filter((entry) => entry.status === "fail");
    expect(failures).toHaveLength(0);
  });

  it("rejects a distractor with no misconception", () => {
    const clean = sample.items.filter((item) => !item.rejection);
    const broken: QuestionItem[] = clean.map((item, index) =>
      index === 0
        ? {
            ...item,
            options: item.options.map((option) =>
              option.correct ? option : { ...option, misconceptionId: undefined },
            ),
          }
        : item,
    );
    const check = validateItems(broken, graph).find(
      (entry) => entry.checkId === "check:item.distractor-misconception",
    );
    expect(check?.status).toBe("fail");
  });

  it("rejects giveaway option forms", () => {
    const clean = sample.items.filter((item) => !item.rejection);
    const broken: QuestionItem[] = clean.map((item, index) =>
      index === 0
        ? {
            ...item,
            options: item.options.map((option, optionIndex) =>
              optionIndex === 1 ? { ...option, text: "All of the above" } : option,
            ),
          }
        : item,
    );
    const check = validateItems(broken, graph).find(
      (entry) => entry.checkId === "check:item.option-style",
    );
    expect(check?.status).toBe("fail");
  });
});

describe("privacy validator", () => {
  it("passes the sample request", () => {
    expect(validatePrivacy(sample.request).status).toBe("pass");
  });

  it("hard-blocks a student-identifying field", () => {
    const check = validatePrivacy({ ...sample.request, studentName: "a name" });
    expect(check.status).toBe("fail");
    expect(check.blocking).toBe(true);
  });
});
