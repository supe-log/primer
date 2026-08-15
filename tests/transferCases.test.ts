import { describe, expect, it } from "vitest";
import { CompilationRequest, CompilationResult, type CompilationRequest as Request } from "@contracts";
import { createCompiler } from "../server/compiler";
import { resolveAdapter, catalogueSourceIdFor } from "../server/compiler/adapters/jurisdiction";
import { catalogueFromSnapshot } from "../server/compiler/sources/catalogue";
import demoRequestJson from "../fixtures/demo-request.json";

/**
 * Transfer cases. One engine, several jurisdictions, one schema — and, where the
 * curriculum has not been fetched, one refusal rather than one invented bundle.
 *
 * These run on MockModelClient, so they exercise the deterministic path and stay
 * offline. What they assert is the routing, not the prose a model would write.
 */

const demoRequest = CompilationRequest.parse(demoRequestJson);

function requestFor(patch: Partial<Request>): Request {
  return CompilationRequest.parse({ ...demoRequest, ...patch });
}

describe("stage ladders are adapter-local, never a bare grade integer", () => {
  it("resolves three differently shaped ladders through one interface", () => {
    expect(resolveAdapter("au")!.resolveStage("Year 7")?.ordinal).toBe(8);
    expect(resolveAdapter("us-tx")!.resolveStage("Grade 5")?.ordinal).toBe(6);
    expect(resolveAdapter("in")!.resolveStage("Middle Stage, Class 7")?.ordinal).toBe(8);

    // Same nominal age band, different local labels. The label never leaves its
    // jurisdiction and the ordinal is what the pipeline orders by.
    const auY7 = resolveAdapter("au")!.resolveStage("Year 7")!;
    const inC7 = resolveAdapter("in")!.resolveStage("Middle Stage, Class 7")!;
    expect(auY7.ordinal).toBe(inC7.ordinal);
    expect(auY7.localLabel).not.toBe(inC7.localLabel);
  });

  it("does not resolve a label from another jurisdiction's ladder", () => {
    expect(resolveAdapter("us-tx")!.resolveStage("Year 7")).toBeUndefined();
    expect(resolveAdapter("au")!.resolveStage("Grade 5")).toBeUndefined();
  });

  it("resolves the catalogue per stage and never borrows another level's curriculum", () => {
    const au = resolveAdapter("au")!;
    expect(catalogueSourceIdFor(au, "Year 7")).toBe("src:acara.v9.mathematics.year-7");
    expect(catalogueSourceIdFor(au, "Year 8")).toBe("src:acara.v9.mathematics.year-8");
    // Year 6 resolves as a stage so it can be pulled in as a prerequisite, but it has
    // no snapshot, so it must not silently fall back to the Year 7 curriculum.
    expect(catalogueSourceIdFor(au, "Year 6")).toBeUndefined();
  });
});

describe("a second fetched level compiles through the same engine", () => {
  it("compiles Year 8 against Year 8 standards", async () => {
    const catalogue = catalogueFromSnapshot("src:acara.v9.mathematics.year-8")!;
    expect(catalogue.standards.length).toBeGreaterThanOrEqual(25);

    const requested = catalogue.standards.slice(0, 2).map((standard) => standard.standardId);
    const result = await createCompiler().compile(
      requestFor({
        requestId: "req:test.au.y8",
        stage: { localLabel: "Year 8", ageBand: [13, 14], ordinal: 9 },
        standardIds: requested,
        goal: "A Year 8 unit.",
      }),
    );

    expect(result.status).not.toBe("refused");
    expect(() => CompilationResult.parse(result)).not.toThrow();
    // Year 8 codes, not Year 7 codes borrowed from the default catalogue.
    for (const standard of result.graph!.standards) {
      expect(standard.sourceCode).toMatch(/^AC9M8/);
    }
  });
});

