import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CompilationRequest,
  CompilationResult,
  type CompilationRequest as CompilationRequestType,
} from "@contracts";
import { createCompiler } from "../server/compiler";
import { MockModelClient } from "../server/compiler/model/modelClient";
import { catalogueFromSnapshot } from "../server/compiler/sources/catalogue";
import demoRequestJson from "../fixtures/demo-request.json";

/**
 * Writes the frozen transfer-strip fixtures the interface renders without a
 * compiler:
 *
 *   npm run demo-fixtures
 *
 * Every file here is produced by running the real compiler and is written only if
 * it parses against CompilationResult. Nothing is hand-authored, because a
 * hand-authored bundle is the exact artifact this project refuses to ship.
 *
 * Two rules govern which client the case uses:
 *  - Refusals run on MockModelClient. A refusal never reaches a generative stage by
 *    design, so a key would buy nothing and the output stays byte-reproducible.
 *  - A successful compile uses whichever client the environment provides. With
 *    XAI_API_KEY set that is grok-4.6 and the frozen card shows real generated
 *    items; without it the deterministic path produces the same shapes.
 *
 * Case B, US K-2 foundational reading, is deliberately not written. There is no
 * fetched source and no registered adapter for it, so the only honest artifact
 * would be an invented one. The strip leaves that card disabled.
 */

const CLIENT_FIXTURES = path.resolve(import.meta.dirname, "..", "client", "src", "fixtures");

const demoRequest = CompilationRequest.parse(demoRequestJson);

function requestFor(patch: Partial<CompilationRequestType>): CompilationRequestType {
  return CompilationRequest.parse({ ...demoRequest, ...patch });
}

/**
 * Case A. Texas Education Agency, whose TEKS have not been fetched. The stage
 * ladder resolves — Texas counts in grades — and the compile refuses anyway,
 * because a registered jurisdiction is not a supported one.
 */
const CASE_A = requestFor({
  requestId: "req:transfer.ustx.g5.rla",
  jurisdictionId: "us-tx",
  curriculumSourceId: "teks.rla",
  subject: "Reading Language Arts",
  stage: { localLabel: "Grade 5", ageBand: [10, 11], ordinal: 6 },
  standardIds: ["std:teks.rla.g5.requested"],
  // Locale travels with the request, so a Texas case must not inherit en-AU
  // spelling, currency or units from the Australian demo request it was built from.
  locale: {
    bcp47: "en-US",
    script: "Latn",
    numeralSystem: "latn",
    direction: "ltr",
    resourceTier: "high",
  },
  goal: "Build a Grade 5 writing unit aligned to the state assessment.",
  learnerContext: {
    priorKnowledgeNotes:
      "Class can write a paragraph with a clear topic sentence but rarely develops evidence.",
    dailyMinutes: 30,
    accessibilityNeeds: ["read-aloud option"],
  },
  assessmentTarget: "unit_test",
  lessonCount: 3,
});

/**
 * Case C. India, NCERT, requested in Hindi in Devanagari script. A different ladder
 * shape entirely, a non-Latin script, and a mid-resource-tier language — and still
 * a refusal, because nobody has fetched the curriculum. The locale travels through
 * the request contract untouched, which is the portability claim; the refusal is
 * the honesty claim.
 */
const CASE_C = requestFor({
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
    // A mid-tier language can never inherit the English run's verdict, and this run
    // has no native-speaker review recorded.
    resourceTier: "mid",
  },
  goal: "Prepare a Class 7 unit on ratio and proportion in Hindi.",
  learnerContext: {
    priorKnowledgeNotes: "Class is comfortable with fractions but has not met ratio notation.",
    dailyMinutes: 40,
    accessibilityNeeds: [],
  },
  assessmentTarget: "unit_test",
  lessonCount: 3,
});

interface Written {
  file: string;
  status: string;
  detail: string;
}

