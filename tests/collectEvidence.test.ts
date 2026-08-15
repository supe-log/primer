import { afterEach, describe, expect, it } from "vitest";
import { CompilationRequest, CompilationResult } from "@contracts";
import { createCompiler } from "../server/compiler";
import { collectEvidence } from "../server/compiler/collect/collectEvidence";
import { resetCollectionState } from "../server/compiler/collect/ensureEvidence";
import { classifyLicence, licenceQuoteAppears } from "../server/compiler/licence/classify";
import type { ModelClient, ModelRequest, ModelResponse } from "../server/compiler/model/modelClient";
import { collectedStandardId } from "../server/compiler/sources/catalogue";
import { findSnapshot } from "../server/compiler/sources/snapshotStore";
import demoRequestJson from "../fixtures/demo-request.json";

const demoRequest = CompilationRequest.parse(demoRequestJson);

const CURRICULUM_URL = "https://example.gov/curriculum/grade-5";
const LICENCE_URL = "https://example.gov/curriculum/terms";
const STATEMENT_A = "compose and decompose multi-digit numbers using place value";
const STATEMENT_B = "compare two decimals to hundredths using place-value reasoning";
const STATEMENT_C = "this statement was invented and is not on the page";
const LICENCE_QUOTE = "This curriculum is licensed under Creative Commons Attribution 4.0 International.";

const CURRICULUM_HTML = `<html><body><p>${STATEMENT_A}</p><p>${STATEMENT_B}</p></body></html>`;
const LICENCE_HTML = `<html><body><p>${LICENCE_QUOTE}</p></body></html>`;

afterEach(() => {
  resetCollectionState();
});

class ScriptedResearcher implements ModelClient {
  readonly name = "mock" as const;
  constructor(private readonly proposal: unknown) {}

  async complete<T>(request: ModelRequest<T>): Promise<ModelResponse<T>> {
    if (request.role !== "standards_researcher") {
      return { ok: false, abstained: true, reason: `no script for ${request.role}` };
    }
    try {
      return {
        ok: true,
        value: request.parse(this.proposal),
        latencyMs: 1,
        inputTokens: 1,
        outputTokens: 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, abstained: true, reason: message };
    }
  }
}

function researcherProposal(overrides: Record<string, unknown> = {}) {
  return {
    authorityName: "Example Department of Education",
    canonicalUrl: CURRICULUM_URL,
    curriculumUrl: CURRICULUM_URL,
    licenceUrl: LICENCE_URL,
    localStageLabel: "Grade 5",
    ageBand: [10, 11],
    licenceQuote: LICENCE_QUOTE,
    candidates: [
      { code: "5.NBT.1", statement: STATEMENT_A },
      { code: "5.NBT.3", statement: STATEMENT_B },
      { code: "FAKE.1", statement: STATEMENT_C },
    ],
    ...overrides,
  };
}

function pages(map: Record<string, { body: string; json?: boolean }>): typeof fetch {
  return async (input) => {
    const url = String(input);
    const match = Object.entries(map).find(([key]) => url.startsWith(key) || url === key);
    if (!match) {
      return new Response("not found", { status: 404 });
    }
    const [, page] = match;
    return new Response(page.body, {
      status: 200,
      headers: { "content-type": page.json ? "application/json" : "text/html" },
    });
  };
}

const collectingFetch = pages({
  [CURRICULUM_URL]: { body: CURRICULUM_HTML },
  [LICENCE_URL]: { body: LICENCE_HTML },
});

function texasRequest() {
  return CompilationRequest.parse({
    ...demoRequest,
    requestId: "req:test.collect.tx",
    jurisdictionId: "us-tx",
    curriculumSourceId: "teks.rla",
    subject: "Reading Language Arts",
    stage: { localLabel: "Grade 5", ageBand: [10, 11], ordinal: 6 },
    standardIds: ["std:teks.rla.g5.sample"],
  });
}

describe("licence classifier", () => {
  it("requires the quote to appear on the fetched page", () => {
    expect(licenceQuoteAppears(LICENCE_HTML, LICENCE_QUOTE)).toBe(true);
    expect(licenceQuoteAppears(LICENCE_HTML, "a sentence that is not on the page at all")).toBe(
      false,
    );
  });

  it("classifies CC BY 4.0 only when the quote matches, otherwise unknown cite-only", () => {
    const matched = classifyLicence({
      pageText: LICENCE_HTML,
      quote: LICENCE_QUOTE,
      publisher: "Example Department of Education",
    });
    expect(matched.licenceId).toBe("cc-by-4.0");
    expect(matched.posture).toBe("redistributable");
    expect(matched.mayRedistribute).toBe(true);

    const missed = classifyLicence({
      pageText: LICENCE_HTML,
      quote: "Redistribution is freely permitted by the minister.",
      publisher: "Example Department of Education",
    });
    expect(missed.posture).toBe("unknown");
    expect(missed.mayRedistribute).toBe(false);
  });
});

