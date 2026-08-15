import { describe, expect, it } from "vitest";
import { CompilationRequest, type CompilationRequest as Request } from "@contracts";
import { createCompiler } from "../server/compiler";
import { MockModelClient } from "../server/compiler/model/modelClient";
import { buildPublicExport } from "../server/compiler/export/publicBundle";
import demoRequestJson from "../fixtures/demo-request.json";

/**
 * What a refused non-Australian run is allowed to cite.
 *
 * This came out of a live backtest. The Texas and NCERT adapters have no curriculum
 * snapshot, and the contract still requires at least one source on every result, so
 * they were pointed at the Australian licence page as a placeholder. The refusal
 * then rendered a citations panel headed "Australian Curriculum: copyright and
 * terms of use", which made the Texas card read as though Texas had been compiled
 * from ACARA.
 *
 * The fix is at the source, not the presentation: an adapter with no curriculum of
 * its own falls back to the jurisdiction-neutral pedagogy sources, never to another
 * country's curriculum or licence page.
 */

const demoRequest = CompilationRequest.parse(demoRequestJson);

function requestFor(patch: Partial<Request>): Request {
  return CompilationRequest.parse({ ...demoRequest, ...patch });
}

function compiler() {
  return createCompiler({ modelClient: new MockModelClient() });
}

const TEXAS = requestFor({
  requestId: "req:test.export.ustx",
  jurisdictionId: "us-tx",
  curriculumSourceId: "teks.rla",
  subject: "Reading Language Arts",
  stage: { localLabel: "Grade 5", ageBand: [10, 11], ordinal: 6 },
  standardIds: ["std:teks.rla.g5.requested"],
  locale: {
    bcp47: "en-US",
    script: "Latn",
    numeralSystem: "latn",
    direction: "ltr",
    resourceTier: "high",
  },
});

const NCERT = requestFor({
  requestId: "req:test.export.in",
  jurisdictionId: "in",
  curriculumSourceId: "ncert.ncf",
  stage: { localLabel: "Middle Stage, Class 7", ageBand: [12, 13], ordinal: 8 },
  standardIds: ["std:ncert.math.c7.requested"],
});

describe("a refused non-Australian run does not look Australian", () => {
  const cases: Array<[string, Request, string]> = [
    ["Texas", TEXAS, "Texas Education Agency"],
    ["NCERT", NCERT, "National Council of Educational Research and Training"],
  ];

  for (const [name, request, authority] of cases) {
    it(`cites no ACARA source on the ${name} card`, async () => {
      const result = await compiler().compile(request);
      expect(result.status).toBe("refused");

      // No acara source at all, not merely no acara *curriculum* source: the
      // licence page is titled "Australian Curriculum: copyright and terms of use"
      // and reads exactly as Australian in a citations panel.
      for (const source of result.sourceManifest.sources) {
        expect(source.sourceId.startsWith("src:acara")).toBe(false);
      }
      const exported = buildPublicExport(result);
      expect(
        exported.citations.filter((citation) => citation.sourceId.startsWith("src:acara")),
      ).toEqual([]);
    });

    it(`still names the right authority and ships a plan for ${name}`, async () => {
      const result = await compiler().compile(request);
      expect(result.refusal?.missingEvidence.join(" ")).toContain(authority);
      expect(result.refusal?.collectionPlan.length).toBeGreaterThan(0);
      expect(result.graph).toBeUndefined();
      expect(result.items).toHaveLength(0);
      expect(result.approvedByHuman).toBe(false);
    });

    it(`still exports attributed citations for ${name}, so the card is not blank`, async () => {
      const result = await compiler().compile(request);
      const exported = buildPublicExport(result);

      // The contract requires at least one source on every result, so a refusal is
      // never sourceless. What it must not be is sourced to the wrong country.
      expect(exported.citations.length).toBeGreaterThan(0);
      for (const citation of exported.citations) {
        expect(citation.attributionText.length).toBeGreaterThan(0);
        expect(citation.url).toMatch(/^https?:/);
      }
    });
  }

  it("keeps the Texas request in en-US rather than inheriting en-AU", async () => {
    const result = await compiler().compile(TEXAS);
    expect(result.request.locale.bcp47).toBe("en-US");
  });

  it("never reproduces a cite-only body on a refusal", async () => {
    const result = await compiler().compile(TEXAS);
    const exported = buildPublicExport(result);
    const citeOnly = exported.licence.citeOnlySourceIds;

    expect(citeOnly.length).toBeGreaterThan(0);
    for (const citation of exported.citations) {
      if (citeOnly.includes(citation.sourceId)) {
        expect(citation.quotedText).toBeUndefined();
      }
    }
  });
});

describe("an Australian compile still cites exactly what it used", () => {
  it("cites the Year 7 snapshot and not the Year 8 one", async () => {
    const result = await compiler().compile(demoRequest);
    const ids = buildPublicExport(result).citations.map((citation) => citation.sourceId);

    expect(ids).toContain("src:acara.v9.mathematics.year-7");
    expect(ids).not.toContain("src:acara.v9.mathematics.year-8");
  });
});
