import { describe, expect, it } from "vitest";
import {
  acaraQueryUrl,
  contentDescriptions,
  parseAcaraRecords,
  standardIdForCode,
} from "../server/compiler/sources/acara";

const payload = {
  source: "acara-v9-query-api",
  levelCode: "MATMATY7",
  pageUrls: ["https://v9.australiancurriculum.edu.au/conf/acara/search/api/query.json"],
  pages: [
    {
      count: 2,
      results: [
        {
          code: "AC9M7N04",
          documentType: "CD",
          title: "Find equivalent representations of rational numbers and represent them on a number line.",
          url: "/f-10-curriculum/mathematics/year-7/ac9m7n04",
          lvl_title: "Year 7",
          la_title: "Mathematics",
        },
        {
          code: "AC9M7N04_E1",
          documentType: "EL",
          title: "Elaborating equivalent representations.",
          url: "/f-10-curriculum/mathematics/year-7/ac9m7n04",
          lvl_title: "Year 7",
          la_title: "Mathematics",
          cd_code: "AC9M7N04",
        },
        {
          code: "AC9M7N04",
          documentType: "CD",
          title: "Duplicate that must be dropped.",
          url: "/dup",
          lvl_title: "Year 7",
          la_title: "Mathematics",
        },
      ],
    },
  ],
};

describe("ACARA record parse", () => {
  it("builds a stable query URL from a level code", () => {
    const url = acaraQueryUrl({ levelCode: "MATMATY7", limit: 50 });
    expect(url).toContain("lvl_code%3AMATMATY7");
    expect(url).toContain("limit=50");
  });

  it("parses content descriptions, keeps official codes, and drops duplicates", () => {
    const records = parseAcaraRecords(`${JSON.stringify(payload)}\n`);
    expect(records).toHaveLength(2);
    expect(records[0]?.code).toBe("AC9M7N04");
    expect(records[0]?.statement).toContain("equivalent representations");
    expect(contentDescriptions(records)).toHaveLength(1);
    expect(standardIdForCode("AC9M7N04")).toBe("std:acara.v9.ac9m7n04");
  });

  it("returns an empty list for corrupt bytes rather than throwing", () => {
    expect(parseAcaraRecords("not-json")).toEqual([]);
  });
});
