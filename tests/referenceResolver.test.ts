import { describe, expect, it } from "vitest";
import { buildReferenceResolver } from "../server/compiler/stages/itemWriter";

/**
 * The item writer's reference resolver, pinned.
 *
 * It exists because models shorten long prefixed ids, and discarding those items
 * threw away four of six on a real run. It is the one place in the pipeline that
 * deliberately accepts something other than an exact id, so its edges matter: what
 * it accepts, and — more importantly — what it refuses to guess at.
 */

const Y7 = "kc:au.year-7.mathematics.unit-rate";
const Y7_RATIO = "kc:au.year-7.mathematics.ratio-notation";

describe("buildReferenceResolver", () => {
  it("resolves a full id", () => {
    const resolve = buildReferenceResolver([Y7, Y7_RATIO]);
    expect(resolve(Y7)).toBe(Y7);
    expect(resolve(Y7_RATIO)).toBe(Y7_RATIO);
  });

  it("resolves an unambiguous trailing slug", () => {
    const resolve = buildReferenceResolver([Y7, Y7_RATIO]);
    expect(resolve("unit-rate")).toBe(Y7);
    expect(resolve("ratio-notation")).toBe(Y7_RATIO);
  });

  it("resolves the id with its prefix stripped", () => {
    const resolve = buildReferenceResolver([Y7]);
    expect(resolve("au.year-7.mathematics.unit-rate")).toBe(Y7);
  });

  it("tolerates surrounding whitespace", () => {
    const resolve = buildReferenceResolver([Y7]);
    expect(resolve("  unit-rate \n")).toBe(Y7);
  });

  it("returns undefined for an unknown reference", () => {
    const resolve = buildReferenceResolver([Y7, Y7_RATIO]);
    expect(resolve("kc:au.year-7.mathematics.not-a-component")).toBeUndefined();
    expect(resolve("something-else")).toBeUndefined();
    expect(resolve("")).toBeUndefined();
  });

  describe("collision", () => {
    // Two components from different stages share the tail "unit-rate". Guessing
    // between them would silently mis-tag an item, and a mis-tagged item still
    // counts toward standards coverage, so it is worse than discarding it.
    const Y8 = "kc:au.year-8.mathematics.unit-rate";

    it("refuses to resolve a bare slug that two ids claim", () => {
      const resolve = buildReferenceResolver([Y7, Y8]);
      expect(resolve("unit-rate")).toBeUndefined();
    });

    it("does not let declaration order decide the winner", () => {
      // First-writer-wins was the previous behaviour and is the bug this pins.
      expect(buildReferenceResolver([Y7, Y8])("unit-rate")).toBeUndefined();
      expect(buildReferenceResolver([Y8, Y7])("unit-rate")).toBeUndefined();
    });

    it("still resolves each full id exactly", () => {
      const resolve = buildReferenceResolver([Y7, Y8]);
      expect(resolve(Y7)).toBe(Y7);
      expect(resolve(Y8)).toBe(Y8);
    });

    it("still resolves the unambiguous prefix-stripped forms", () => {
      const resolve = buildReferenceResolver([Y7, Y8]);
      // These differ from each other, so neither is ambiguous.
      expect(resolve("au.year-7.mathematics.unit-rate")).toBe(Y7);
      expect(resolve("au.year-8.mathematics.unit-rate")).toBe(Y8);
    });

    it("leaves an unrelated component resolvable when another pair collides", () => {
      const resolve = buildReferenceResolver([Y7, Y8, Y7_RATIO]);
      expect(resolve("unit-rate")).toBeUndefined();
      expect(resolve("ratio-notation")).toBe(Y7_RATIO);
    });

    it("resolves a three-way collision to undefined, not to any of the three", () => {
      const third = "kc:in.class-7.mathematics.unit-rate";
      const resolve = buildReferenceResolver([Y7, Y8, third]);
      expect(resolve("unit-rate")).toBeUndefined();
    });
  });

  describe("degenerate input", () => {
    it("handles an empty id list", () => {
      const resolve = buildReferenceResolver([]);
      expect(resolve("anything")).toBeUndefined();
    });

    it("handles an id with no prefix and no dots", () => {
      const resolve = buildReferenceResolver(["standalone"]);
      expect(resolve("standalone")).toBe("standalone");
    });

    it("prefers an exact id over a shortened form that collides with it", () => {
      // "unit-rate" is both a declared id and the tail of another declared id. The
      // exact match wins rather than the reference becoming ambiguous.
      const resolve = buildReferenceResolver(["unit-rate", Y7]);
      expect(resolve("unit-rate")).toBe("unit-rate");
      expect(resolve(Y7)).toBe(Y7);
    });

    it("tolerates a duplicated id without treating it as a collision", () => {
      const resolve = buildReferenceResolver([Y7, Y7]);
      expect(resolve("unit-rate")).toBe(Y7);
    });
  });
});
