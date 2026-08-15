import type {
  CompilationRequest,
  CurriculumGraph,
  KnowledgeComponent,
  Misconception,
  SourceManifest,
  StandardNode,
} from "@contracts";
import type { JurisdictionAdapter } from "../adapters/jurisdiction";

/**
 * Deterministic curriculum map used when the model client abstains.
 *
 * This is the stage fallback, not a claim that the mapping is expert-reviewed.
 * For the live ACARA Year 7 ratios case it emits the known component set. For any
 * other registered request it emits one knowledge component per standard so the
 * rest of the pipeline can still run and the gate can still refuse honestly.
 */

const DEMO_STANDARD_IDS = [
  "std:acara.v9.y7.math.sample-01",
  "std:acara.v9.y7.math.sample-02",
  "std:acara.v9.y7.math.sample-03",
] as const;

function confidence(basis: string[]): KnowledgeComponent["confidence"] {
  return {
    value: 0.55,
    basis,
    unmeasured: ["exact_span_match", "expert_review", "pilot_data"],
  };
}

function evidenceFor(sourceId: string, quotedSpan: string, locator: string) {
  return [{ sourceId, quotedSpan, locator, retrievalLanguage: "en" }];
}

export function isDemoRatiosRequest(request: CompilationRequest): boolean {
  const requested = new Set(request.standardIds);
  return (
    request.jurisdictionId === "au" &&
    request.curriculumSourceId === "acara.v9" &&
    DEMO_STANDARD_IDS.every((id) => requested.has(id))
  );
}

function primarySourceId(manifest: SourceManifest): string {
  return (
    manifest.sources.find((source) => source.licence.posture === "redistributable")?.sourceId ??
    manifest.sources[0]!.sourceId
  );
}

function demoGraph(
  request: CompilationRequest,
  adapter: JurisdictionAdapter,
  manifest: SourceManifest,
): CurriculumGraph {
  const sourceId = primarySourceId(manifest);
  const year7 = adapter.resolveStage(request.stage.localLabel) ?? request.stage;
  const year6 = adapter.resolveStage("Year 6") ?? {
    localLabel: "Year 6",
    ageBand: [11, 12] as [number, number],
    ordinal: 7,
  };

  const standards: StandardNode[] = [
    {
      standardId: "std:acara.v9.y7.math.sample-01",
      sourceCode: "SAMPLE-Y7-N-01",
      statement:
        "Recognise and use equivalent ratios, including writing a ratio from a described situation.",
      evidence: evidenceFor(sourceId, "content descriptions", "sample-01"),
    },
    {
      standardId: "std:acara.v9.y7.math.sample-02",
      sourceCode: "SAMPLE-Y7-N-02",
      statement: "Solve problems involving rates, including finding a unit rate.",
      evidence: evidenceFor(sourceId, "content descriptions", "sample-02"),
    },
    {
      standardId: "std:acara.v9.y7.math.sample-03",
      sourceCode: "SAMPLE-Y7-N-03",
      statement: "Apply proportional reasoning to compare quantities in context.",
      evidence: evidenceFor(sourceId, "achievement standards", "sample-03"),
    },
  ];

  const misconceptions: Misconception[] = [
    {
      misconceptionId: "mc:adds-across-fraction-bar",
      label: "Adds numerators and denominators",
      description:
        "Treats a fraction as two independent whole numbers, so 1/2 and 1/3 combine to 2/5.",
      knowledgeComponentIds: ["kc:au.y7.math.equivalent-fractions"],
    },
    {
      misconceptionId: "mc:treats-ratio-as-fraction-of-whole",
      label: "Reads a part-to-part ratio as a part-to-whole fraction",
      description: "Reads 2 : 3 as two thirds rather than two parts out of five.",
      knowledgeComponentIds: ["kc:au.y7.math.ratio-notation"],
    },
    {
      misconceptionId: "mc:adds-constant-to-both-parts",
      label: "Adds the same number to both parts of a ratio",
      description:
        "Produces 3 : 4 from 2 : 3 by adding one to each part instead of scaling multiplicatively.",
      knowledgeComponentIds: ["kc:au.y7.math.equivalent-ratios"],
    },
    {
      misconceptionId: "mc:divides-in-wrong-order",
      label: "Divides in the wrong order",
      description: "Computes quantity divided by cost when the question asks for cost per unit.",
      knowledgeComponentIds: ["kc:au.y7.math.unit-rate", "kc:au.y7.math.rate-problems"],
    },
  ];

  const knowledgeComponents: KnowledgeComponent[] = [
    {
      knowledgeComponentId: "kc:au.y7.math.equivalent-fractions",
      label: "Generate equivalent fractions",
      description:
        "Multiply or divide numerator and denominator by the same non-zero number and explain why the value is unchanged.",
      standardIds: [],
      stage: year6,
      prerequisiteOnly: true,
      atomicEntry: true,
      misconceptionIds: ["mc:adds-across-fraction-bar"],
      evidence: [],
      confidence: confidence(["pulled in from learner context"]),
    },
    {
      knowledgeComponentId: "kc:au.y7.math.ratio-notation",
      label: "Read and write ratio notation",
      description:
        "Interpret a : b as a comparison of two quantities and write a ratio from a described situation.",
      standardIds: ["std:acara.v9.y7.math.sample-01"],
      stage: year7,
      prerequisiteOnly: false,
      atomicEntry: false,
      misconceptionIds: ["mc:treats-ratio-as-fraction-of-whole"],
      evidence: evidenceFor(sourceId, "content descriptions", "ratio-notation"),
      confidence: confidence(["deterministic fallback map"]),
    },
    {
      knowledgeComponentId: "kc:au.y7.math.equivalent-ratios",
      label: "Recognise equivalent ratios",
      description: "Decide whether two ratios are equivalent by scaling both parts by the same factor.",
      standardIds: ["std:acara.v9.y7.math.sample-01"],
      stage: year7,
      prerequisiteOnly: false,
      atomicEntry: false,
      misconceptionIds: ["mc:adds-constant-to-both-parts"],
      evidence: evidenceFor(sourceId, "content descriptions", "equivalent-ratios"),
      confidence: confidence(["deterministic fallback map"]),
    },
    {
      knowledgeComponentId: "kc:au.y7.math.unit-rate",
      label: "Find a unit rate",
      description: "Divide to express a rate per one unit and state the units of the result.",
      standardIds: ["std:acara.v9.y7.math.sample-02"],
      stage: year7,
      prerequisiteOnly: false,
      atomicEntry: false,
      misconceptionIds: ["mc:divides-in-wrong-order"],
      evidence: evidenceFor(sourceId, "content descriptions", "unit-rate"),
      confidence: confidence(["deterministic fallback map"]),
    },
    {
      knowledgeComponentId: "kc:au.y7.math.rate-problems",
      label: "Solve rate problems in context",
      description:
        "Use a unit rate to answer a question about a different quantity, keeping units consistent.",
      standardIds: ["std:acara.v9.y7.math.sample-02", "std:acara.v9.y7.math.sample-03"],
      stage: year7,
      prerequisiteOnly: false,
      atomicEntry: false,
      misconceptionIds: ["mc:divides-in-wrong-order"],
      evidence: evidenceFor(sourceId, "achievement standards", "rate-problems"),
      confidence: confidence(["deterministic fallback map"]),
    },
  ];

  return {
    schemaVersion: "0.1.0",
    jurisdictionId: request.jurisdictionId,
    curriculumSourceId: request.curriculumSourceId,
    standards,
    knowledgeComponents,
    prerequisiteEdges: [
      {
        from: "kc:au.y7.math.equivalent-fractions",
        to: "kc:au.y7.math.equivalent-ratios",
        justification:
          "Scaling both parts of a ratio is the same multiplicative move as generating an equivalent fraction.",
        evidence: [],
      },
      {
        from: "kc:au.y7.math.ratio-notation",
        to: "kc:au.y7.math.equivalent-ratios",
        justification: "A learner cannot compare two ratios before reading ratio notation reliably.",
        evidence: [],
      },
      {
        from: "kc:au.y7.math.ratio-notation",
        to: "kc:au.y7.math.unit-rate",
        justification: "A unit rate is a ratio with the second part scaled to one.",
        evidence: [],
      },
      {
        from: "kc:au.y7.math.unit-rate",
        to: "kc:au.y7.math.rate-problems",
        justification: "Contextual rate problems are solved by first producing a unit rate.",
        evidence: [],
      },
      {
        from: "kc:au.y7.math.equivalent-ratios",
        to: "kc:au.y7.math.rate-problems",
        justification:
          "Checking a scaled answer against an equivalent ratio is the verification step inside a rate problem.",
        evidence: [],
      },
    ],
    misconceptions,
  };
}