describe("a jurisdiction without a fetched curriculum refuses", () => {
  const cases = [
    {
      name: "Texas, whose TEKS have not been fetched",
      request: requestFor({
        requestId: "req:test.ustx",
        jurisdictionId: "us-tx",
        curriculumSourceId: "teks.rla",
        subject: "Reading Language Arts",
        stage: { localLabel: "Grade 5", ageBand: [10, 11], ordinal: 6 },
        standardIds: ["std:teks.rla.g5.sample"],
      }),
      authority: "Texas Education Agency",
    },
    {
      name: "India, whose NCERT outcomes have not been fetched",
      request: requestFor({
        requestId: "req:test.in",
        jurisdictionId: "in",
        curriculumSourceId: "ncert.ncf",
        stage: { localLabel: "Middle Stage, Class 7", ageBand: [12, 13], ordinal: 8 },
        standardIds: ["std:ncert.math.c7.sample"],
      }),
      authority: "National Council of Educational Research and Training",
    },
    {
      name: "an Australian level with no snapshot",
      request: requestFor({
        requestId: "req:test.au.y6",
        stage: { localLabel: "Year 6", ageBand: [11, 12], ordinal: 7 },
      }),
      authority: "Australian Curriculum, Assessment and Reporting Authority",
    },
  ];

  for (const testCase of cases) {
    it(`refuses ${testCase.name} with a collection plan`, async () => {
      const result = await createCompiler().compile(testCase.request);

      expect(result.status).toBe("refused");
      expect(result.refusal?.code).toBe("unresolved_adapter");
      // A refusal ships no artifacts at all. This is the rule that stops a
      // jurisdiction being "supported" by a bundle nobody fetched a source for.
      expect(result.graph).toBeUndefined();
      expect(result.coursePlan).toBeUndefined();
      expect(result.items).toHaveLength(0);

      expect(result.refusal?.missingEvidence[0]).toContain(testCase.authority);
      expect(result.refusal?.collectionPlan.length).toBeGreaterThan(1);
      expect(result.refusal?.collectionPlan.join(" ")).toContain("npm run snapshot");
    });
  }
});

describe("every refusal agrees with its gate verdict", () => {
  it("never returns a refused result at a shippable verdict", async () => {
    const refusing = [
      requestFor({ requestId: "req:test.atl", jurisdictionId: "atlantis" }),
      requestFor({ requestId: "req:test.exam", assessmentTarget: "official_exam_emulation" }),
      requestFor({
        requestId: "req:test.tx2",
        jurisdictionId: "us-tx",
        subject: "Reading Language Arts",
        stage: { localLabel: "Grade 4", ageBand: [9, 10], ordinal: 5 },
        standardIds: ["std:teks.rla.g4.sample"],
      }),
    ];

    for (const request of refusing) {
      const result = await createCompiler().compile(request);
      expect(result.status).toBe("refused");
      // The contract: RED and AMBER refuse, YELLOW is a draft, BLUE and GREEN ship.
      // A refusal at YELLOW would be a bundle the client renders as a draft.
      expect(["RED", "AMBER"]).toContain(result.gateReport.verdict);
      expect(result.gateReport.permission).toBe("investigate");
      expect(result.approvedByHuman).toBe(false);
    }
  });

  it("emits exactly one terminal event on a refusal", async () => {
    const compiler = createCompiler();
    const result = await compiler.compile(
      requestFor({
        requestId: "req:test.terminal",
        jurisdictionId: "in",
        stage: { localLabel: "Middle Stage, Class 6", ageBand: [11, 12], ordinal: 7 },
        standardIds: ["std:ncert.math.c6.sample"],
      }),
    );
    const events = compiler.observe(result.runId);
    const terminal = events.filter(
      (event) => event.phase === "run_completed" || event.phase === "run_refused",
    );
    expect(terminal).toHaveLength(1);
    expect(events.at(-1)?.phase).toBe("run_refused");
  });
});
