import {
  QuestionItem,
  type CompilationRequest,
  type CoursePlan,
  type CurriculumGraph,
  type ModelCallRecord,
  type QuestionItem as QuestionItemType,
} from "@contracts";
import type { ModelClient } from "../model/modelClient";
import type { StructuredModelRequest, StructuredSchema } from "../model/xaiModelClient";
import { validateItems } from "../validators/items";

/**
 * The item writer: the second real agent stage.
 *
 * Same division of labour as the mapper. The model writes the *question* — stem,
 * options, rationales, and which named misconception each distractor targets. Code
 * owns everything checkable: ids, tags, the key/option agreement, calibration
 * labelling, and whether the item survives at all.
 *
 * The rule that matters most here is that validators reject rather than repair. A
 * double-keyed item is not quietly fixed; it is stamped with the check that caught
 * it and shipped visible, because the rejections are the proof the gates ran. An
 * item with a repaired hidden defect is worse than a rejected item with a reason.
 */

export const ITEM_WRITER_PROMPT_VERSION = "item-writer/2026-08-15.1";

interface ProposedOption {
  text: string;
  correct: boolean;
  rationale: string;
  misconceptionSlug: string;
}

interface ProposedItem {
  knowledgeComponentId: string;
  stem: string;
  options: ProposedOption[];
  keyRationale: string;
  demandBand: "recall" | "apply" | "analyze";
  difficultyEstimate: number;
}

interface ItemProposal {
  items: ProposedItem[];
}

const ITEM_SCHEMA: StructuredSchema = {
  name: "question_items",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "knowledgeComponentId",
            "stem",
            "options",
            "keyRationale",
            "demandBand",
            "difficultyEstimate",
          ],
          properties: {
            knowledgeComponentId: {
              type: "string",
              description: "exactly one of the supplied knowledge component ids",
            },
            stem: { type: "string", description: "the question, answerable without the options" },
            options: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["text", "correct", "rationale", "misconceptionSlug"],
                properties: {
                  text: { type: "string" },
                  correct: { type: "boolean" },
                  rationale: {
                    type: "string",
                    description: "why this option is right or what error produces it",
                  },
                  misconceptionSlug: {
                    type: "string",
                    description:
                      "for an incorrect option, the id of the misconception it targets; empty string for the key",
                  },
                },
              },
            },
            keyRationale: { type: "string" },
            demandBand: { type: "string", enum: ["recall", "apply", "analyze"] },
            difficultyEstimate: { type: "integer", minimum: 1, maximum: 5 },
          },
        },
      },
    },
  },
};

function buildPrompt(input: {
  request: CompilationRequest;
  graph: CurriculumGraph;
  itemsPerComponent: number;
  /** Components this pass must cover. Defaults to every assessable component. */
  only?: readonly string[];
  /** Set on a second pass, so the model knows it is filling gaps rather than starting over. */
  retry?: boolean;
}): string {
  const { request, graph, itemsPerComponent } = input;
  const onlyIds = input.only ? new Set(input.only) : undefined;
  const assessable = graph.knowledgeComponents
    .filter((kc) => !kc.prerequisiteOnly)
    .filter((kc) => !onlyIds || onlyIds.has(kc.knowledgeComponentId));
  const misconceptionsById = new Map(
    graph.misconceptions.map((m) => [m.misconceptionId, m] as const),
  );

  const componentBlock = assessable
    .map((kc) => {
      const misconceptions = kc.misconceptionIds
        .map((id) => misconceptionsById.get(id))
        .filter((m): m is NonNullable<typeof m> => m !== undefined)
        .map((m) => `      ${m.misconceptionId}: ${m.label} — ${m.description}`)
        .join("\n");
      return [
        `  ${kc.knowledgeComponentId}`,
        `    label: ${kc.label}`,
        `    description: ${kc.description}`,
        misconceptions
          ? `    misconceptions available as distractor targets:\n${misconceptions}`
          : `    misconceptions available: none declared`,
      ].join("\n");
    })
    .join("\n");

  return [
    `You are writing formative assessment items for ${request.subject}, ${request.stage.localLabel},`,
    `nominal ages ${request.stage.ageBand[0]} to ${request.stage.ageBand[1]}, locale ${request.locale.bcp47}.`,
    ``,
    `Teacher's goal: ${request.goal}`,
    `Learner context: ${request.learnerContext.priorKnowledgeNotes || "none supplied"}`,
    request.learnerContext.accessibilityNeeds.length > 0
      ? `Accessibility requests: ${request.learnerContext.accessibilityNeeds.join(", ")}`
      : `Accessibility requests: none`,
    ``,
    // The count is stated as an arithmetic requirement rather than left implied.
    // Asking for "one per component" and listing the components got a single item
    // back for a seven-component graph, which then failed standards coverage.
    input.retry
      ? `A previous pass left these ${assessable.length} knowledge components without a usable item. Write exactly ${assessable.length * itemsPerComponent} items, ${itemsPerComponent} for each component listed below. Do not write items for anything else.`
      : `Write exactly ${assessable.length * itemsPerComponent} items: ${itemsPerComponent} for each of the ${assessable.length} knowledge components listed below, in this order. Every component must receive its own item, and no component may be skipped.`,
    componentBlock,
    ``,
    `Rules, all of which a deterministic validator checks after you:`,
    `1. Exactly one option is correct. If two options are defensible the item is`,
    `   rejected, not repaired, so do not write a second defensible answer.`,
    `2. Three or four options. Every incorrect option sets misconceptionSlug to one of`,
    `   the misconception ids listed for that component, and its rationale names the`,
    `   wrong move that produces it. The key sets misconceptionSlug to "".`,
    `3. No "all of the above", "none of the above" or "both A and B". These are`,
    `   rejected automatically.`,
    `4. The stem must be answerable before reading the options, and must not give the`,
    `   answer away through length, grammar or specificity.`,
    `5. Use ${request.locale.bcp47} conventions for units, currency, names and spelling.`,
    `6. Vary demandBand. Items that are all recall fail the demand histogram check.`,
    `7. difficultyEstimate is your own 1 to 5 judgement, not a psychometric claim. No`,
    `   item here is calibrated and every one will be labelled uncalibrated.`,
    ``,
    `Write real mathematics with real numbers. Do not write placeholder text.`,
  ].join("\n");
}

