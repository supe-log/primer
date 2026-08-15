import type { CurriculumGraph, GateCheck, QuestionItem } from "@contracts";

/**
 * Deterministic item checks. These are the mechanically checkable subset of the
 * item-writing guidance: single defensible key, distractors traced to a named
 * misconception, no giveaway option text, and a measured demand histogram.
 *
 * These validators reject; they never repair. A repaired item with a hidden defect
 * is worse than a rejected item with a stated reason.
 */

const BANNED_OPTION_PATTERNS = [/all of the above/i, /none of the above/i, /both a and b/i];

export function validateItems(items: QuestionItem[], graph?: CurriculumGraph): GateCheck[] {
  const checks: GateCheck[] = [];
  const knownMisconceptions = new Set(graph?.misconceptions.map((m) => m.misconceptionId) ?? []);
  const knownKcs = new Set(graph?.knowledgeComponents.map((k) => k.knowledgeComponentId) ?? []);

  const multiKey = items.filter(
    (item) => item.options.filter((option) => option.correct).length !== 1,
  );
  const keyDisagrees = items.filter((item) => {
    const marked = item.options.find((option) => option.correct);
    return marked ? marked.optionId !== item.correctOptionId : true;
  });
  const singleKeyFailures = new Set([...multiKey, ...keyDisagrees].map((item) => item.itemId));
  checks.push({
    checkId: "check:item.single-defensible-key",
    label: "Each item has exactly one defensible key",
    kind: "deterministic",
    blocking: true,
    status: singleKeyFailures.size === 0 ? "pass" : "fail",
    detail:
      singleKeyFailures.size === 0
        ? `${items.length} items inspected, each with exactly one key that matches correctOptionId.`
        : `${singleKeyFailures.size} of ${items.length} items rejected for key problems: ${[...singleKeyFailures].join(", ")}.`,
    counts: { inspected: items.length, rejected: singleKeyFailures.size },
  });

  const unmappedDistractors = items.flatMap((item) =>
    item.options
      .filter((option) => !option.correct)
      .filter(
        (option) =>
          !option.misconceptionId ||
          (knownMisconceptions.size > 0 && !knownMisconceptions.has(option.misconceptionId)),
      )
      .map((option) => `${item.itemId}/${option.optionId}`),
  );
  const distractorCount = items.reduce(
    (total, item) => total + item.options.filter((option) => !option.correct).length,
    0,
  );
  checks.push({
    checkId: "check:item.distractor-misconception",
    label: "Every incorrect option names a known misconception",
    kind: "deterministic",
    blocking: true,
    status: unmappedDistractors.length === 0 ? "pass" : "fail",
    detail:
      unmappedDistractors.length === 0
        ? `${distractorCount} distractors, all traced to a declared misconception.`
        : `${unmappedDistractors.length} distractors have no known misconception: ${unmappedDistractors.join(", ")}.`,
    counts: { options: distractorCount, unmapped: unmappedDistractors.length },
  });

  const bannedOptions = items.flatMap((item) =>
    item.options
      .filter((option) => BANNED_OPTION_PATTERNS.some((pattern) => pattern.test(option.text)))
      .map((option) => `${item.itemId}/${option.optionId}`),
  );
  checks.push({
    checkId: "check:item.option-style",
    label: "No complex or giveaway option forms",
    kind: "deterministic",
    blocking: true,
    status: bannedOptions.length === 0 ? "pass" : "fail",
    detail:
      bannedOptions.length === 0
        ? "No all-of-the-above, none-of-the-above or combined options found."
        : `Rejected option forms: ${bannedOptions.join(", ")}.`,
    counts: { flagged: bannedOptions.length },
  });

  const unresolvedTags = items.flatMap((item) =>
    knownKcs.size === 0
      ? []
      : item.knowledgeComponentIds.filter((id) => !knownKcs.has(id)).map((id) => `${item.itemId}:${id}`),
  );
  checks.push({
    checkId: "check:item.tags-resolve",
    label: "Item knowledge component tags resolve into the graph",
    kind: "deterministic",
    blocking: true,
    status: unresolvedTags.length === 0 ? "pass" : "fail",
    detail:
      unresolvedTags.length === 0
        ? "All item tags resolve."
        : `${unresolvedTags.length} tags do not resolve: ${unresolvedTags.join(", ")}.`,
    counts: { unresolved: unresolvedTags.length },
  });

  const histogram = items.reduce<Record<string, number>>((accumulator, item) => {
    accumulator[item.difficulty.band] = (accumulator[item.difficulty.band] ?? 0) + 1;
    return accumulator;
  }, {});
  checks.push({
    checkId: "check:item.demand-histogram",
    label: "Cognitive demand distribution is measured, not assumed",
    kind: "deterministic",
    blocking: false,
    status: (histogram["recall"] ?? 0) === items.length && items.length > 1 ? "fail" : "pass",
    detail:
      `Measured demand bands: ` +
      Object.entries(histogram)
        .map(([band, count]) => `${band} ${count}`)
        .join(", ") +
      ". Language models skew toward lower-order demand, so this is counted rather than trusted.",
    counts: histogram,
  });

  const uncalibrated = items.filter((item) => !item.difficulty.calibrated).length;
  checks.push({
    checkId: "check:item.calibration-labelled",
    label: "Uncalibrated items are labelled as uncalibrated",
    kind: "deterministic",
    blocking: true,
    status: "pass",
    detail: `${uncalibrated} of ${items.length} items are uncalibrated and say so. Differential item functioning is recorded as not yet measured.`,
    counts: { uncalibrated, calibrated: items.length - uncalibrated },
  });

  return checks;
}
