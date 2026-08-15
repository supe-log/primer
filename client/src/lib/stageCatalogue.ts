/**
 * Official ACARA codes the intake may offer. Year 7 and Year 8 are from the
 * hashed snapshots. Year 6 has no snapshot, so the form offers nothing fetched
 * and a compile at that stage refuses instead of inventing codes.
 */

export interface StageStandardOption {
  id: string;
  label: string;
  fetched: boolean;
}

export const YEAR_7_STANDARDS: StageStandardOption[] = [
  {
    id: "std:acara.v9.ac9m7n04",
    label: "AC9M7N04 — equivalent representations of rational numbers",
    fetched: true,
  },
  {
    id: "std:acara.v9.ac9m7n08",
    label: "AC9M7N08 — recognise, represent and solve problems involving ratios",
    fetched: true,
  },
  {
    id: "std:acara.v9.ac9m7m06",
    label: "AC9M7M06 — mathematical modelling with ratios",
    fetched: true,
  },
];

export const YEAR_8_STANDARDS: StageStandardOption[] = [
  {
    id: "std:acara.v9.ac9m8n01",
    label: "AC9M8N01 — recognise irrational numbers, including square roots and π",
    fetched: true,
  },
  {
    id: "std:acara.v9.ac9m8n02",
    label: "AC9M8N02 — exponent laws with positive integer and zero exponents",
    fetched: true,
  },
  {
    id: "std:acara.v9.ac9m8n03",
    label: "AC9M8N03 — recognise terminating and recurring decimals",
    fetched: true,
  },
];

/** Unfetched sentinel so a Year 6 request still parses and the compiler can refuse. */
export const YEAR_6_UNFETCHED: StageStandardOption = {
  id: "std:acara.v9.ac9m6.requested",
  label: "No Year 6 snapshot — compile will refuse rather than invent codes",
  fetched: false,
};

export function standardsForStage(stageLabel: string): StageStandardOption[] {
  if (stageLabel === "Year 8") return YEAR_8_STANDARDS;
  if (stageLabel === "Year 6") return [YEAR_6_UNFETCHED];
  return YEAR_7_STANDARDS;
}

export function defaultStandardIdsForStage(stageLabel: string): string[] {
  return standardsForStage(stageLabel)
    .filter((option) => option.fetched)
    .map((option) => option.id);
}
