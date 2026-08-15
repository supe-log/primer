import type {
  CompilationRequest,
  CurriculumGraph,
  KnowledgeComponent,
  Misconception,
  SourceManifest,
  StandardNode,
} from "@contracts";
import { catalogueSourceIdFor, type JurisdictionAdapter } from "../adapters/jurisdiction";
import { catalogueFromSnapshot } from "../sources/catalogue";

/**
 * Deterministic curriculum map used when the model client abstains.
 *
 * This is the stage fallback, not a claim that the mapping is expert-reviewed.
 * For the live ACARA Year 7 ratios case it emits the known component set. For any
 * other registered request it emits one knowledge component per standard so the
 * rest of the pipeline can still run and the gate can still refuse honestly.
 *
 * What is deterministic here is the *pedagogy*: which knowledge components exist,
 * which prerequisite edges hold and why. The *standards* are never authored here.
 * They are read out of the hashed snapshot by the catalogue, so every statement is
 * the authority's own wording and every quoted span matches bytes on disk. When this
 * file and a snapshot disagree, the snapshot is right.
 */

/** The three fetched ACARA content descriptions the live demo compiles. */
const DEMO_STANDARD_IDS = [
  /** find equivalent representations of rational numbers … */
  "std:acara.v9.ac9m7n04",
  /** recognise, represent and solve problems involving ratios */
  "std:acara.v9.ac9m7n08",
  /** use mathematical modelling to solve practical problems involving ratios … */
  "std:acara.v9.ac9m7m06",
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

/**
 * Standards for the requested ids, straight from the adapter's snapshot. Returns an
 * empty list when the adapter has no fetched curriculum or the ids do not resolve,
 * which callers treat as "there is nothing to compile here" rather than as a licence
 * to author a standard.
 */
function catalogueStandards(
  adapter: JurisdictionAdapter,
  standardIds: readonly string[],
  stageLabel: string,
): StandardNode[] {
  const sourceId = catalogueSourceIdFor(adapter, stageLabel);
  if (!sourceId) return [];
  const catalogue = catalogueFromSnapshot(sourceId);
  if (!catalogue) return [];
  return catalogue.resolve(standardIds);
}

/**
 * Evidence anchored in the snapshot: the quoted span is the content description's
 * own wording, so the span-match validator has something real to check. Falls back
 * to the component's own description only when the code does not resolve, and says
 * so in the locator rather than pretending the span came from the source.
 */
function evidenceForStandard(
  standards: readonly StandardNode[],
  sourceCode: string,
  sourceId: string,
) {
  const standard = standards.find((entry) => entry.sourceCode === sourceCode);
  if (!standard) return evidenceFor(sourceId, "fallback map", `${sourceCode} unresolved`);
  return evidenceFor(sourceId, standard.statement, standard.sourceCode);
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

  // Standards are read, never written. The catalogue returns the authority's own
  // codes and wording out of the hashed snapshot; if it cannot, the request had no
  // fetched curriculum behind it and the caller must refuse rather than improvise.
  const standards: StandardNode[] = catalogueStandards(adapter, [...DEMO_STANDARD_IDS], request.stage.localLabel);

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
      standardIds: ["std:acara.v9.ac9m7n08"],
      stage: year7,
      prerequisiteOnly: false,
      atomicEntry: false,
      misconceptionIds: ["mc:treats-ratio-as-fraction-of-whole"],
      evidence: evidenceForStandard(standards, "AC9M7N08", sourceId),
      confidence: confidence(["deterministic fallback map", "span matched to AC9M7N08"]),
    },
    {
      knowledgeComponentId: "kc:au.y7.math.equivalent-ratios",
      label: "Recognise equivalent ratios",
      description: "Decide whether two ratios are equivalent by scaling both parts by the same factor.",
      // Two content descriptions genuinely meet here: equivalent ratios are the
      // ratio case of equivalent representations of rational numbers.
      standardIds: ["std:acara.v9.ac9m7n04", "std:acara.v9.ac9m7n08"],
      stage: year7,
      prerequisiteOnly: false,
      atomicEntry: false,
      misconceptionIds: ["mc:adds-constant-to-both-parts"],
      evidence: evidenceForStandard(standards, "AC9M7N04", sourceId),
      confidence: confidence(["deterministic fallback map", "span matched to AC9M7N04"]),
    },
    {
      knowledgeComponentId: "kc:au.y7.math.unit-rate",
      label: "Find a unit rate",
      description: "Divide to express a rate per one unit and state the units of the result.",
      standardIds: ["std:acara.v9.ac9m7m06"],
      stage: year7,
      prerequisiteOnly: false,
      atomicEntry: false,
      misconceptionIds: ["mc:divides-in-wrong-order"],
      evidence: evidenceForStandard(standards, "AC9M7M06", sourceId),
      confidence: confidence(["deterministic fallback map", "span matched to AC9M7M06"]),
    },
    {
      knowledgeComponentId: "kc:au.y7.math.rate-problems",
      label: "Solve rate problems in context",
      description:
        "Use a unit rate to answer a question about a different quantity, keeping units consistent.",
      standardIds: ["std:acara.v9.ac9m7m06"],
      stage: year7,
      prerequisiteOnly: false,
      atomicEntry: false,
      misconceptionIds: ["mc:divides-in-wrong-order"],
      evidence: evidenceForStandard(standards, "AC9M7M06", sourceId),
      confidence: confidence(["deterministic fallback map", "span matched to AC9M7M06"]),
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

  // Prefer the fetched curriculum for any id the snapshot knows. Only ids with no
  // snapshot behind them fall back to an explicitly unofficial placeholder, and the
  // placeholder says so in its source code so nobody mistakes it for a standard.
  const resolved = catalogueStandards(adapter, request.standardIds, request.stage.localLabel);
  const byId = new Map(resolved.map((standard) => [standard.standardId, standard]));
  const standards: StandardNode[] = request.standardIds.map((standardId, index) => {
    const known = byId.get(standardId);
    if (known) return known;
    return {
      standardId,
      sourceCode: `UNOFFICIAL-${index + 1}`,
      statement: `Deterministic fallback statement for ${standardId}. Replace when the mapper runs.`,
      evidence: evidenceFor(sourceId, "fallback map", standardId),
    };
  });

  const knowledgeComponents: KnowledgeComponent[] = request.standardIds.map((standardId, index) => {
    const slug = standardId.replace(/^std:/, "");
    const known = byId.get(standardId);
    return {
      knowledgeComponentId: `kc:${slug}`,
      label: known ? known.sourceCode : `Component for ${standardId}`,
      description: known ? known.statement : `Do the work named by ${standardId}.`,
      standardIds: [standardId],
      stage,
      prerequisiteOnly: false,
      atomicEntry: index === 0,
      misconceptionIds: [`mc:${slug}.default`],
      evidence: known
        ? evidenceFor(sourceId, known.statement, known.sourceCode)
        : evidenceFor(sourceId, "fallback map", standardId),
      confidence: confidence(
        known
          ? ["deterministic fallback map", `span matched to ${known.sourceCode}`]
          : ["deterministic fallback map", "no model mapping", "no snapshot for this standard"],
      ),
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
