import { describe, expect, it } from "vitest";
import { CompilationRequest, type CurriculumGraph } from "@contracts";
import { writeItemsWithModel } from "../server/compiler/stages/itemWriter";
import type { ModelClient } from "../server/compiler/model/modelClient";
import demoRequestJson from "../fixtures/demo-request.json";

/**
 * The item writer's bounded gap-filling pass.
 *
 * Measured on the live model: five Year 7 compiles of the same request shipped
 * between zero and five items, and one shipped none and failed standards coverage.
 * A component with no surviving item means a requested standard goes unassessed,
 * which produces a draft with nothing to practise.
 *
 * So the writer now checks coverage after its first pass and, if a component is
 * uncovered, makes one targeted second pass for exactly those components. Two
 * passes maximum — the same cap every loop in this pipeline uses — and then it
 * lives with the result rather than looping until it looks good.
 */

const demoRequest = CompilationRequest.parse(demoRequestJson);

function componentAt(index: number) {
  return {
    knowledgeComponentId: `kc:test.component-${index}`,
    label: `Component ${index}`,
    description: `Do the work of component ${index}.`,
    standardIds: ["std:acara.v9.ac9m7n08"],
    stage: demoRequest.stage,
    prerequisiteOnly: false,
    atomicEntry: index === 1,
    misconceptionIds: ["mc:test.error"],
    evidence: [],
    confidence: { value: 0.6, basis: ["test"], unmeasured: ["expert_review"] },
  };
}

const graph: CurriculumGraph = {
  schemaVersion: "0.1.0",
  jurisdictionId: "au",
  curriculumSourceId: "acara.v9",
  standards: [
    {
      standardId: "std:acara.v9.ac9m7n08",
      sourceCode: "AC9M7N08",
      statement: "recognise, represent and solve problems involving ratios",
      evidence: [
        {
          sourceId: "src:acara.v9.mathematics.year-7",
          quotedSpan: "recognise, represent and solve problems involving ratios",
          retrievalLanguage: "en",
        },
      ],
    },
  ],
  knowledgeComponents: [componentAt(1), componentAt(2), componentAt(3)],
  prerequisiteEdges: [
    {
      from: "kc:test.component-1",
      to: "kc:test.component-2",
      justification: "One before two.",
      evidence: [],
    },
    {
      from: "kc:test.component-2",
      to: "kc:test.component-3",
      justification: "Two before three.",
      evidence: [],
    },
  ],
  misconceptions: [
    {
      misconceptionId: "mc:test.error",
      label: "The error",
      description: "Does the wrong thing.",
      knowledgeComponentIds: ["kc:test.component-1", "kc:test.component-2", "kc:test.component-3"],
    },
  ],
};

function itemFor(componentId: string) {
  return {
    knowledgeComponentId: componentId,
    stem: `A real question about ${componentId}.`,
    options: [
      { text: "24", correct: true, rationale: "Correct.", misconceptionSlug: "" },
      { text: "3", correct: false, rationale: "The named error.", misconceptionSlug: "mc:test.error" },
      { text: "20", correct: false, rationale: "Also the error.", misconceptionSlug: "mc:test.error" },
    ],
    keyRationale: "Because the arithmetic says so.",
    demandBand: "apply" as const,
    difficultyEstimate: 3,
  };
}