function genericGraph(
  request: CompilationRequest,
  adapter: JurisdictionAdapter,
  manifest: SourceManifest,
): CurriculumGraph {
  const sourceId = primarySourceId(manifest);
  const stage = adapter.resolveStage(request.stage.localLabel) ?? request.stage;
  const standards: StandardNode[] = request.standardIds.map((standardId, index) => ({
    standardId,
    sourceCode: `UNOFFICIAL-${index + 1}`,
    statement: `Deterministic fallback statement for ${standardId}. Replace when the mapper runs.`,
    evidence: evidenceFor(sourceId, "fallback map", standardId),
  }));

  const knowledgeComponents: KnowledgeComponent[] = request.standardIds.map((standardId, index) => {
    const slug = standardId.replace(/^std:/, "");
    return {
      knowledgeComponentId: `kc:${slug}`,
      label: `Component for ${standardId}`,
      description: `Do the work named by ${standardId}.`,
      standardIds: [standardId],
      stage,
      prerequisiteOnly: false,
      atomicEntry: index === 0,
      misconceptionIds: [`mc:${slug}.default`],
      evidence: evidenceFor(sourceId, "fallback map", standardId),
      confidence: confidence(["deterministic fallback map", "no model mapping"]),
    };
  });

  const misconceptions: Misconception[] = knowledgeComponents.map((kc) => ({
    misconceptionId: kc.misconceptionIds[0]!,
    label: `Default error for ${kc.label}`,
    description: `Applies the wrong representation for ${kc.label}.`,
    knowledgeComponentIds: [kc.knowledgeComponentId],
  }));

  const prerequisiteEdges = knowledgeComponents.slice(1).map((kc, index) => ({
    from: knowledgeComponents[index]!.knowledgeComponentId,
    to: kc.knowledgeComponentId,
    justification: "Fallback linear order so the graph is sequenceable until a real mapping exists.",
    evidence: [],
  }));

  return {
    schemaVersion: "0.1.0",
    jurisdictionId: request.jurisdictionId,
    curriculumSourceId: request.curriculumSourceId,
    standards,
    knowledgeComponents,
    prerequisiteEdges,
    misconceptions,
  };
}

export function mapCurriculumFallback(input: {
  request: CompilationRequest;
  adapter: JurisdictionAdapter;
  sourceManifest: SourceManifest;
}): CurriculumGraph {
  if (isDemoRatiosRequest(input.request)) {
    return demoGraph(input.request, input.adapter, input.sourceManifest);
  }
  return genericGraph(input.request, input.adapter, input.sourceManifest);
}
