import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CompilationRequest, CompilationResult } from "@contracts";
import { createCompiler } from "../server/compiler";
import { MockModelClient } from "../server/compiler/model/modelClient";
import demoRequestJson from "../fixtures/demo-request.json";

/**
 * The frozen transfer-strip fixtures are what a judge sees when the network is
 * hostile, so they get the same scrutiny as a live compile: they must parse, they
 * must carry real fetched provenance, and they must not contain a placeholder
 * standard anywhere.
 */

const FIXTURE_DIR = path.resolve(import.meta.dirname, "..", "client", "src", "fixtures");

function load(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURE_DIR, `${name}.json`), "utf8"));
}

/** Wording that would mean a hand-authored standard reached the projector. */
const PLACEHOLDER_MARKERS = [
  "sample standards",
  "sample source",
  "SAMPLE-Y7",
  "Sample placeholder",
  "UNOFFICIAL-",
  "fallback map",
  "Replace with the fetched",
];

const RESULT_FIXTURES = ["compilation-result", "refusal-result", "case-a", "case-c", "case-au-y8"];

describe("frozen demo fixtures", () => {
  for (const name of RESULT_FIXTURES) {
    it(`${name} parses against CompilationResult`, () => {
      expect(() => CompilationResult.parse(load(name))).not.toThrow();
    });

    it(`${name} contains no placeholder standard`, () => {
      const blob = JSON.stringify(load(name));
      for (const marker of PLACEHOLDER_MARKERS) {
        expect(blob).not.toContain(marker);
      }
    });

    it(`${name} never ships approved, and a refusal carries no artifacts`, () => {
      const result = CompilationResult.parse(load(name));
      expect(result.approvedByHuman).toBe(false);

      if (result.status === "refused") {
        // RED and AMBER refuse. A refusal at YELLOW would render as a draft.
        expect(["RED", "AMBER"]).toContain(result.gateReport.verdict);
        expect(result.graph).toBeUndefined();
        expect(result.items).toHaveLength(0);
        expect(result.refusal?.collectionPlan.length).toBeGreaterThan(0);
      } else {
        expect(result.graph).toBeDefined();
        expect(result.items.length).toBeGreaterThan(0);
      }
    });
  }

  it("every source in every fixture was actually fetched and hashed", () => {
    for (const name of RESULT_FIXTURES) {
      const result = CompilationResult.parse(load(name));
      for (const source of result.sourceManifest.sources) {
        expect(source.fetched).toBe(true);
        expect(source.contentSha256).toMatch(/^[a-f0-9]{64}$/);
        expect(source.contentSha256).not.toBe("0".repeat(64));
      }
    }
  });

  it("case A refuses Texas in en-US without inheriting the Australian locale", () => {
    const result = CompilationResult.parse(load("case-a"));
    expect(result.status).toBe("refused");
    expect(result.request.jurisdictionId).toBe("us-tx");
    expect(result.request.stage.localLabel).toBe("Grade 5");
    expect(result.request.locale.bcp47).toBe("en-US");
    expect(result.refusal?.missingEvidence.join(" ")).toContain("Texas Education Agency");
  });

  it("case C refuses NCERT in Hindi, in Devanagari, at mid resource tier", () => {
    const result = CompilationResult.parse(load("case-c"));
    expect(result.status).toBe("refused");
    expect(result.request.jurisdictionId).toBe("in");
    expect(result.request.stage.localLabel).toBe("Middle Stage, Class 7");
    expect(result.request.locale.script).toBe("Deva");
    // A mid-tier language can never inherit the English run's verdict.
    expect(result.request.locale.resourceTier).toBe("mid");
  });

  it("the Year 8 transfer compiles against Year 8 codes and no Year 7 codes", () => {
    const result = CompilationResult.parse(load("case-au-y8"));
    expect(result.status).not.toBe("refused");
    expect(result.request.stage.localLabel).toBe("Year 8");

    for (const standard of result.graph!.standards) {
      expect(standard.sourceCode).toMatch(/^AC9M8/);
    }
    // Nothing anywhere in the bundle may quote a Year 7 code.
    expect(JSON.stringify(result)).not.toContain("AC9M7");

    const coverage = result.gateReport.checks.find(
      (check) => check.checkId === "check:coverage.standards",
    );
    expect(coverage?.status).toBe("pass");
  });

  it("case B is absent, because there is no fetched source to compile", () => {
    const present = readdirSync(FIXTURE_DIR);
    expect(present).not.toContain("case-b.json");
  });
});

describe("a compile never describes its standards as samples", () => {
  it("names the authority and the count in the gate summary", async () => {
    const request = CompilationRequest.parse(demoRequestJson);
    const result = await createCompiler({ modelClient: new MockModelClient() }).compile(request);

    expect(result.gateReport.summary).not.toContain("sample standards");
    expect(result.gateReport.summary).toContain("Australian Curriculum");
    expect(result.gateReport.summary).toContain("content-hashed snapshot");
    // The claim discipline stays regardless of how good the provenance is.
    expect(result.gateReport.summary).toContain(
      "Nothing here has earned a claim about learning, difficulty or fairness",
    );
  });

  it("stops listing fetched content descriptions as missing evidence", async () => {
    const request = CompilationRequest.parse(demoRequestJson);
    const result = await createCompiler({ modelClient: new MockModelClient() }).compile(request);

    const missing = result.gateReport.missingEvidence.join(" ");
    expect(missing).not.toContain("Fetched and content-hashed curriculum content descriptions");
    // What is genuinely missing is still named.
    expect(missing).toContain("Expert review");
    expect(missing).toContain("Pilot response data");
  });
});
