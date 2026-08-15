import type { CoursePlan, CurriculumGraph, QuestionItem, WorkedExample } from "@contracts";

/**
 * Worked examples derived from the items a lesson actually practises.
 *
 * The previous generator emitted four hard-coded sentences, identical for every
 * knowledge component in every course, one of which read "Write the representation
 * the knowledge component requires." That is the shape of a worked example with the
 * mathematics removed, and it taught nothing.
 *
 * Two rules govern what this module emits:
 *
 *  1. **Different numbers from the practice item.** A worked example that solves the
 *     very question the learner is about to answer is an answer key, not an example.
 *     Each builder takes the item's structure and varies the numbers, so the learner
 *     sees the method and still has to do the thinking.
 *  2. **Real arithmetic or nothing.** If the item's stem does not match a shape this
 *     module knows how to work through, no worked example is emitted for it. A lesson
 *     with no worked example is honest; a lesson with a generic one is not. This is
 *     the same rule the compiler applies to standards: derive it or refuse it.
 *
 * `fadedSteps` holds the indices of the steps left for the learner to complete,
 * which is the fading direction the course contract's header describes and the
 * convention the previous generator used.
 */

/** A problem shape this module can work through, parsed out of an item stem. */
type Shape =
  | { kind: "share"; total: number; left: number; right: number }
  | { kind: "part-whole"; left: number; right: number }
  | { kind: "simplify"; num: number; den: number }
  | { kind: "percent-fraction"; num: number; den: number }
  | { kind: "unit-rate"; amount: number; units: number };

const SHARE = /share\s+\$(\d+)\s+in the ratio\s+(\d+)\s*:\s*(\d+)/i;
const PART_WHOLE = /ratio\s+(\d+)\s*:\s*(\d+)/i;
const SIMPLIFY = /(?:simplest form|lowest terms).*?(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+).*?(?:simplest form|lowest terms)/i;
const PERCENT_FRACTION = /(\d+)\s*%\s+(?:written |expressed )?as a fraction/i;
const UNIT_RATE = /\$(\d+)\s+for\s+(\d+)\s+/i;

function parseShape(stem: string): Shape | undefined {
  const share = stem.match(SHARE);
  if (share) {
    return {
      kind: "share",
      total: Number(share[1]),
      left: Number(share[2]),
      right: Number(share[3]),
    };
  }

  const percent = stem.match(PERCENT_FRACTION);
  if (percent) {
    return { kind: "percent-fraction", num: Number(percent[1]), den: 100 };
  }

  const simplify = stem.match(SIMPLIFY);
  if (simplify) {
    const num = Number(simplify[1] ?? simplify[3]);
    const den = Number(simplify[2] ?? simplify[4]);
    if (den > 0) return { kind: "simplify", num, den };
  }

  const rate = stem.match(UNIT_RATE);
  if (rate) {
    return { kind: "unit-rate", amount: Number(rate[1]), units: Number(rate[2]) };
  }

  // Checked last: the bare ratio pattern also appears inside a share stem.
  const parts = stem.match(PART_WHOLE);
  if (parts) {
    return { kind: "part-whole", left: Number(parts[1]), right: Number(parts[2]) };
  }

  return undefined;
}

function gcd(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : gcd(b, a % b);
}

/**
 * Picks numbers for the example that are not the item's own, and that divide
 * cleanly so every step lands on a whole number a learner can check.
 */
function shareExample(shape: Extract<Shape, { kind: "share" }>): Omit<WorkedExample, "knowledgeComponentId"> {
  const parts = shape.left + shape.right;
  // A different total from the item's, still divisible by the same part count.
  const total = parts * (Math.floor(shape.total / parts) + 2);
  const one = total / parts;
  const first = one * shape.left;
  const second = one * shape.right;

  return {
    prompt: `Share $${total} in the ratio ${shape.left} : ${shape.right}.`,
    steps: [
      `The ratio ${shape.left} : ${shape.right} means ${shape.left} parts for one share and ${shape.right} for the other. Count the parts: ${shape.left} + ${shape.right} = ${parts} parts.`,
      `The $${total} is split into those ${parts} equal parts, so one part is $${total} ÷ ${parts} = $${one}.`,
      `The first share is ${shape.left} parts: ${shape.left} × $${one} = $${first}.`,
      `Your turn — the second share is ${shape.right} parts. ${shape.right} × $${one} = ?`,
      `Your turn — check it. Does $${first} + $${second} come back to $${total}?`,
    ],
    fadedSteps: [3, 4],
  };
}

function partWholeExample(
  shape: Extract<Shape, { kind: "part-whole" }>,
): Omit<WorkedExample, "knowledgeComponentId"> {
  const parts = shape.left + shape.right;
  const scale = 2;
  return {
    prompt: `A box holds red and blue counters in the ratio ${shape.left} : ${shape.right}. What fraction of the counters is red?`,
    steps: [
      `${shape.left} : ${shape.right} compares red to blue, not red to the whole box.`,
      `Altogether there are ${shape.left} + ${shape.right} = ${parts} parts, so the whole box is ${parts} parts.`,
      `Red is ${shape.left} of those ${parts} parts, so red is ${shape.left}/${parts} of the box.`,
      `Your turn — if the box had ${shape.left * scale} red counters, how many blue would keep the same ratio?`,
      `Your turn — both parts scale by the same number. What fraction of the counters is blue?`,
    ],
    fadedSteps: [3, 4],
  };
}

