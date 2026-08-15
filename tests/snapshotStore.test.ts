import { describe, expect, it } from "vitest";
import {
  allSnapshots,
  findSnapshot,
  sha256,
  snapshotAgeDays,
  spanMatches,
} from "../server/compiler/sources/snapshotStore";
import {
  buildSourceManifest,
  catalogueFromSnapshot,
  evidenceIsSupported,
} from "../server/compiler/sources/catalogue";

const ACARA_MATHS = "src:acara.v9.mathematics.year-7";

describe("snapshot store", () => {
  it("holds only snapshots whose digest matches their bytes", () => {
    const stored = allSnapshots();
    expect(stored.length).toBeGreaterThan(0);
    for (const entry of stored) {
      expect(entry.snapshot.contentSha256).toBe(sha256(entry.body));
      expect(entry.snapshot.fetched).toBe(true);
      expect(entry.snapshot.contentSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("reports snapshot age in whole days and never negative", () => {
    const snapshot = findSnapshot(ACARA_MATHS)!.snapshot;
    const retrieved = new Date(snapshot.retrievedAt);
    const later = new Date(retrieved.getTime() + 3 * 86_400_000 + 60_000);
    expect(snapshotAgeDays(snapshot, later)).toBe(3);
    expect(snapshotAgeDays(snapshot, new Date(retrieved.getTime() - 86_400_000))).toBe(0);
  });

  it("matches a span across whitespace differences but not a span that is absent", () => {
    const body = "recognise, represent and    solve problems\ninvolving ratios";
    expect(spanMatches(body, "recognise, represent and solve problems involving ratios")).toBe(true);
    expect(spanMatches(body, "solve problems involving proportions")).toBe(false);
    expect(spanMatches(body, "   ")).toBe(false);
  });
});

describe("curriculum catalogue", () => {
  it("reads content descriptions verbatim with the authority's own codes", () => {
    const catalogue = catalogueFromSnapshot(ACARA_MATHS)!;
    expect(catalogue.standards.length).toBeGreaterThanOrEqual(30);

    const ratios = catalogue.standards.find((s) => s.sourceCode === "AC9M7N08")!;
    expect(ratios.standardId).toBe("std:acara.v9.ac9m7n08");
    expect(ratios.statement).toBe("recognise, represent and solve problems involving ratios");
    // The code is never renumbered, and the statement is never paraphrased.
    expect(ratios.sourceCode).toMatch(/^AC9M7/);
  });

  it("gives every standard an evidence span that matches the snapshot it names", () => {
    const catalogue = catalogueFromSnapshot(ACARA_MATHS)!;
    for (const standard of catalogue.standards) {
      for (const reference of standard.evidence) {
        expect(reference.sourceId).toBe(ACARA_MATHS);
        expect(evidenceIsSupported(reference)).toBe(true);
      }
    }
  });

  it("treats a span that is not in the snapshot as unsupported", () => {
    expect(
      evidenceIsSupported({
        sourceId: ACARA_MATHS,
        quotedSpan: "students must memorise the seventeen times table before ratios",
      }),
    ).toBe(false);
  });

  it("treats an unknown source as unsupported rather than throwing", () => {
    expect(evidenceIsSupported({ sourceId: "src:not.a.source", quotedSpan: "anything" })).toBe(
      false,
    );
  });

  it("resolves requested ids in request order and drops ids it does not know", () => {
    const catalogue = catalogueFromSnapshot(ACARA_MATHS)!;
    const resolved = catalogue.resolve([
      "std:acara.v9.ac9m7m06",
      "std:acara.v9.nope",
      "std:acara.v9.ac9m7n08",
    ]);
    expect(resolved.map((s) => s.sourceCode)).toEqual(["AC9M7M06", "AC9M7N08"]);
  });

  it("carries elaborations and the achievement standard for backward design", () => {
    const catalogue = catalogueFromSnapshot(ACARA_MATHS)!;
    expect(catalogue.elaborations("AC9M7N08").length).toBeGreaterThan(0);
    expect(catalogue.achievementStandard.length).toBeGreaterThan(0);
  });

  it("returns undefined for a snapshot that is not in the store", () => {
    expect(catalogueFromSnapshot("src:nowhere")).toBeUndefined();
  });
});

describe("source manifest", () => {
  it("carries both licence postures the gate has to enforce", () => {
    const manifest = buildSourceManifest([ACARA_MATHS, "src:ies.interleaving-rct"]);
    const postures = manifest.sources.map((source) => source.licence.posture);
    expect(postures).toContain("redistributable");
    expect(postures).toContain("cite_only");

    const citeOnly = manifest.sources.find((s) => s.licence.posture === "cite_only")!;
    expect(citeOnly.licence.mayRedistribute).toBe(false);
    expect(citeOnly.licence.attributionText.length).toBeGreaterThan(0);
  });

  it("throws rather than quietly omitting a source it cannot find", () => {
    // A manifest that silently drops a source would let evidence downstream point at
    // something this run never read.
    expect(() => buildSourceManifest([ACARA_MATHS, "src:missing"])).toThrow(/no snapshot/);
  });
});
