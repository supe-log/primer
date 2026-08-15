import type {
  CompilationRequest,
  CoursePlan,
  CurriculumGraph,
  KnowledgeComponent,
  QuestionItem,
} from "@contracts";
import { validateItems } from "../validators/items";

/**
 * Deterministic item bank used when the model client abstains.
 *
 * Every incorrect option names a misconception from the graph. One item is
 * deliberately double-keyed and then stamped with a rejection: validators reject,
 * they never repair, and the rejected item still ships so the gate is visible.
 */

const BANDS = ["recall", "apply", "analyze"] as const;

function misconceptionFor(kc: KnowledgeComponent, graph: CurriculumGraph): string {
  const declared = kc.misconceptionIds[0];
  if (declared) return declared;
  return graph.misconceptions[0]?.misconceptionId ?? "mc:unspecified";
}

function stampRejections(items: QuestionItem[], graph: CurriculumGraph): QuestionItem[] {
  const checks = validateItems(items, graph);
  const keyCheck = checks.find((check) => check.checkId === "check:item.single-defensible-key");
  if (keyCheck?.status !== "fail") return items;

  return items.map((item) => {
    const keys = item.options.filter((option) => option.correct);
    if (keys.length === 1 && keys[0]?.optionId === item.correctOptionId) return item;
    return {
      ...item,
      rejection: {
        checkId: "check:item.single-defensible-key",
        reason: `${keys.length} defensible keys. Rejected rather than repaired.`,
      },
    };
  });
}

function goodItem(input: {
  index: number;
  kc: KnowledgeComponent;
  graph: CurriculumGraph;
  request: CompilationRequest;
}): QuestionItem {
  const misconceptionId = misconceptionFor(input.kc, input.graph);
  const standardIds =
    input.kc.standardIds.length > 0 ? input.kc.standardIds : input.request.standardIds.slice(0, 1);
  const band = BANDS[input.index % BANDS.length]!;
  const itemId = `item:${input.kc.knowledgeComponentId.replace(/^kc:/, "")}.${String(input.index + 1).padStart(2, "0")}`;

  return {
    schemaVersion: "0.1.0",
    itemId,
    purpose: "formative",
    stem: `Which statement correctly applies ${input.kc.label}?`,
    options: [
      {
        optionId: "A",
        text: `The move required by ${input.kc.label}.`,
        correct: true,
        rationale: `This is the procedure named in ${input.kc.knowledgeComponentId}.`,
      },
      {
        optionId: "B",
        text: `The nearby error: ${misconceptionId.replace(/^mc:/, "").replace(/-/g, " ")}.`,
        correct: false,
        rationale: "Targets the named misconception for this component.",
        misconceptionId,
      },
      {
        optionId: "C",
        text: "A reversed comparison that changes the meaning.",
        correct: false,
        rationale: "Reverses the order the question asked for.",
        misconceptionId,
      },
      {
        optionId: "D",
        text: "An additive move where a multiplicative one is required.",
        correct: false,
        rationale: "Uses addition in place of scaling.",
        misconceptionId,
      },
    ],
    correctOptionId: "A",
    keyRationale: `Option A is the only move that matches ${input.kc.label}.`,
    standardIds,
    knowledgeComponentIds: [input.kc.knowledgeComponentId],
    difficulty: {
      band,
      estimate: (input.index % 5) + 1,
      calibrated: false,
      difStatus: "not_yet_measured",
    },
    evidence: [],
  };
}

function rejectedDoubleKey(input: {
  kc: KnowledgeComponent;
  graph: CurriculumGraph;
  request: CompilationRequest;
}): QuestionItem {
  const misconceptionId = misconceptionFor(input.kc, input.graph);
  const standardIds =
    input.kc.standardIds.length > 0 ? input.kc.standardIds : input.request.standardIds.slice(0, 1);

  return {
    schemaVersion: "0.1.0",
    itemId: `item:${input.kc.knowledgeComponentId.replace(/^kc:/, "")}.rejected`,
    purpose: "formative",
    stem: `Which of these is the best description of ${input.kc.label}?`,
    options: [
      {
        optionId: "A",
        text: "A correct description.",
        correct: true,
        rationale: "Defensible.",
      },
      {
        optionId: "B",
        text: "An equivalent correct description.",
        correct: true,
        rationale: "Also defensible. Two keys is why the item is rejected.",
      },
      {
        optionId: "C",
        text: "An incorrect description.",
        correct: false,
        rationale: "Not the component.",
        misconceptionId,
      },
    ],
    correctOptionId: "A",
    keyRationale: "Rejected before use: two options are equally defensible.",
    standardIds,
    knowledgeComponentIds: [input.kc.knowledgeComponentId],
    difficulty: {
      band: "analyze",
      estimate: 3,
      calibrated: false,
      difStatus: "not_yet_measured",
    },
    evidence: [],
    rejection: {
      checkId: "check:item.single-defensible-key",
      reason:
        "Options A and B are equally defensible, so the item has two keys. Rejected rather than repaired.",
    },
  };
}

export function writeFallbackItems(input: {
  graph: CurriculumGraph;
  request: CompilationRequest;
  coursePlan?: CoursePlan;
}): QuestionItem[] {
  const assessed = input.graph.knowledgeComponents.filter((kc) => kc.standardIds.length > 0);
  const pool = assessed.length > 0 ? assessed : input.graph.knowledgeComponents;
  const items = pool.map((kc, index) =>
    goodItem({ index, kc, graph: input.graph, request: input.request }),
  );
  items.push(
    rejectedDoubleKey({
      kc: pool[pool.length - 1] ?? input.graph.knowledgeComponents[0]!,
      graph: input.graph,
      request: input.request,
    }),
  );

  const stamped = stampRejections(items, input.graph);
  if (!input.coursePlan) return stamped;

  const byKc = new Map<string, string[]>();
  for (const item of stamped) {
    for (const kcId of item.knowledgeComponentIds) {
      const list = byKc.get(kcId) ?? [];
      list.push(item.itemId);
      byKc.set(kcId, list);
    }
  }
  for (const lesson of input.coursePlan.lessons) {
    lesson.itemIds = lesson.introducesKnowledgeComponentIds.flatMap((kcId) => byKc.get(kcId) ?? []);
  }
  return stamped;
}