export interface ItemWriterOutcome {
  items: QuestionItemType[];
  abstained: boolean;
  reason: string;
  /** Every call this stage made, in order. A gap-filling second pass adds one. */
  calls: ModelCallRecord[];
  counts: Record<string, number>;
}

function optionIds(count: number): string[] {
  return ["A", "B", "C", "D"].slice(0, count);
}

/**
 * Resolves a reference the model wrote back to a declared id.
 *
 * Models shorten long prefixed ids: asked to echo
 * `kc:au.year-7.mathematics.unit-rate` they return `unit-rate`. Discarding those
 * items threw away four of six on a real run and then failed standards coverage,
 * so a reference is matched on the full id or on a shortened form of it.
 *
 * Precedence and ambiguity:
 *  - An exact id always resolves, even when its trailing slug is ambiguous.
 *  - A shortened form resolves only when exactly one id claims it. Two components
 *    ending `.unit-rate` make the bare `unit-rate` ambiguous, and an ambiguous
 *    reference resolves to undefined rather than to whichever id was seen first.
 *    Guessing between two components would silently mis-tag an item, which is worse
 *    than discarding it, because a mis-tagged item still counts toward coverage.
 *  - An unknown reference resolves to undefined.
 *
 * This is a lookup, not a leniency. The reference still has to name something the
 * caller declared; anything else is left for the validators to reject.
 */
export function buildReferenceResolver(
  ids: readonly string[],
): (reference: string) => string | undefined {
  const exact = new Set(ids);
  const claims = new Map<string, Set<string>>();

  for (const id of ids) {
    const withoutPrefix = id.slice(id.indexOf(":") + 1);
    const tail = withoutPrefix.slice(withoutPrefix.lastIndexOf(".") + 1);
    for (const key of [withoutPrefix, tail]) {
      if (key.length === 0 || exact.has(key)) continue;
      const claimants = claims.get(key) ?? new Set<string>();
      claimants.add(id);
      claims.set(key, claimants);
    }
  }

  const unambiguous = new Map<string, string>();
  for (const [key, claimants] of claims) {
    if (claimants.size === 1) unambiguous.set(key, [...claimants][0]!);
  }

  return (reference) => {
    const key = reference.trim();
    if (exact.has(key)) return key;
    return unambiguous.get(key);
  };
}

/**
 * Runs the item writer and then attacks its own output with the deterministic item
 * validators. Returns an abstention rather than throwing, so the caller falls
 * through to the deterministic bank.
 */
