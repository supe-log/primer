import { CompilationRequest, CompilationResult, type CompilationRequest as Request } from "@contracts";
import { createCompiler } from "../server/compiler";
import { buildPublicExport } from "../server/compiler/export/publicBundle";
import demoRequestJson from "../fixtures/demo-request.json";
import { catalogueFromSnapshot } from "../server/compiler/sources/catalogue";

/**
 * Live compile matrix.
 *
 * Runs the six demo cases against whatever model client the environment provides
 * and prints what a judge would be able to check: status, verdict, the gate's own
 * summary, which sources the export actually cites, which standard codes came out,
 * how many items shipped versus were rejected, and whether any placeholder wording
 * survived anywhere in the result.
 *
 * This is a report, not a test. It asserts nothing and exits 0 even when a case
 * fails its rule, because the point is to see what the compiler really does. The
 * rules it checks are printed alongside so a failure is legible rather than silent.
 */

const demoRequest = CompilationRequest.parse(demoRequestJson);

function requestFor(patch: Partial<Request>): Request {
  return CompilationRequest.parse({ ...demoRequest, ...patch });
}

/** Wording that would mean a hand-authored standard reached a bundle. */
const PLACEHOLDERS = [
  "sample standards",
  "SAMPLE-Y7",
  "Sample placeholder",
  "sample source",
  "UNOFFICIAL-",
];

interface Case {
  name: string;
  request: Request;
  /** Returns a list of rule violations. Empty means the case passed. */
  rules: (result: CompilationResult, context: { citedSourceIds: string[]; blob: string }) => string[];
}

function mustRefuse(result: CompilationResult): string[] {
  const problems: string[] = [];
  if (result.status !== "refused") problems.push(`expected refused, got ${result.status}`);
  if (result.graph) problems.push("a refusal must carry no graph");
  if (result.items.length > 0) problems.push("a refusal must carry no items");
  if ((result.refusal?.collectionPlan.length ?? 0) === 0) {
    problems.push("a refusal must ship a collection plan");
  }
  return problems;
}

const year8 = catalogueFromSnapshot("src:acara.v9.mathematics.year-8");
const year8Standards = (year8?.standards ?? [])
  .filter((standard) => /^AC9M8(N|A)/.test(standard.sourceCode))
  .slice(0, 3);

const CASES: Case[] = [
  {
    name: "AU Year 7, unit_test (prefilled form)",
    request: demoRequest,
    rules: (result, { blob }) => {
      const problems: string[] = [];
      if (result.status !== "draft") problems.push(`expected draft, got ${result.status}`);
      const codes = result.graph?.standards.map((s) => s.sourceCode) ?? [];
      if (codes.some((code) => !code.startsWith("AC9M7"))) {
        problems.push(`non-AC9M7 standard present: ${codes.join(", ")}`);
      }
      const summary = result.gateReport.summary;
      if (!summary.includes("Australian Curriculum")) {
        problems.push("summary does not name the Australian Curriculum");
      }
      if (!summary.includes("content-hashed snapshot")) {
        problems.push("summary does not say content-hashed snapshot");
      }
      if (blob.includes("sample standards")) problems.push('"sample standards" present');
      return problems;
    },
  },
  {
    name: "AU Year 8 (AC9M8 only)",
    request: requestFor({
      requestId: "req:backtest.au.y8",
      stage: { localLabel: "Year 8", ageBand: [13, 14], ordinal: 9 },
      standardIds: year8Standards.map((standard) => standard.standardId),
      goal: "Prepare a Year 8 unit on integers, exponents and equivalent representations.",
    }),
    rules: (result, { citedSourceIds, blob }) => {
      const problems: string[] = [];
      if (result.status === "refused") problems.push("expected a compile, got a refusal");
      const codes = result.graph?.standards.map((s) => s.sourceCode) ?? [];
      if (codes.length === 0) problems.push("no standards emitted");
      if (codes.some((code) => !code.startsWith("AC9M8"))) {
        problems.push(`non-AC9M8 standard present: ${codes.join(", ")}`);
      }
      if (blob.includes("AC9M7")) problems.push('"AC9M7" appears somewhere in the result');
      if (!citedSourceIds.includes("src:acara.v9.mathematics.year-8")) {
        problems.push("export does not cite the Year 8 snapshot");
      }
      if (citedSourceIds.includes("src:acara.v9.mathematics.year-7")) {
        problems.push("export cites the unused Year 7 snapshot");
      }
      return problems;
    },
  },
  {
    name: "AU Year 6 (stage resolves, no snapshot)",
    request: requestFor({
      requestId: "req:backtest.au.y6",
      stage: { localLabel: "Year 6", ageBand: [11, 12], ordinal: 7 },
    }),
    rules: mustRefuse,
  },
  {
    name: "AU Year 7, official_exam_emulation",
    request: requestFor({
      requestId: "req:backtest.au.y7.exam",
      assessmentTarget: "official_exam_emulation",
    }),
    rules: mustRefuse,
  },
  {
    name: "Texas Grade 5 RLA (case-a request)",
    request: requestFor({
      requestId: "req:transfer.ustx.g5.rla",
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
      goal: "Build a Grade 5 writing unit aligned to the state assessment.",
    }),
    rules: (result, { citedSourceIds }) => {
      const problems = mustRefuse(result);
      // The Texas card must not read as Australian on a projector. Any acara source
      // counts, not just the curriculum ones: the licence page is titled
      // "Australian Curriculum: copyright and terms of use" and reads exactly as
      // Australian in a citations panel.
      const australianCitations = citedSourceIds.filter((id) => id.startsWith("src:acara"));
      if (australianCitations.length > 0) {
        problems.push(`export cites Australian sources: ${australianCitations.join(", ")}`);
      }
      if (result.request.locale.bcp47 !== "en-US") {
        problems.push(`locale is ${result.request.locale.bcp47}, expected en-US`);
      }
      const named = result.refusal?.missingEvidence.join(" ") ?? "";
      if (!named.includes("Texas Education Agency")) {
        problems.push("refusal does not name the Texas Education Agency");
      }
      return problems;
    },
  },
  {
    name: "NCERT Class 7, Hindi/Devanagari (case-c request)",
    request: requestFor({
      requestId: "req:transfer.in.c7.math",
      jurisdictionId: "in",
      curriculumSourceId: "ncert.ncf",
      subject: "Mathematics",
      stage: { localLabel: "Middle Stage, Class 7", ageBand: [12, 13], ordinal: 8 },
      standardIds: ["std:ncert.math.c7.requested"],
      locale: {
        bcp47: "hi-IN",
        script: "Deva",
        numeralSystem: "deva",
        direction: "ltr",
        resourceTier: "mid",
      },
      goal: "Prepare a Class 7 unit on ratio and proportion in Hindi.",
    }),
    rules: (result) => {
      const problems = mustRefuse(result);
      const named = result.refusal?.missingEvidence.join(" ") ?? "";
      if (!named.includes("National Council of Educational Research and Training")) {
        problems.push("refusal does not name NCERT");
      }
      return problems;
    },
  },
];

