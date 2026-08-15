import { describe, expect, it } from "vitest";
import { WorkedExample } from "@contracts";
import { workedExampleFor } from "../server/compiler/stages/workedExamples";

/**
 * Worked examples must do real arithmetic on real numbers, must not hand over the
 * answer to the item the learner is about to attempt, and must not exist at all
 * when neither is possible.
 */

function example(stem: string) {
  return workedExampleFor({ stem } as never, "kc:test.component");
}

const GENERIC = [
  "knowledge component",
  "the representation",
  "A worked example for:",
  "state the units",
];

describe("worked examples", () => {
  it("derives share-in-a-ratio steps that actually divide the money", () => {
    const worked = example("Share $40 in the ratio 2:3. How much is the larger share?")!;
    expect(worked).toBeDefined();
    expect(() => WorkedExample.parse(worked)).not.toThrow();

    const text = worked.steps.join(" ");
    // 5 parts, and every step lands on a whole number.
    expect(text).toContain("2 + 3 = 5 parts");
    expect(text).toMatch(/÷ 5 = \$\d+/);
    expect(worked.prompt).toMatch(/^Share \$\d+ in the ratio 2 : 3\.$/);
  });

  it("does not reuse the item's own numbers, so it is an example and not an answer key", () => {
    const worked = example("Share $40 in the ratio 2:3. How much is the larger share?")!;
    // $40 is the learner's problem. The example must work a different total.
    expect(worked.prompt).not.toContain("$40");
  });

  it("names the part-whole idea the misconception depends on", () => {
    const worked = example(
      "A bag has red and blue counters in the ratio 2:3. What fraction of all the counters is red?",
    )!;
    const text = worked.steps.join(" ");
    // The whole point: 2:3 compares red to blue, not red to the whole.
    expect(text).toContain("not red to the whole");
    expect(text).toContain("2/5");
  });

  it("simplifies a fraction by an actual common divisor", () => {
    const worked = example("Write the fraction 18/24 in simplest form.")!;
    const text = worked.steps.join(" ");
    expect(text).toMatch(/÷ \d+ = \d+/);
    expect(worked.prompt).not.toContain("18/24");
  });

  it("converts a percentage through out-of-100", () => {
    const worked = example("What is 16% written as a fraction in simplest form?")!;
    expect(worked.steps.join(" ")).toContain('out of 100');
    expect(worked.prompt).not.toContain("16%");
  });

  it("leaves the last steps for the learner rather than working everything", () => {
    for (const stem of [
      "Share $40 in the ratio 2:3. How much is the larger share?",
      "A bag has red and blue counters in the ratio 2:3. What fraction of all the counters is red?",
      "Write the fraction 18/24 in simplest form.",
    ]) {
      const worked = example(stem)!;
      expect(worked.fadedSteps.length).toBeGreaterThan(0);
      // Every faded index points at a real step, and something is worked first.
      for (const index of worked.fadedSteps) {
        expect(index).toBeLessThan(worked.steps.length);
        expect(worked.steps[index]).toContain("Your turn");
      }
      expect(worked.fadedSteps.length).toBeLessThan(worked.steps.length);
    }
  });

  it("emits nothing rather than a placeholder when the stem is not workable", () => {
    // The label-matching fallback item has no mathematics in it to work through.
    expect(example("Which statement correctly applies Read and write ratio notation?")).toBeUndefined();
    expect(example("Which of these is the best description of a unit rate?")).toBeUndefined();
    expect(example("")).toBeUndefined();
  });

  it("never emits the old generic scaffolding", () => {
    for (const stem of [
      "Share $40 in the ratio 2:3. How much is the larger share?",
      "A bag has red and blue counters in the ratio 2:3. What fraction of all the counters is red?",
      "Write the fraction 18/24 in simplest form.",
      "What is 16% written as a fraction in simplest form?",
    ]) {
      const worked = example(stem)!;
      const text = `${worked.prompt} ${worked.steps.join(" ")}`;
      for (const phrase of GENERIC) {
        expect(text).not.toContain(phrase);
      }
    }
  });

  it("produces different steps for different topics", () => {
    const share = example("Share $40 in the ratio 2:3. How much is the larger share?")!;
    const simplify = example("Write the fraction 18/24 in simplest form.")!;
    // The old generator emitted a byte-identical array for every component.
    expect(share.steps).not.toEqual(simplify.steps);
  });
});
