import { describe, expect, it } from "vitest";
import { CompilationRequest, type CurriculumGraph } from "@contracts";
import { XaiModelClient, modelClientFromEnv } from "../server/compiler/model/xaiModelClient";
import { MockModelClient, type ModelClient } from "../server/compiler/model/modelClient";
import { mapCurriculumWithModel } from "../server/compiler/stages/curriculumMapper";
import { writeItemsWithModel } from "../server/compiler/stages/itemWriter";
import { catalogueFromSnapshot, buildSourceManifest } from "../server/compiler/sources/catalogue";
import { auAcaraAdapter } from "../server/compiler/adapters/jurisdiction";
import demoRequestJson from "../fixtures/demo-request.json";

/**
 * Every test here is offline. The xAI client takes an injected fetch and the stages
 * take an injected ModelClient, so the real network is never touched and a failing
 * test always means the code is wrong rather than that an API was slow.
 */

const demoRequest = CompilationRequest.parse(demoRequestJson);
const catalogue = catalogueFromSnapshot(auAcaraAdapter.catalogueSourceId!)!;
const sourceManifest = buildSourceManifest(auAcaraAdapter.snapshotSourceIds);

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function completion(content: unknown) {
  return {
    choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 120, completion_tokens: 45 },
  };
}

function clientReturning(payload: unknown): XaiModelClient {
  return new XaiModelClient({
    apiKey: "test-key",
    endpoint: "https://example.invalid/v1/chat/completions",
    fetchImpl: async () => jsonResponse(payload),
  });
}

describe("XaiModelClient", () => {
  const request = {
    role: "curriculum_mapper" as const,
    promptVersion: "test/1",
    prompt: "decompose this",
    parse: (raw: unknown) => {
      const value = raw as { ok?: boolean };
      if (typeof value?.ok !== "boolean") throw new Error("missing ok");
      return value as { ok: boolean };
    },
  };

  it("returns a parsed value with token accounting on a good response", async () => {
    const response = await clientReturning(completion({ ok: true })).complete(request);
    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.value).toEqual({ ok: true });
    expect(response.inputTokens).toBe(120);
    expect(response.outputTokens).toBe(45);
  });

  it("sends strict structured outputs and the caller's reasoning effort", async () => {
    let sentBody: Record<string, unknown> = {};
    const client = new XaiModelClient({
      apiKey: "test-key",
      endpoint: "https://example.invalid/v1/chat/completions",
      fetchImpl: async (_url, init) => {
        sentBody = JSON.parse(String((init as RequestInit).body));
        return jsonResponse(completion({ ok: true }));
      },
    });
    await client.complete({
      ...request,
      schema: { name: "probe", schema: { type: "object" } },
      reasoningEffort: "low",
    });

    expect(sentBody.model).toBe("grok-4.6");
    expect(sentBody.reasoning_effort).toBe("low");
    const format = sentBody.response_format as { json_schema?: { strict?: boolean } };
    expect(format.json_schema?.strict).toBe(true);
  });

  // Abstention is a result. Each of these would otherwise become an exception that a
  // caller might catch and paper over with a default value.
  it("abstains rather than throwing on a non-2xx status", async () => {
    const client = new XaiModelClient({
      apiKey: "k",
      endpoint: "https://example.invalid/x",
      fetchImpl: async () => new Response("rate limited", { status: 429 }),
    });
    const response = await client.complete(request);
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.abstained).toBe(true);
    expect(response.reason).toContain("429");
  });

  it("abstains on a model refusal", async () => {
    const response = await clientReturning({
      choices: [{ message: { refusal: "I will not do that" } }],
    }).complete(request);
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.reason).toContain("refused");
  });

  it("abstains on content that is not JSON", async () => {
    const response = await clientReturning({
      choices: [{ message: { content: "not json at all" } }],
    }).complete(request);
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.reason).toContain("non-JSON");
  });

  it("abstains when the payload does not satisfy the caller's parser", async () => {
    const response = await clientReturning(completion({ wrong: "shape" })).complete(request);
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.reason).toContain("did not satisfy its schema");
  });

  it("abstains on a network failure", async () => {
    const client = new XaiModelClient({
      apiKey: "k",
      endpoint: "https://example.invalid/x",
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });
    const response = await client.complete(request);
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.reason).toContain("ECONNREFUSED");
  });

  it("abstains on a timeout instead of hanging the compile", async () => {
    const client = new XaiModelClient({
      apiKey: "k",
      endpoint: "https://example.invalid/x",
      timeoutMs: 10,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          (init as RequestInit).signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    });
    const response = await client.complete(request);
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.reason).toContain("timed out");
  });

  it("selects the mock when no key is configured", () => {
    expect(modelClientFromEnv({})).toBeUndefined();
    expect(modelClientFromEnv({ XAI_API_KEY: "   " })).toBeUndefined();
    expect(modelClientFromEnv({ XAI_API_KEY: "key" })?.name).toBe("xai");
  });
});

