import { describe, expect, it } from "vitest";
import { CompilationRequest, CompilationResult, SCHEMA_VERSION } from "@contracts";
import { createCompiler } from "../server/compiler";
import { evaluateGate } from "../server/compiler/evidenceGate";
import demoRequestJson from "../fixtures/demo-request.json";

const demoRequest = CompilationRequest.parse(demoRequestJson);

describe("the compiler seam", () => {
  it("compiles the demo request into a draft bundle that parses", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile(demoRequest);

    expect(() => CompilationResult.parse(result)).not.toThrow();
    expect(result.schemaVersion).toBe(SCHEMA_VERSION);
    expect(result.status).toBe("draft");
    expect(result.status).not.toBe("published");
    expect(result.gateReport.verdict).toBe("YELLOW");
    expect(result.gateReport.summary).not.toMatch(/sample standards/i);
    expect(result.sourceManifest.sources.some((source) => source.fetched)).toBe(true);
    expect(result.gateReport.permission).toBe("prototype");
    expect(result.approvedByHuman).toBe(false);
  });

  it("records an observable event stream that ends once", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile(demoRequest);
    const events = compiler.observe(result.runId);

    expect(events.length).toBeGreaterThan(5);
    events.forEach((event, index) => expect(event.seq).toBe(index));
    const terminal = events.filter(
      (event) => event.phase === "run_completed" || event.phase === "run_refused",
    );
    expect(terminal).toHaveLength(1);
    expect(compiler.observe("run:does.not.exist")).toEqual([]);
  });

  it("refuses official exam emulation with a named missing blueprint", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile({
      ...demoRequest,
      assessmentTarget: "official_exam_emulation",
    });

    expect(result.status).toBe("refused");
    expect(result.refusal?.code).toBe("missing_blueprint");
    expect(result.items).toHaveLength(0);
    expect(result.graph).toBeUndefined();
    expect(result.gateReport.verdict).toBe("AMBER");
    expect(result.gateReport.permission).toBe("investigate");
    expect(result.refusal?.collectionPlan.length).toBeGreaterThan(0);

    const events = compiler.observe(result.runId);
    expect(events.at(-1)?.phase).toBe("run_refused");
  });

  it("refuses an unregistered jurisdiction instead of guessing", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile({ ...demoRequest, jurisdictionId: "atlantis" });

    expect(result.status).toBe("refused");
    expect(result.refusal?.code).toBe("unresolved_adapter");
  });

  it("is deterministic for the same request", async () => {
    const first = await createCompiler().compile(demoRequest);
    const second = await createCompiler().compile(demoRequest);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });
});

describe("gate arithmetic", () => {
  const baseCheck = {
    label: "example",
    kind: "deterministic" as const,
    blocking: true,
    detail: "example detail",
    counts: {},
  };

  it("caps at AMBER when a source or licence check fails", () => {
    expect(
      evaluateGate([
        { ...baseCheck, checkId: "check:source.licence-known", status: "fail" },
      ]),
    ).toEqual({ verdict: "AMBER", permission: "investigate" });
    expect(
      evaluateGate([
        { ...baseCheck, checkId: "check:source.cite-only-no-redistribute", status: "fail" },
      ]),
    ).toEqual({ verdict: "AMBER", permission: "investigate" });
  });

  it("returns YELLOW when another blocking check fails", () => {
    expect(
      evaluateGate([{ ...baseCheck, checkId: "check:item.single-defensible-key", status: "fail" }]),
    ).toEqual({ verdict: "YELLOW", permission: "prototype" });
  });

  it("never treats an abstention as a pass", () => {
    const decision = evaluateGate([
      { ...baseCheck, checkId: "check:graph.acyclic", status: "pass" },
      {
        ...baseCheck,
        checkId: "check:critic.learning-science",
        kind: "model_critic",
        blocking: false,
        status: "abstain",
      },
      {
        ...baseCheck,
        checkId: "check:expert.item-review",
        kind: "expert_review",
        blocking: false,
        status: "skipped",
      },
    ]);
    expect(decision.verdict).toBe("BLUE");
    expect(decision.permission).toBe("prototype");
  });

  it("reaches controlled pilot only with expert review and pilot data", () => {
    const decision = evaluateGate([
      { ...baseCheck, checkId: "check:graph.acyclic", status: "pass" },
      {
        ...baseCheck,
        checkId: "check:expert.item-review",
        kind: "expert_review",
        blocking: false,
        status: "pass",
      },
      {
        ...baseCheck,
        checkId: "check:pilot.item-statistics",
        kind: "pilot_measurement",
        blocking: false,
        status: "pass",
      },
    ]);
    expect(decision).toEqual({ verdict: "GREEN", permission: "controlled_pilot" });
  });
});