async function write(
  slug: string,
  request: CompilationRequestType,
  options: { useMock: boolean; alsoWriteEventsAs?: string },
): Promise<Written> {
  const compiler = createCompiler(
    options.useMock ? { modelClient: new MockModelClient() } : {},
  );
  const result = await compiler.compile(request);

  if (options.alsoWriteEventsAs) {
    // Events come from the same run as the result, so the frozen card's pipeline
    // and its artifacts share a runId instead of being two unrelated recordings.
    const events = compiler.observe(result.runId);
    await writeFile(
      path.join(CLIENT_FIXTURES, `${options.alsoWriteEventsAs}.json`),
      `${JSON.stringify(events, null, 2)}\n`,
      "utf8",
    );
  }

  // The whole point of generating rather than authoring: if it does not parse, it
  // does not get written.
  const parsed = CompilationResult.safeParse(result);
  if (!parsed.success) {
    throw new Error(
      `${slug} did not satisfy CompilationResult: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }

  const file = path.join(CLIENT_FIXTURES, `${slug}.json`);
  await writeFile(file, `${JSON.stringify(parsed.data, null, 2)}\n`, "utf8");

  const detail =
    parsed.data.status === "refused"
      ? `${parsed.data.refusal!.code}, ${parsed.data.refusal!.missingEvidence.length} missing, ${parsed.data.refusal!.collectionPlan.length}-step plan`
      : `${parsed.data.graph!.standards.map((standard) => standard.sourceCode).join(", ")} · ${parsed.data.graph!.knowledgeComponents.length} components · ${parsed.data.items.length} items, ${parsed.data.items.filter((item) => item.rejection).length} rejected`;

  return { file: `${slug}.json`, status: parsed.data.status, detail };
}

async function main(): Promise<void> {
  await mkdir(CLIENT_FIXTURES, { recursive: true });
  const written: Written[] = [];

  // Year 8 standards are read out of the Year 8 snapshot, never carried over from
  // Year 7. A transfer fixture that quoted Year 7 codes would prove nothing.
  const year8 = catalogueFromSnapshot("src:acara.v9.mathematics.year-8");
  if (!year8) {
    throw new Error("no Year 8 snapshot; run npm run snapshot first");
  }
  const year8Standards = year8.standards
    .filter((standard) => /^AC9M8(N|A)/.test(standard.sourceCode))
    .slice(0, 3);
  if (year8Standards.length < 2) {
    throw new Error("Year 8 snapshot carries too few number and algebra content descriptions");
  }

  const caseAuY8 = requestFor({
    requestId: "req:transfer.au.y8.math",
    stage: { localLabel: "Year 8", ageBand: [13, 14], ordinal: 9 },
    standardIds: year8Standards.map((standard) => standard.standardId),
    goal: "Prepare a Year 8 unit on integers, exponents and equivalent representations.",
    learnerContext: {
      priorKnowledgeNotes:
        "Class finished Year 7 ratios but is unreliable with negative numbers and exponent notation.",
      dailyMinutes: 25,
      accessibilityNeeds: ["reduced visual clutter"],
    },
    assessmentTarget: "unit_test",
    lessonCount: 3,
  });

  // The frozen Year 7 card and the refusal card. These shipped with the scaffold as
  // hand-written placeholders citing SAMPLE-Y7-N-01, which put invented standards on
  // the same strip as the honest cases. They are compiled now like everything else.
  console.log(
    `frozen D, Australia Year 7 maths, compile (${process.env.XAI_API_KEY ? "grok-4.6" : "mock"})…`,
  );
  written.push(
    await write("compilation-result", demoRequest, {
      useMock: false,
      alsoWriteEventsAs: "agent-events",
    }),
  );

  console.log("refusal card, Australia Year 7 official exam emulation, no blueprint (mock)…");
  written.push(
    await write(
      "refusal-result",
      requestFor({
        requestId: "req:demo.au.y7.exam",
        assessmentTarget: "official_exam_emulation",
        goal: "Practice items that emulate the official Year 7 numeracy assessment.",
      }),
      { useMock: true },
    ),
  );

  // The client's copy of the intake request, so the prefilled form matches the
  // standards the compiler actually resolves.
  await writeFile(
    path.join(CLIENT_FIXTURES, "demo-request.json"),
    `${JSON.stringify(demoRequest, null, 2)}\n`,
    "utf8",
  );

  console.log("case A, Texas Grade 5 Reading Language Arts, refusal (mock)…");
  written.push(await write("case-a", CASE_A, { useMock: true }));

  console.log("case C, NCERT Middle Stage Class 7, Hindi in Devanagari, refusal (mock)…");
  written.push(await write("case-c", CASE_C, { useMock: true }));

  console.log(
    `case AU Year 8, ${year8Standards.map((s) => s.sourceCode).join(" ")}, compile (${process.env.XAI_API_KEY ? "grok-4.6" : "mock"})…`,
  );
  written.push(await write("case-au-y8", caseAuY8, { useMock: false }));

  console.log("\nwrote:");
  for (const entry of written) {
    console.log(`  ${entry.file.padEnd(16)} ${entry.status.padEnd(9)} ${entry.detail}`);
  }
  console.log("\ncase B, US K-2 reading, is not written: no fetched source, no adapter, nothing honest to show.");
}

main().catch((error) => {
  console.error("demo fixtures failed:", error);
  process.exit(1);
});