function shortSource(id: string): string {
  return id.replace(/^src:/, "");
}

async function main(): Promise<void> {
  console.log(
    `model client: ${process.env.XAI_API_KEY ? "xai (grok-4.6)" : "mock"}\n`,
  );

  let failures = 0;

  for (const testCase of CASES) {
    const started = Date.now();
    const result = await createCompiler().compile(testCase.request);
    const elapsed = Date.now() - started;

    const parsed = CompilationResult.safeParse(result);
    const blob = JSON.stringify(result);
    const exported = buildPublicExport(result);
    const citedSourceIds = exported.citations.map((citation) => citation.sourceId);

    const codes = result.graph?.standards.map((standard) => standard.sourceCode) ?? [];
    const rejected = result.items.filter((item) => item.rejection).length;
    const found = PLACEHOLDERS.filter((marker) => blob.includes(marker));
    const problems = testCase.rules(result, { citedSourceIds, blob });
    if (problems.length > 0 || !parsed.success) failures += 1;

    console.log(`━━ ${testCase.name}  (${(elapsed / 1000).toFixed(1)}s)`);
    console.log(`   status            ${result.status}`);
    console.log(`   gate verdict      ${result.gateReport.verdict} / ${result.gateReport.permission}`);
    console.log(`   gate summary      ${result.gateReport.summary}`);
    console.log(`   sources cited     ${citedSourceIds.map(shortSource).join(", ") || "none"}`);
    console.log(`   standard codes    ${codes.join(", ") || "none"}`);
    console.log(
      `   items             ${result.items.length - rejected} shipped, ${rejected} rejected`,
    );
    console.log(`   approvedByHuman   ${result.approvedByHuman}`);
    console.log(`   parses            ${parsed.success ? "yes" : "NO"}`);
    console.log(`   placeholders      ${found.length === 0 ? "none" : found.join(", ")}`);
    if (result.refusal) {
      console.log(`   refusal           ${result.refusal.code}`);
      console.log(`   collection plan   ${result.refusal.collectionPlan.length} steps`);
    }
    console.log(`   RULES             ${problems.length === 0 ? "pass" : `FAIL — ${problems.join("; ")}`}`);
    console.log();
  }

  console.log(`${CASES.length - failures}/${CASES.length} cases satisfied their rules.`);
}

main().catch((error) => {
  console.error("backtest failed:", error);
  process.exit(1);
});