/** A client that answers differently on each successive call. */
function scriptedClient(scripts: unknown[]): { client: ModelClient; prompts: string[] } {
  const prompts: string[] = [];
  let index = 0;
  return {
    prompts,
    client: {
      name: "xai",
      async complete(request) {
        prompts.push(request.prompt);
        const payload = scripts[Math.min(index, scripts.length - 1)];
        index += 1;
        if (payload === null) {
          return { ok: false, abstained: true, reason: "scripted abstention" };
        }
        try {
          return {
            ok: true,
            value: request.parse(payload),
            latencyMs: 5,
            inputTokens: 10,
            outputTokens: 10,
          };
        } catch (error) {
          return {
            ok: false,
            abstained: true,
            reason: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
  };
}

describe("item coverage retry", () => {
  it("makes no second pass when the first covers every component", async () => {
    const { client, prompts } = scriptedClient([
      { items: [itemFor("kc:test.component-1"), itemFor("kc:test.component-2"), itemFor("kc:test.component-3")] },
    ]);
    const outcome = await writeItemsWithModel({ request: demoRequest, graph, modelClient: client });

    expect(outcome.counts.passes).toBe(1);
    expect(outcome.counts.shipped).toBe(3);
    expect(outcome.counts.componentsWithoutItem).toBe(0);
    expect(outcome.counts.gapFilled).toBe(0);
    expect(prompts).toHaveLength(1);
    expect(outcome.calls).toHaveLength(1);
  });

  it("fills the gap when the first pass skips components", async () => {
    const { client, prompts } = scriptedClient([
      // The failure mode measured live: one item for a three-component graph.
      { items: [itemFor("kc:test.component-1")] },
      { items: [itemFor("kc:test.component-2"), itemFor("kc:test.component-3")] },
    ]);
    const outcome = await writeItemsWithModel({ request: demoRequest, graph, modelClient: client });

    expect(outcome.counts.passes).toBe(2);
    expect(outcome.counts.gapFilled).toBe(2);
    expect(outcome.counts.shipped).toBe(3);
    expect(outcome.counts.componentsWithoutItem).toBe(0);
    expect(outcome.reason).toContain("gap-filling pass");

    // Every component ends up assessed, which is what standards coverage needs.
    const covered = new Set(outcome.items.flatMap((item) => item.knowledgeComponentIds));
    expect(covered.size).toBe(3);
  });

  it("asks the second pass only about the components that are still missing", async () => {
    const { client, prompts } = scriptedClient([
      { items: [itemFor("kc:test.component-1")] },
      { items: [itemFor("kc:test.component-2"), itemFor("kc:test.component-3")] },
    ]);
    await writeItemsWithModel({ request: demoRequest, graph, modelClient: client });

    const retryPrompt = prompts[1]!;
    expect(retryPrompt).toContain("kc:test.component-2");
    expect(retryPrompt).toContain("kc:test.component-3");
    // The covered component is not re-requested.
    expect(retryPrompt).not.toContain("kc:test.component-1");
    expect(retryPrompt).toContain("previous pass");
  });

  it("stops at two passes even when the gap remains", async () => {
    const { client, prompts } = scriptedClient([{ items: [itemFor("kc:test.component-1")] }]);
    const outcome = await writeItemsWithModel({ request: demoRequest, graph, modelClient: client });

    // The second pass returns the same single item, which is discarded because it is
    // not one of the components that pass was asked about. No third attempt.
    expect(prompts).toHaveLength(2);
    expect(outcome.counts.passes).toBe(2);
    expect(outcome.counts.componentsWithoutItem).toBe(2);
    expect(outcome.reason).toContain("still have no usable item after two passes");
  });

  it("discards a gap-filling item written for a component that pass was not asked about", async () => {
    const { client } = scriptedClient([
      { items: [itemFor("kc:test.component-1")] },
      // Answers about the already-covered component instead of the missing ones.
      { items: [itemFor("kc:test.component-1")] },
    ]);
    const outcome = await writeItemsWithModel({ request: demoRequest, graph, modelClient: client });

    expect(outcome.counts.shipped).toBe(1);
    expect(outcome.counts.discardedUnknownComponent).toBeGreaterThan(0);
  });

  it("keeps the first pass when the second abstains", async () => {
    const { client } = scriptedClient([{ items: [itemFor("kc:test.component-1")] }, null]);
    const outcome = await writeItemsWithModel({ request: demoRequest, graph, modelClient: client });

    expect(outcome.abstained).toBe(false);
    expect(outcome.counts.shipped).toBe(1);
    // Both attempts are recorded, including the one that produced nothing.
    expect(outcome.calls).toHaveLength(2);
    expect(outcome.calls[1]?.abstained).toBe(true);
  });

  it("abstains when the first pass abstains, without a second attempt", async () => {
    const { client, prompts } = scriptedClient([null]);
    const outcome = await writeItemsWithModel({ request: demoRequest, graph, modelClient: client });

    expect(outcome.abstained).toBe(true);
    expect(outcome.items).toHaveLength(0);
    expect(prompts).toHaveLength(1);
    expect(outcome.reason).toContain("deterministic bank");
  });

  it("breaks discards out by reason so a bad run is a reading, not a guess", async () => {
    const { client } = scriptedClient([
      {
        items: [
          itemFor("kc:test.not-in-graph"),
          { ...itemFor("kc:test.component-1"), options: [itemFor("kc:test.component-1").options[0]!] },
          itemFor("kc:test.component-2"),
        ],
      },
      // The gap-filling pass abstains, so the counts below are the first pass alone.
      null,
    ]);
    const outcome = await writeItemsWithModel({ request: demoRequest, graph, modelClient: client });

    expect(outcome.counts.discardedUnknownComponent).toBe(1);
    expect(outcome.counts.discardedBadOptionCount).toBe(1);
    expect(outcome.counts.discarded).toBe(
      outcome.counts.discardedUnknownComponent! +
        outcome.counts.discardedBadOptionCount! +
        outcome.counts.discardedFailedContract!,
    );
  });
});
