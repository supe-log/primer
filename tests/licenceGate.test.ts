import { describe, expect, it } from "vitest";
import { CompilationResult, type SourceManifest } from "@contracts";
import { evaluateGate } from "../server/compiler/evidenceGate";
import {
  evaluateLicenceGate,
  exportLeaksCiteOnlyBody,
  exportSourceCitations,
  mayRedistributeSource,
  stripCiteOnlyBodies,
} from "../server/compiler/licence/gate";
import compilationResult from "../fixtures/compilation-result.json";

const sample = CompilationResult.parse(compilationResult);
const manifest = sample.sourceManifest;

function withPosture(sourceId: string, posture: "cite_only" | "unknown", mayRedistribute: boolean): SourceManifest {
  return {
    ...manifest,
    sources: manifest.sources.map((source) =>
      source.sourceId === sourceId
        ? {
            ...source,
            licence: { ...source.licence, posture, mayRedistribute },
          }
        : source,
    ),
  };
}

describe("licence gate", () => {
  it("blocks redistribution for every cite-only source in the sample manifest", () => {
    const citeOnly = manifest.sources.filter((source) => source.licence.posture === "cite_only");
    expect(citeOnly.length).toBeGreaterThan(0);
    for (const source of citeOnly) {
      expect(mayRedistributeSource(source)).toBe(false);
    }

    const checks = evaluateLicenceGate(manifest);
    const redistribute = checks.find((check) => check.checkId === "check:source.cite-only-no-redistribute");
    expect(redistribute?.status).toBe("pass");
    expect(evaluateGate(checks).verdict).not.toBe("AMBER");
  });

  it("fails closed when a cite-only source claims it may be redistributed", () => {
    const broken = withPosture("src:ies.interleaving-rct", "cite_only", true);
    const checks = evaluateLicenceGate(broken);
    const redistribute = checks.find((check) => check.checkId === "check:source.cite-only-no-redistribute");
    expect(redistribute?.status).toBe("fail");
    expect(redistribute?.blocking).toBe(true);
    expect(evaluateGate(checks)).toEqual({ verdict: "AMBER", permission: "investigate" });
  });

  it("caps unknown licences and blocks redistribution", () => {
    const broken = withPosture("src:ies.interleaving-rct", "unknown", false);
    expect(mayRedistributeSource(broken.sources.find((source) => source.sourceId === "src:ies.interleaving-rct")!)).toBe(
      false,
    );
    const checks = evaluateLicenceGate(broken);
    const unknown = checks.find((check) => check.checkId === "check:source.unknown-blocks-redistribution");
    expect(unknown?.status).toBe("fail");
    expect(evaluateGate(checks)).toEqual({ verdict: "AMBER", permission: "investigate" });
  });

  it("exports cite-only sources as a citation and a link, never the body", () => {
    const protectedBodies = {
      "src:ies.interleaving-rct": "PROTECTED IES INTERLEAVING PASSAGE THAT MUST NOT LEAVE THE BOX",
    };
    const exported = exportSourceCitations(manifest, protectedBodies);
    const citeOnly = exported.find((entry) => entry.sourceId === "src:ies.interleaving-rct");
    expect(citeOnly?.url).toMatch(/^https?:/);
    expect(citeOnly?.attributionText.length).toBeGreaterThan(0);
    expect(citeOnly?.quotedText).toBeUndefined();

    const redistributable = exported.find((entry) => entry.sourceId === "src:acara.v9.terms");
    expect(redistributable).toBeDefined();
  });

  it("renders attribution text verbatim on every citation", () => {
    const exported = exportSourceCitations(manifest);
    expect(exported.length).toBe(manifest.sources.length);
    for (const citation of exported) {
      const source = manifest.sources.find((entry) => entry.sourceId === citation.sourceId);
      expect(citation.attributionText).toBe(source?.licence.attributionText);
      expect(citation.attributionText.length).toBeGreaterThan(0);
    }
  });

  it("strips cite-only snapshot text if it leaks into an export payload", () => {
    const body = "PROTECTED IES INTERLEAVING PASSAGE THAT MUST NOT LEAVE THE BOX";
    const leaked = {
      lesson: `Students should read: ${body}`,
      citation: "src:ies.interleaving-rct",
    };
    const safe = stripCiteOnlyBodies(leaked, { "src:ies.interleaving-rct": body });
    expect(JSON.stringify(safe)).not.toContain(body);
    expect(exportLeaksCiteOnlyBody(safe, { "src:ies.interleaving-rct": body })).toEqual([]);
    expect(exportLeaksCiteOnlyBody(leaked, { "src:ies.interleaving-rct": body })).toEqual([
      "src:ies.interleaving-rct",
    ]);
  });
});
