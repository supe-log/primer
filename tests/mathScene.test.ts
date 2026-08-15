import { describe, expect, it } from "vitest";
import { parseMathScene } from "../client/src/lib/mathScene";

describe("parseMathScene", () => {
  it("reads Year 7 pictures from the shipped stems", () => {
    expect(
      parseMathScene(
        "A bag has red and blue counters in the ratio 2:3. What fraction of all the counters is red?",
      ),
    ).toEqual({
      kind: "ratio-counters",
      left: 2,
      right: 3,
      leftLabel: "red",
      rightLabel: "blue",
    });
    expect(parseMathScene("Share $40 in the ratio 2:3. How much does the first share receive?")).toEqual({
      kind: "share-bar",
      total: 40,
      left: 2,
      right: 3,
      unit: "$",
    });
    expect(parseMathScene("Write the fraction 18/24 in simplest form.")).toEqual({
      kind: "fraction-bar",
      num: 18,
      den: 24,
    });
    expect(
      parseMathScene(
        "A cordial mix uses 200 mL of syrup to 1 L of water. How many millilitres of water are needed for 100 mL of syrup?",
      ),
    ).toMatchObject({ kind: "scale-mix", fromA: 200, fromB: 1000, toA: 100 });
  });

  it("reads Year 8 pictures from the shipped stems", () => {
    expect(parseMathScene("Simplify 3^4 × 3^2 using a single power of 3.")).toEqual({
      kind: "power-product",
      base: 3,
      expA: 4,
      expB: 2,
    });
    expect(parseMathScene("What is the value of 5^0?")).toEqual({ kind: "zero-power", base: 5 });
    expect(parseMathScene("Does the decimal for 7/20 terminate or recur?")).toEqual({
      kind: "decimal-strip",
      num: 7,
      den: 20,
    });
    expect(
      parseMathScene("A square tile has side length 2^3 cm. What is its area in square centimetres, written as a single ordinary number?"),
    ).toEqual({ kind: "square-tiles", sidePower: { base: 2, exp: 3 } });
    expect(
      parseMathScene("Between which two neighbouring tenths does √2 lie on a number line?"),
    ).toEqual({ kind: "root-line", root: 2 });
  });

  it("reads leftover Year 7 stems that did not ship", () => {
    expect(parseMathScene("What percentage is equivalent to the fraction 3/5?")).toEqual({
      kind: "percent-bar",
      num: 3,
      den: 5,
    });
    expect(
      parseMathScene(
        "On a number line marked from −2 to 3, which value sits exactly halfway between 0 and −1?",
      ),
    ).toEqual({
      kind: "number-line",
      from: -2,
      to: 3,
      markA: 0,
      markB: -1,
    });
  });

  it("does not invent a picture when the stem has no numbers to draw", () => {
    expect(parseMathScene("Name the error a learner makes.")).toBeNull();
  });
});