describe("collectEvidence", () => {
  const now = () => new Date("2026-08-15T18:00:00.000Z");

  it("keeps only candidate statements that appear in the fetched body", async () => {
    const result = await collectEvidence(texasRequest(), {
      modelClient: new ScriptedResearcher(researcherProposal()),
      fetchImpl: collectingFetch,
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.standardIds).toEqual([
      collectedStandardId("us-tx", "5.NBT.1"),
      collectedStandardId("us-tx", "5.NBT.3"),
    ]);
    expect(result.request.standardIds).not.toContain(collectedStandardId("us-tx", "FAKE.1"));
    expect(findSnapshot(result.adapter.catalogueSourceId ?? "")?.snapshot.fetched).toBe(true);
  });

  it("marks the licence unknown when the quote is not on the terms page", async () => {
    const result = await collectEvidence(texasRequest(), {
      modelClient: new ScriptedResearcher(
        researcherProposal({ licenceQuote: "A made-up permission sentence that is not on the page." }),
      ),
      fetchImpl: collectingFetch,
      now,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = findSnapshot(result.adapter.catalogueSourceId ?? "");
    expect(stored?.snapshot.licence.posture).toBe("unknown");
    expect(stored?.snapshot.licence.mayRedistribute).toBe(false);
  });

  it("refuses to collect when the URL cannot be fetched", async () => {
    const result = await collectEvidence(texasRequest(), {
      modelClient: new ScriptedResearcher(researcherProposal()),
      fetchImpl: async () => new Response("down", { status: 503 }),
      now,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.notes.some((entry) => entry.phase === "check_failed")).toBe(true);
  });
});

describe("compile with collection", () => {
  it("does not touch the network for a ready Australia Year 7 request", async () => {
    let fetches = 0;
    const compiler = createCompiler({
      fetchImpl: async () => {
        fetches += 1;
        throw new Error("should not fetch");
      },
    });
    const result = await compiler.compile(demoRequest);
    expect(result.status).toBe("draft");
    expect(fetches).toBe(0);
  });

  it("never collects for official exam emulation", async () => {
    let fetches = 0;
    const compiler = createCompiler({
      modelClient: new ScriptedResearcher(researcherProposal()),
      fetchImpl: async () => {
        fetches += 1;
        return new Response("nope", { status: 500 });
      },
    });
    const result = await compiler.compile({
      ...demoRequest,
      assessmentTarget: "official_exam_emulation",
    });
    expect(result.status).toBe("refused");
    expect(result.refusal?.code).toBe("missing_blueprint");
    expect(fetches).toBe(0);
    expect(compiler.observe(result.runId).some((event) => event.message.includes("Researching"))).toBe(
      false,
    );
  });

  it("compiles a jurisdiction after collecting span-locked standards", async () => {
    const compiler = createCompiler({
      modelClient: new ScriptedResearcher(researcherProposal()),
      fetchImpl: collectingFetch,
    });
    const result = await compiler.compile(texasRequest());
    expect(() => CompilationResult.parse(result)).not.toThrow();
    expect(result.status).toBe("draft");
    expect(result.approvedByHuman).toBe(false);
    expect(result.graph?.standards.map((standard) => standard.statement)).toEqual([
      STATEMENT_A,
      STATEMENT_B,
    ]);
    expect(compiler.observe(result.runId).some((event) => event.agentId === "agent:standards-researcher")).toBe(
      true,
    );
  });

  it("collects an unfetched ACARA year through the official query without a researcher", async () => {
    const queryPage = {
      count: 1,
      results: [
        {
          code: "AC9M6N01",
          documentType: "CD",
          title: "recognise integers in everyday contexts",
          url: "/f-10/ac9m6n01",
          lvl_title: "Year 6",
          la_title: "Mathematics",
        },
      ],
    };
    let researcherCalls = 0;
    const compiler = createCompiler({
      modelClient: {
        name: "mock",
        async complete(request) {
          if (request.role === "standards_researcher") researcherCalls += 1;
          return { ok: false, abstained: true, reason: "unused" };
        },
      },
      fetchImpl: async (input) => {
        const url = String(input);
        if (url.includes("query.json")) {
          return new Response(JSON.stringify(queryPage), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        throw new Error(`unexpected fetch ${url}`);
      },
    });

    const result = await compiler.compile({
      ...demoRequest,
      requestId: "req:test.collect.au.y6",
      stage: { localLabel: "Year 6", ageBand: [11, 12], ordinal: 7 },
    });

    expect(researcherCalls).toBe(0);
    expect(result.status).toBe("draft");
    expect(result.graph?.standards[0]?.sourceCode).toBe("AC9M6N01");
  });

  it("returns a collection-plan refusal when the URL is unreachable", async () => {
    const compiler = createCompiler({
      modelClient: new ScriptedResearcher(researcherProposal()),
      fetchImpl: async () => new Response("down", { status: 503 }),
    });
    const result = await compiler.compile(texasRequest());
    expect(result.status).toBe("refused");
    expect(result.refusal?.code).toBe("unresolved_adapter");
    expect(result.refusal?.collectionPlan.length).toBeGreaterThan(0);
    expect(result.graph).toBeUndefined();
  });
});