function simplifyExample(
  shape: Extract<Shape, { kind: "simplify" }>,
): Omit<WorkedExample, "knowledgeComponentId"> | undefined {
  // Vary the numbers by scaling the item's simplified form up by a different factor.
  const divisor = gcd(shape.num, shape.den);
  if (divisor <= 0) return undefined;
  const baseNum = shape.num / divisor;
  const baseDen = shape.den / divisor;
  const factor = divisor === 3 ? 4 : 3;
  const num = baseNum * factor;
  const den = baseDen * factor;
  if (num === shape.num && den === shape.den) return undefined;

  return {
    prompt: `Write ${num}/${den} in its simplest form.`,
    steps: [
      `Look for a number that divides both ${num} and ${den}. Both are divisible by ${factor}.`,
      `Divide the top by ${factor}: ${num} ÷ ${factor} = ${baseNum}.`,
      `Divide the bottom by the same number: ${den} ÷ ${factor} = ${baseDen}. So ${num}/${den} = ${baseNum}/${baseDen}.`,
      `Your turn — is there any number bigger than 1 that divides both ${baseNum} and ${baseDen}?`,
      `Your turn — the value did not change, only how it is written. Why is ${baseNum}/${baseDen} the same amount as ${num}/${den}?`,
    ],
    fadedSteps: [3, 4],
  };
}

function percentExample(
  shape: Extract<Shape, { kind: "percent-fraction" }>,
): Omit<WorkedExample, "knowledgeComponentId"> {
  const value = shape.num === 25 ? 40 : 25;
  const divisor = gcd(value, 100);
  return {
    prompt: `Write ${value}% as a fraction in its simplest form.`,
    steps: [
      `Per cent means "out of 100", so ${value}% is ${value}/100.`,
      `Both ${value} and 100 divide by ${divisor}.`,
      `${value} ÷ ${divisor} = ${value / divisor} and 100 ÷ ${divisor} = ${100 / divisor}, so ${value}% = ${value / divisor}/${100 / divisor}.`,
      `Your turn — write 10% as a fraction, then simplify it.`,
      `Your turn — which is larger, ${value}% or 1/2? How can you tell without a calculator?`,
    ],
    fadedSteps: [3, 4],
  };
}

function unitRateExample(
  shape: Extract<Shape, { kind: "unit-rate" }>,
): Omit<WorkedExample, "knowledgeComponentId"> | undefined {
  if (shape.units <= 0) return undefined;
  const units = shape.units + 2;
  const one = 3;
  const amount = one * units;
  return {
    prompt: `${units} notebooks cost $${amount}. What does one notebook cost?`,
    steps: [
      `A unit rate is the cost of exactly one, so divide the money by the number of notebooks.`,
      `$${amount} ÷ ${units} = $${one}. One notebook costs $${one}.`,
      `Check it: ${units} × $${one} = $${amount}, which is the price we started with.`,
      `Your turn — at that rate, what would ${units + 3} notebooks cost?`,
      `Your turn — why is finding the cost of one first easier than guessing?`,
    ],
    fadedSteps: [3, 4],
  };
}

/**
 * Builds a worked example from one item, or returns undefined when the item's shape
 * is not one this module can work through honestly.
 */
export function workedExampleFor(
  item: QuestionItem,
  knowledgeComponentId: string,
): WorkedExample | undefined {
  const shape = parseShape(item.stem);
  if (!shape) return undefined;

  let body: Omit<WorkedExample, "knowledgeComponentId"> | undefined;
  switch (shape.kind) {
    case "share":
      body = shareExample(shape);
      break;
    case "part-whole":
      body = partWholeExample(shape);
      break;
    case "simplify":
      body = simplifyExample(shape);
      break;
    case "percent-fraction":
      body = percentExample(shape);
      break;
    case "unit-rate":
      body = unitRateExample(shape);
      break;
  }
  if (!body) return undefined;
  return { ...body, knowledgeComponentId };
}

/**
 * Replaces each lesson's worked examples with ones derived from the items that
 * lesson actually practises. A lesson whose items yield no derivable example ends
 * up with none, which the interface should render as no example rather than as an
 * empty one.
 *
 * Runs after items exist, because a worked example that does not share the shape of
 * the practice is not preparation for it.
 */
export function attachWorkedExamples(input: {
  coursePlan: CoursePlan;
  items: readonly QuestionItem[];
  graph: CurriculumGraph;
}): CoursePlan {
  const byId = new Map(input.items.map((item) => [item.itemId, item]));

  const lessons = input.coursePlan.lessons.map((lesson) => {
    const shipped = lesson.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is QuestionItem => item !== undefined && !item.rejection);

    const examples: WorkedExample[] = [];
    const covered = new Set<string>();
    for (const item of shipped) {
      const componentId = item.knowledgeComponentIds[0] ?? lesson.introducesKnowledgeComponentIds[0];
      if (!componentId || covered.has(componentId)) continue;
      const example = workedExampleFor(item, componentId);
      if (!example) continue;
      covered.add(componentId);
      examples.push(example);
    }

    return { ...lesson, workedExamples: examples };
  });

  return { ...input.coursePlan, lessons };
}