/** A ModelClient that returns one canned payload, for driving a stage offline. */
function stubClient(payload: unknown): ModelClient {
  return {
    name: "xai",
    async complete(request) {
      try {
        return {
          ok: true,
          value: request.parse(payload),
          latencyMs: 12,
          inputTokens: 100,
          outputTokens: 50,
        };
      } catch (error) {
        return {
          ok: false,
          abstained: true,
          reason: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

const MAPPER_PAYLOAD = {
  knowledgeComponents: [
    {
      slug: "ratio-notation",
      label: "Read ratio notation",
      description: "Interpret a : b as a comparison of two quantities.",
      standardCodes: ["AC9M7N08"],
      belowStage: false,
      atomicEntry: true,
      misconceptionSlugs: ["part-part-as-part-whole"],
    },
    {
      slug: "share-in-ratio",
      label: "Share in a given ratio",
      description: "Divide a quantity into parts in a given ratio.",
      // AC9M7ZZ99 does not exist in the snapshot and must be dropped.
      standardCodes: ["AC9M7N08", "AC9M7ZZ99"],
      belowStage: false,
      atomicEntry: false,
      misconceptionSlugs: ["part-part-as-part-whole", "undeclared-misconception"],
    },
  ],
  prerequisiteEdges: [
    {
      fromSlug: "ratio-notation",
      toSlug: "share-in-ratio",
      justification: "Sharing in a ratio needs the parts read off the notation first.",
    },
    // Dangling: "nowhere" was never declared as a component.
    { fromSlug: "ratio-notation", toSlug: "nowhere", justification: "dangling" },
  ],
  misconceptions: [
    {
      slug: "part-part-as-part-whole",
      label: "Reads a part-to-part ratio as part-to-whole",
      description: "Reads 1 : 4 as one quarter rather than one fifth.",
      knowledgeComponentSlugs: ["ratio-notation", "share-in-ratio"],
    },
    // Attached to nothing that exists, so it is not a misconception, it is a note.
    {
      slug: "orphan",
      label: "Orphan",
      description: "Attached to no declared component.",
      knowledgeComponentSlugs: ["nowhere"],
    },
  ],
};

describe("curriculum mapper", () => {
  async function runMapper(client: ModelClient) {
    return mapCurriculumWithModel({
      request: demoRequest,
      adapter: auAcaraAdapter,
      sourceManifest,
      catalogue,
      modelClient: client,
    });
  }

  it("keeps the authority's standards and never the model's", async () => {
    const outcome = await runMapper(stubClient(MAPPER_PAYLOAD));
    expect(outcome.abstained).toBe(false);

    const graph = outcome.graph!;
    // Standards come from the catalogue, in request order, verbatim.
    expect(graph.standards.map((s) => s.sourceCode)).toEqual(["AC9M7N04", "AC9M7N08", "AC9M7M06"]);
    expect(graph.standards[1]?.statement).toBe(
      "recognise, represent and solve problems involving ratios",
    );
  });

  it("drops standard codes the snapshot does not contain and counts them", async () => {
    const outcome = await runMapper(stubClient(MAPPER_PAYLOAD));
    const graph = outcome.graph!;
    const shared = graph.knowledgeComponents.find((kc) =>
      kc.knowledgeComponentId.endsWith("share-in-ratio"),
    )!;

    expect(shared.standardIds).toEqual(["std:acara.v9.ac9m7n08"]);
    expect(outcome.counts.droppedInventedCodes).toBe(1);
  });

  it("drops dangling edges rather than inventing the missing component", async () => {
    const outcome = await runMapper(stubClient(MAPPER_PAYLOAD));
    const graph = outcome.graph!;

    expect(graph.prerequisiteEdges).toHaveLength(1);
    expect(outcome.counts.droppedDanglingEdges).toBe(1);
    const ids = new Set(graph.knowledgeComponents.map((kc) => kc.knowledgeComponentId));
    for (const edge of graph.prerequisiteEdges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });

  it("keeps only misconception links the graph declares", async () => {
    const outcome = await runMapper(stubClient(MAPPER_PAYLOAD));
    const graph = outcome.graph!;
    const declared = new Set(graph.misconceptions.map((m) => m.misconceptionId));

    expect(declared.size).toBe(1);
    for (const kc of graph.knowledgeComponents) {
      for (const id of kc.misconceptionIds) expect(declared.has(id)).toBe(true);
    }
  });

  it("assigns prefixed ids itself so the model cannot mint one", async () => {
    const outcome = await runMapper(stubClient(MAPPER_PAYLOAD));
    for (const kc of outcome.graph!.knowledgeComponents) {
      expect(kc.knowledgeComponentId).toMatch(/^kc:[a-z0-9][a-z0-9._-]*$/);
    }
    for (const misconception of outcome.graph!.misconceptions) {
      expect(misconception.misconceptionId).toMatch(/^mc:[a-z0-9][a-z0-9._-]*$/);
    }
  });

  it("computes confidence from span matches rather than taking a self-rating", async () => {
    const outcome = await runMapper(stubClient(MAPPER_PAYLOAD));
    for (const kc of outcome.graph!.knowledgeComponents) {
      expect(kc.confidence.value).toBeLessThanOrEqual(0.75);
      expect(kc.confidence.unmeasured).toContain("expert_review");
      expect(kc.confidence.basis.join(" ")).toContain("evidence spans matched");
    }
  });

  it("abstains when the model abstains, and records the abstained call", async () => {
    const outcome = await mapCurriculumWithModel({
      request: demoRequest,
      adapter: auAcaraAdapter,
      sourceManifest,
      catalogue,
      modelClient: new MockModelClient(),
    });
    expect(outcome.abstained).toBe(true);
    expect(outcome.graph).toBeUndefined();
    expect(outcome.call.abstained).toBe(true);
    expect(outcome.reason).toContain("deterministic map");
  });

  it("abstains when the model returns no components at all", async () => {
    const outcome = await runMapper(
      stubClient({ knowledgeComponents: [], prerequisiteEdges: [], misconceptions: [] }),
    );
    expect(outcome.abstained).toBe(true);
  });
});

describe("item writer", () => {
  const graph: CurriculumGraph = {
    schemaVersion: "0.1.0",
    jurisdictionId: "au",
    curriculumSourceId: "acara.v9",
    standards: catalogue.resolve(["std:acara.v9.ac9m7n08"]),
    knowledgeComponents: [
      {
        knowledgeComponentId: "kc:test.share-in-ratio",
        label: "Share in a given ratio",
        description: "Divide a quantity into parts in a given ratio.",
        standardIds: ["std:acara.v9.ac9m7n08"],
        stage: demoRequest.stage,
        prerequisiteOnly: false,
        atomicEntry: true,
        misconceptionIds: ["mc:test.parts-not-numbers"],
        evidence: [],
        confidence: { value: 0.6, basis: ["test"], unmeasured: ["expert_review"] },
      },
    ],
    prerequisiteEdges: [],
    misconceptions: [
      {
        misconceptionId: "mc:test.parts-not-numbers",
        label: "Splits into the ratio numbers",
        description: "Gives $2 and $3 when sharing $40 in the ratio 2 : 3.",
        knowledgeComponentIds: ["kc:test.share-in-ratio"],
      },
    ],
  };

  function itemPayload(overrides: Record<string, unknown> = {}) {
    return {
      items: [
        {
          knowledgeComponentId: "kc:test.share-in-ratio",
          stem: "Share $40 in the ratio 2 : 3. How much is the larger share?",
          options: [
            { text: "$24", correct: true, rationale: "Five parts of $8.", misconceptionSlug: "" },
            {
              text: "$3",
              correct: false,
              rationale: "Uses the ratio number as the amount.",
              misconceptionSlug: "mc:test.parts-not-numbers",
            },
            {
              text: "$20",
              correct: false,
              rationale: "Halves instead of sharing in the ratio.",
              misconceptionSlug: "mc:test.parts-not-numbers",
            },
          ],
          keyRationale: "Forty divided by five parts is eight; three parts is twenty-four.",
          demandBand: "apply",
          difficultyEstimate: 3,
          ...overrides,
        },
      ],
    };
  }

  it("writes items that carry the component's standards and stay uncalibrated", async () => {
    const outcome = await writeItemsWithModel({
      request: demoRequest,
      graph,
      modelClient: stubClient(itemPayload()),
    });

    expect(outcome.abstained).toBe(false);
    const item = outcome.items[0]!;
    expect(item.standardIds).toEqual(["std:acara.v9.ac9m7n08"]);
    expect(item.correctOptionId).toBe("A");
    // No response data exists, so nothing here may claim calibration or a DIF result.
    expect(item.difficulty.calibrated).toBe(false);
    expect(item.difficulty.difStatus).toBe("not_yet_measured");
    expect(item.rejection).toBeUndefined();
  });

  it("links every distractor to a misconception the graph declares", async () => {
    const outcome = await writeItemsWithModel({
      request: demoRequest,
      graph,
      modelClient: stubClient(itemPayload()),
    });
    const distractors = outcome.items[0]!.options.filter((option) => !option.correct);
    expect(distractors).toHaveLength(2);
    for (const option of distractors) {
      expect(option.misconceptionId).toBe("mc:test.parts-not-numbers");
    }
  });

  it("rejects rather than repairs a distractor pointing at an undeclared misconception", async () => {
    const payload = itemPayload();
    payload.items[0]!.options[1]!.misconceptionSlug = "mc:test.not-declared";

    const outcome = await writeItemsWithModel({
      request: demoRequest,
      graph,
      modelClient: stubClient(payload),
    });
    const item = outcome.items[0]!;
    expect(item.rejection?.checkId).toBe("check:item.distractor-misconception");
    expect(item.rejection?.reason).toContain("Rejected rather than repaired");
    // The rejected item still ships. The rejections are the proof the gates ran.
    expect(outcome.items).toHaveLength(1);
    expect(outcome.counts.rejected).toBe(1);
  });

  it("rejects a double-keyed item rather than picking a winner", async () => {
    const payload = itemPayload();
    payload.items[0]!.options[1]!.correct = true;

    const outcome = await writeItemsWithModel({
      request: demoRequest,
      graph,
      modelClient: stubClient(payload),
    });
    expect(outcome.items[0]!.rejection?.checkId).toBe("check:item.single-defensible-key");
  });

  it("rejects a giveaway option form", async () => {
    const payload = itemPayload();
    payload.items[0]!.options[2]!.text = "All of the above";

    const outcome = await writeItemsWithModel({
      request: demoRequest,
      graph,
      modelClient: stubClient(payload),
    });
    expect(outcome.items[0]!.rejection?.checkId).toBe("check:item.option-style");
  });

  it("discards an item tagged to a component that is not in the graph", async () => {
    const payload = itemPayload({ knowledgeComponentId: "kc:test.not-in-graph" });
    const outcome = await writeItemsWithModel({
      request: demoRequest,
      graph,
      modelClient: stubClient(payload),
    });
    expect(outcome.abstained).toBe(true);
    expect(outcome.items).toHaveLength(0);
  });

  it("abstains when the model abstains", async () => {
    const outcome = await writeItemsWithModel({
      request: demoRequest,
      graph,
      modelClient: new MockModelClient(),
    });
    expect(outcome.abstained).toBe(true);
    expect(outcome.call.abstained).toBe(true);
    expect(outcome.reason).toContain("deterministic bank");
  });
});
