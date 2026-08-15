import { describe, expect, it } from "vitest";
import {
  AgentEvent,
  CompilationRequest,
  CompilationResult,
  SCHEMA_VERSION,
} from "@contracts";
import demoRequest from "../fixtures/demo-request.json";
import compilationResult from "../fixtures/compilation-result.json";
import agentEvents from "../fixtures/agent-events.json";
import refusalResult from "../fixtures/refusal-result.json";

/**
 * Contract tests. Every fixture must parse against the contracts, and the
 * cross-artifact invariants documented in shared/contracts must hold. When a schema
 * changes, this file is the first thing that must be updated.
 */

describe("fixtures parse against contracts " + SCHEMA_VERSION, () => {
  it("demo-request.json is a valid CompilationRequest", () => {
    expect(() => CompilationRequest.parse(demoRequest)).not.toThrow();
  });

  it("compilation-result.json is a valid CompilationResult", () => {
    expect(() => CompilationResult.parse(compilationResult)).not.toThrow();
  });

  it("refusal-result.json is a valid CompilationResult", () => {
    expect(() => CompilationResult.parse(refusalResult)).not.toThrow();
  });

  it("agent-events.json is a valid AgentEvent list", () => {
    expect(() => AgentEvent.array().parse(agentEvents)).not.toThrow();
  });
});

describe("cross-artifact invariants in the sample bundle", () => {
  const result = CompilationResult.parse(compilationResult);

  it("carries a graph, a course plan and items", () => {
    expect(result.graph).toBeDefined();
    expect(result.coursePlan).toBeDefined();
    expect(result.items.length).toBeGreaterThan(0);
  });

  it("every evidence reference points at a source in the manifest", () => {
    const sourceIds = new Set(result.sourceManifest.sources.map((source) => source.sourceId));
    const references = [
      ...result.graph!.standards.flatMap((standard) => standard.evidence),
      ...result.graph!.knowledgeComponents.flatMap((kc) => kc.evidence),
      ...result.coursePlan!.lessons.flatMap((lesson) =>
        lesson.decisions.flatMap((decision) => decision.evidence),
      ),
      ...result.coursePlan!.decisions.flatMap((decision) => decision.evidence),
    ];
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(sourceIds.has(reference.sourceId)).toBe(true);
    }
  });

  it("every item tag resolves into the graph", () => {
    const kcIds = new Set(result.graph!.knowledgeComponents.map((kc) => kc.knowledgeComponentId));
    const standardIds = new Set(result.graph!.standards.map((standard) => standard.standardId));
    for (const item of result.items) {
      for (const id of item.knowledgeComponentIds) expect(kcIds.has(id)).toBe(true);
      for (const id of item.standardIds) expect(standardIds.has(id)).toBe(true);
    }
  });

  it("every lesson item id exists in the item bank", () => {
    const itemIds = new Set(result.items.map((item) => item.itemId));
    for (const lesson of result.coursePlan!.lessons) {
      for (const id of lesson.itemIds) expect(itemIds.has(id)).toBe(true);
    }
  });

  it("no artifact contains a student-identifying field", () => {
    const serialized = JSON.stringify(result).toLowerCase();
    for (const banned of ["studentname", "dateofbirth", "\"email\"", "studentid"]) {
      expect(serialized.includes(banned)).toBe(false);
    }
  });

  it("nothing is auto-published", () => {
    expect(result.approvedByHuman).toBe(false);
  });
});

describe("agent event stream invariants", () => {
  const events = AgentEvent.array().parse(agentEvents);

  it("sequence numbers start at zero and increase by one", () => {
    events.forEach((event, index) => expect(event.seq).toBe(index));
  });

  it("ends with exactly one terminal event", () => {
    const terminal = events.filter(
      (event) => event.phase === "run_completed" || event.phase === "run_refused",
    );
    expect(terminal).toHaveLength(1);
    expect(events.at(-1)?.phase).toBe("run_completed");
  });
});

describe("the refusal fixture refuses honestly", () => {
  const refusal = CompilationResult.parse(refusalResult);

  it("has no generated artifacts", () => {
    expect(refusal.status).toBe("refused");
    expect(refusal.graph).toBeUndefined();
    expect(refusal.coursePlan).toBeUndefined();
    expect(refusal.items).toHaveLength(0);
  });

  it("names missing evidence and a collection plan", () => {
    expect(refusal.refusal?.missingEvidence.length).toBeGreaterThan(0);
    expect(refusal.refusal?.collectionPlan.length).toBeGreaterThan(0);
  });
});
