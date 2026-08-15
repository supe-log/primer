/**
 * Turns a shipped item stem into a picture. Numbers come from the stem only.
 * If we cannot read a picture, we return null and the player stays on text.
 */

export type MathScene =
  | { kind: "ratio-counters"; left: number; right: number; leftLabel: string; rightLabel: string }
  | { kind: "share-bar"; total: number; left: number; right: number; unit: string }
  | { kind: "fraction-bar"; num: number; den: number }
  | { kind: "percent-bar"; num: number; den: number }
  | { kind: "number-line"; from: number; to: number; markA: number; markB: number }
  | { kind: "scale-mix"; fromA: number; fromB: number; toA: number; fromBUnit: string }
  | { kind: "power-product"; base: number; expA: number; expB: number }
  | { kind: "zero-power"; base: number }
  | { kind: "decimal-strip"; num: number; den: number }
  | { kind: "root-line"; root: number }
  | { kind: "square-tiles"; sidePower: { base: number; exp: number } };

const RATIO_COUNTERS =
  /ratio\s+(\d+)\s*:\s*(\d+)/i;
const SHARE =
  /share\s+\$(\d+)\s+in the ratio\s+(\d+)\s*:\s*(\d+)/i;
const FRACTION =
  /fraction\s+(\d+)\s*\/\s*(\d+)/i;
const PERCENT =
  /percentage is equivalent to the fraction\s+(\d+)\s*\/\s*(\d+)/i;
const NUMBER_LINE =
  /number line marked from\s+[−-](\d+)\s+to\s+(\d+).+halfway between\s+(\d+)\s+and\s+[−-](\d+)/i;
const CORDIAL =
  /(\d+)\s*mL of syrup to\s+(\d+)\s*L of water.+for\s+(\d+)\s*mL of syrup/i;
const POWER_PRODUCT =
  /simplify\s+(\d+)\^(\d+)\s*×\s*(\d+)\^(\d+)/i;
const ZERO_POWER = /value of\s+(\d+)\^0/i;
const DECIMAL = /decimal for\s+(\d+)\s*\/\s*(\d+)/i;
const ROOT_LINE = /√(\d+)\s+lie/i;
const SQUARE = /side length\s+(\d+)\^(\d+)/i;

export function parseMathScene(stem: string): MathScene | null {
  const share = stem.match(SHARE);
  if (share) {
    return {
      kind: "share-bar",
      total: Number(share[1]),
      left: Number(share[2]),
      right: Number(share[3]),
      unit: "$",
    };
  }

  const counters = stem.match(RATIO_COUNTERS);
  if (counters && /counter|red|blue/i.test(stem)) {
    return {
      kind: "ratio-counters",
      left: Number(counters[1]),
      right: Number(counters[2]),
      leftLabel: "red",
      rightLabel: "blue",
    };
  }

  const percent = stem.match(PERCENT);
  if (percent) {
    return { kind: "percent-bar", num: Number(percent[1]), den: Number(percent[2]) };
  }

  const fraction = stem.match(FRACTION);
  if (fraction) {
    return { kind: "fraction-bar", num: Number(fraction[1]), den: Number(fraction[2]) };
  }

  const line = stem.match(NUMBER_LINE);
  if (line) {
    return {
      kind: "number-line",
      from: -Number(line[1]),
      to: Number(line[2]),
      markA: Number(line[3]),
      markB: -Number(line[4]),
    };
  }

  const mix = stem.match(CORDIAL);
  if (mix) {
    return {
      kind: "scale-mix",
      fromA: Number(mix[1]),
      fromB: Number(mix[2]) * 1000,
      toA: Number(mix[3]),
      fromBUnit: "mL",
    };
  }

  const product = stem.match(POWER_PRODUCT);
  if (product && product[1] === product[3]) {
    return {
      kind: "power-product",
      base: Number(product[1]),
      expA: Number(product[2]),
      expB: Number(product[4]),
    };
  }

  const zero = stem.match(ZERO_POWER);
  if (zero) {
    return { kind: "zero-power", base: Number(zero[1]) };
  }

  const decimal = stem.match(DECIMAL);
  if (decimal) {
    return { kind: "decimal-strip", num: Number(decimal[1]), den: Number(decimal[2]) };
  }

  const root = stem.match(ROOT_LINE);
  if (root) {
    return { kind: "root-line", root: Number(root[1]) };
  }

  const square = stem.match(SQUARE);
  if (square) {
    return {
      kind: "square-tiles",
      sidePower: { base: Number(square[1]), exp: Number(square[2]) },
    };
  }

  return null;
}