export async function writeItemsWithModel(input: {
  request: CompilationRequest;
  graph: CurriculumGraph;
  coursePlan?: CoursePlan;
  modelClient: ModelClient;
  itemsPerComponent?: number;
}): Promise<ItemWriterOutcome> {
  const { request, graph, modelClient } = input;
  const itemsPerComponent = input.itemsPerComponent ?? 1;
  const modelName = modelClient.name === "xai" ? "grok-4.6" : "mock-deterministic";

  /**
   * Resolves a reference the model wrote back to a declared id.
   *
   * Models shorten long prefixed ids: asked to echo
   * `kc:au.year-7.mathematics.unit-rate` they return `unit-rate`. Discarding those
   * items threw away four of six on a real run and then failed standards coverage,
   * so the reference is matched on the full id or on its trailing slug.
   *
   * This is a lookup, not a leniency. The reference still has to name something the
   * graph declares; anything else resolves to undefined and the item is discarded or
   * the distractor left unlinked for the validator to reject.
   */
  const resolveComponent = buildReferenceResolver(
    graph.knowledgeComponents.map((kc) => kc.knowledgeComponentId),
  );
  const resolveMisconception = buildReferenceResolver(
    graph.misconceptions.map((m) => m.misconceptionId),
  );

  const calls: ModelCallRecord[] = [];
  const discards = { unknownComponent: 0, badOptionCount: 0, failedContract: 0 };
  const perComponent = new Map<string, number>();
  const items: QuestionItemType[] = [];

  const abstained = (reason: string): ItemWriterOutcome => ({
    items: [],
    abstained: true,
    reason,
    counts: {},
    calls: calls.length > 0
      ? calls
      : [
          {
            agentId: "agent:item-writer",
            model: modelName,
            promptVersion: ITEM_WRITER_PROMPT_VERSION,
            abstained: true,
            latencyMs: 0,
            inputTokens: 0,
            outputTokens: 0,
          },
        ],
  });

  /** Assessable components that do not yet hold an item which survived validation. */
  function uncoveredComponents(current: QuestionItemType[]): string[] {
    const shipped = new Set(
      current
        .filter((item) => !item.rejection)
        .flatMap((item) => item.knowledgeComponentIds),
    );
    return graph.knowledgeComponents
      .filter((kc) => !kc.prerequisiteOnly)
      .map((kc) => kc.knowledgeComponentId)
      .filter((id) => !shipped.has(id));
  }

  /**
   * One pass over the writer. Appends whatever survives to `items` and records the
   * call. Returns how many proposals the model made, so the caller can tell an empty
   * response from a fully discarded one.
   */
  async function runPass(only?: readonly string[]): Promise<number | undefined> {
    const modelRequest: StructuredModelRequest<ItemProposal> = {
      role: "item_writer",
      promptVersion: ITEM_WRITER_PROMPT_VERSION,
      prompt: buildPrompt({ request, graph, itemsPerComponent, only, retry: only !== undefined }),
      schema: ITEM_SCHEMA,
      // Decomposition, not deep reasoning. Low effort answers in seconds rather than
      // minutes, and a stage that times out helps nobody.
      reasoningEffort: "low",
      parse: (raw) => {
        const value = raw as ItemProposal;
        if (!Array.isArray(value?.items) || value.items.length === 0) {
          throw new Error("no items returned");
        }
        return value;
      },
    };

    const response = await modelClient.complete(modelRequest);
    if (!response.ok) {
      calls.push({
        agentId: "agent:item-writer",
        model: modelName,
        promptVersion: ITEM_WRITER_PROMPT_VERSION,
        abstained: true,
        latencyMs: 0,
        inputTokens: 0,
        outputTokens: 0,
      });
      return undefined;
    }

    calls.push({
      agentId: "agent:item-writer",
      model: modelName,
      promptVersion: ITEM_WRITER_PROMPT_VERSION,
      abstained: false,
      latencyMs: response.latencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });

    for (const proposed of response.value.items) {
      const kcId = resolveComponent(proposed.knowledgeComponentId);
      if (!kcId) {
        discards.unknownComponent += 1;
        continue;
      }
      // A gap-filling pass may only write for the components it was asked about.
      if (only && !only.includes(kcId)) {
        discards.unknownComponent += 1;
        continue;
      }
      if (proposed.options.length < 3 || proposed.options.length > 4) {
        discards.badOptionCount += 1;
        continue;
      }

      const index = (perComponent.get(kcId) ?? 0) + 1;
      perComponent.set(kcId, index);
      const component = graph.knowledgeComponents.find((kc) => kc.knowledgeComponentId === kcId)!;
      const ids = optionIds(proposed.options.length);

      const options = proposed.options.map((option, position) => ({
        optionId: ids[position]!,
        text: option.text,
        correct: option.correct,
        rationale: option.rationale,
        // An incorrect option keeps its misconception only if the graph declares it.
        // A distractor pointing at an undeclared misconception fails the validator,
        // which is the correct outcome: the link is the artifact, not the label.
        misconceptionId: option.correct
          ? undefined
          : resolveMisconception(option.misconceptionSlug),
      }));

      // correctOptionId is recomputed from the options rather than trusted. When the
      // model marks two keys, this records the first and the validator catches the
      // disagreement, which is exactly the rejection the demo shows.
      const key = options.find((option) => option.correct);

      const candidate = {
        schemaVersion: "0.1.0",
        itemId: `item:${kcId.replace(/^kc:/, "")}.${String(index).padStart(2, "0")}`,
        purpose:
          request.assessmentTarget === "official_exam_emulation" ? "test_emulation" : "formative",
        stem: proposed.stem,
        options,
        correctOptionId: key?.optionId ?? "A",
        keyRationale: proposed.keyRationale,
        standardIds:
          component.standardIds.length > 0 ? component.standardIds : request.standardIds.slice(0, 1),
        knowledgeComponentIds: [kcId],
        difficulty: {
          band: proposed.demandBand,
          estimate: Math.min(5, Math.max(1, Math.round(proposed.difficultyEstimate))),
          // Never negotiable. No response data exists, so nothing here is calibrated
          // and differential item functioning has not been measured.
          calibrated: false,
          difStatus: "not_yet_measured" as const,
        },
        evidence: [],
      };

      const parsed = QuestionItem.safeParse(candidate);
      if (!parsed.success) {
        discards.failedContract += 1;
        continue;
      }
      items.push(parsed.data);
    }

    return response.value.items.length;
  }

  const proposedFirst = await runPass();
  if (proposedFirst === undefined) {
    return abstained(
      `Item writer abstained on its first pass. The deterministic bank runs instead.`,
    );
  }

  // Bounded at two passes, the same cap every loop in this pipeline uses. The floor
  // is standards coverage: an assessable component with no surviving item means a
  // requested standard goes unassessed, which fails the coverage check and produces
  // a draft with nothing to practise. One targeted retry, then live with the result.
  let gapFilled = 0;
  let missing = uncoveredComponents(stampRejections(items, graph));
  if (missing.length > 0) {
    const before = items.length;
    await runPass(missing);
    gapFilled = items.length - before;
    missing = uncoveredComponents(stampRejections(items, graph));
  }

  if (items.length === 0) {
    return abstained(
      `Item writer proposed ${proposedFirst} items across two passes and none satisfied the item contract. The deterministic bank runs instead.`,
    );
  }

  const stamped = stampRejections(items, graph);
  const rejected = stamped.filter((item) => item.rejection).length;
  const discarded =
    discards.unknownComponent + discards.badOptionCount + discards.failedContract;

  return {
    items: stamped,
    abstained: false,
    reason:
      `Wrote ${stamped.length} items across ${perComponent.size} knowledge components in ${calls.length} pass${calls.length === 1 ? "" : "es"}. ` +
      `${rejected} rejected by a deterministic validator, ${discarded} discarded before validation` +
      (gapFilled > 0 ? `, ${gapFilled} added by a gap-filling pass` : "") +
      (missing.length > 0
        ? `. ${missing.length} components still have no usable item after two passes.`
        : "."),
    calls,
    counts: {
      written: stamped.length,
      rejected,
      shipped: stamped.length - rejected,
      discarded,
      // Broken out so the next bad run is a reading rather than a guess.
      discardedUnknownComponent: discards.unknownComponent,
      discardedBadOptionCount: discards.badOptionCount,
      discardedFailedContract: discards.failedContract,
      passes: calls.length,
      gapFilled,
      componentsWithoutItem: missing.length,
      distractors: stamped.reduce(
        (total, item) => total + item.options.filter((option) => !option.correct).length,
        0,
      ),
    },
  };
}

/**
 * Stamps each item that a blocking item validator rejects with the check that caught
 * it. Rejected items stay in the bundle: they are the evidence the gates ran, and
 * deleting them would make a clean bundle indistinguishable from an unchecked one.
 */
export function stampRejections(
  items: QuestionItemType[],
  graph: CurriculumGraph,
): QuestionItemType[] {
  return items.map((item) => {
    const checks = validateItems([item], graph);
    const failed = checks.find((check) => check.blocking && check.status === "fail");
    if (!failed) return item;
    return {
      ...item,
      rejection: {
        checkId: failed.checkId,
        reason: `${failed.label}: ${failed.detail} Rejected rather than repaired.`,
      },
    };
  });
}
