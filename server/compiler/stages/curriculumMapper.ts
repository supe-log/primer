import {
  CurriculumGraph,
  type CompilationRequest,
  type CurriculumGraph as CurriculumGraphType,
  type KnowledgeComponent,
  type Misconception,
  type ModelCallRecord,
  type PrerequisiteEdge,
  type SourceManifest,
  type StandardNode,
} from "@contracts";
import type { JurisdictionAdapter } from "../adapters/jurisdiction";
import type { ModelClient } from "../model/modelClient";
import type { StructuredModelRequest, StructuredSchema } from "../model/xaiModelClient";
import type { CurriculumCatalogue } from "../sources/catalogue";
import { spanMatches } from "../sources/snapshotStore";
import { findSnapshot } from "../sources/snapshotStore";

/**
 * The curriculum mapper: the first real agent stage.
 *
 * The division of labour is the whole design. The model proposes *pedagogy* — which
 * knowledge components exist at what grain, which prerequisite edges hold and why,
 * which misconceptions attach where. Code owns *provenance* — the standards, their
 * official codes, their verbatim wording, the evidence spans, the ids and the
 * confidence arithmetic. The model is never asked what the curriculum says, because
 * it does not know; it is asked how the curriculum decomposes, which is a judgement.
 *
 * Consequences, enforced below rather than requested in the prompt:
 *  - A component may only cite standard codes that were in the snapshot. Codes the
 *    model invents are dropped and counted, never rendered as a standard.
 *  - Ids are assigned by code from slugs, so the model cannot mint an id that
 *    collides with another artifact's namespace.
 *  - Evidence is attached by code from the catalogue, so a span always matches bytes.
 *  - Confidence is computed from span matches and mapping coverage. It is never a
 *    model self-rating.
 *  - The result is parsed against CurriculumGraph. A graph that does not parse is an
 *    abstention, and the deterministic map runs instead.
 */

export const MAPPER_PROMPT_VERSION = "curriculum-mapper/2026-08-15.1";

/** Slug the model returns, normalized to the id grammar the contracts require. */
function slugify(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "unnamed";
}

interface ProposedComponent {
  slug: string;
  label: string;
  description: string;
  standardCodes: string[];
  belowStage: boolean;
  atomicEntry: boolean;
  misconceptionSlugs: string[];
}

interface ProposedEdge {
  fromSlug: string;
  toSlug: string;
  justification: string;
}

interface ProposedMisconception {
  slug: string;
  label: string;
  description: string;
  knowledgeComponentSlugs: string[];
}

interface MapperProposal {
  knowledgeComponents: ProposedComponent[];
  prerequisiteEdges: ProposedEdge[];
  misconceptions: ProposedMisconception[];
}

const MAPPER_SCHEMA: StructuredSchema = {
  name: "curriculum_map",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["knowledgeComponents", "prerequisiteEdges", "misconceptions"],
    properties: {
      knowledgeComponents: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "slug",
            "label",
            "description",
            "standardCodes",
            "belowStage",
            "atomicEntry",
            "misconceptionSlugs",
          ],
          properties: {
            slug: { type: "string", description: "lowercase-hyphenated, unique" },
            label: { type: "string", description: "short teacher-facing name" },
            description: {
              type: "string",
              description: "what a learner can do when this component is held",
            },
            standardCodes: {
              type: "array",
              items: { type: "string" },
              description: "official codes from the supplied list only, empty if below stage",
            },
            belowStage: {
              type: "boolean",
              description: "true when the component sits below the requested stage",
            },
            atomicEntry: {
              type: "boolean",
              description: "true when the component has no prerequisites by design",
            },
            misconceptionSlugs: { type: "array", items: { type: "string" } },
          },
        },
      },
      prerequisiteEdges: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fromSlug", "toSlug", "justification"],
          properties: {
            fromSlug: { type: "string" },
            toSlug: { type: "string" },
            justification: {
              type: "string",
              description: "why the ordering holds, in one sentence a teacher would accept",
            },
          },
        },
      },
      misconceptions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["slug", "label", "description", "knowledgeComponentSlugs"],
          properties: {
            slug: { type: "string" },
            label: { type: "string" },
            description: {
              type: "string",
              description: "the error pattern, stated as what the learner actually does",
            },
            knowledgeComponentSlugs: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
};

function buildPrompt(input: {
  request: CompilationRequest;
  adapter: JurisdictionAdapter;
  standards: readonly StandardNode[];
  catalogue: CurriculumCatalogue;
}): string {
  const { request, adapter, standards, catalogue } = input;
  const standardBlock = standards
    .map((standard) => {
      const elaborations = catalogue
        .elaborations(standard.sourceCode)
        .slice(0, 4)
        .map((text) => `      - ${text}`)
        .join("\n");
      return [
        `  ${standard.sourceCode}: ${standard.statement}`,
        elaborations ? `    elaborations:\n${elaborations}` : "    elaborations: none published",
      ].join("\n");
    })
    .join("\n");

  const achievement = catalogue.achievementStandard
    .slice(0, 8)
    .map((text) => `  - ${text}`)
    .join("\n");

  return [
    `You are decomposing an official curriculum into a prerequisite graph.`,
    ``,
    `Jurisdiction: ${adapter.authorityName} (${adapter.jurisdictionId}), ${adapter.curriculumSourceId}.`,
    `Stage: ${request.stage.localLabel}, nominal ages ${request.stage.ageBand[0]} to ${request.stage.ageBand[1]}.`,
    `Subject: ${request.subject}. Locale: ${request.locale.bcp47}, ${request.locale.script} script.`,
    `Teacher's goal: ${request.goal}`,
    `Learner context: ${request.learnerContext.priorKnowledgeNotes || "none supplied"}`,
    `Time available: ${request.learnerContext.dailyMinutes} minutes per day, ${request.lessonCount} lessons.`,
    ``,
    `The content descriptions to decompose, verbatim from the authority:`,
    standardBlock,
    ``,
    `Achievement standard for this stage, for backward design:`,
    achievement || "  - not published in this snapshot",
    ``,
    `Produce knowledge components: the grain at which learning is actually theorized,`,
    `finer than a content description and coarser than a single exercise. Each one is`,
    `something a learner either holds or does not hold.`,
    ``,
    `Rules you must follow:`,
    `1. Cite standardCodes only from the list above. Do not invent a code. A component`,
    `   that is a below-stage prerequisite carries no code and sets belowStage true.`,
    `2. Pull in the below-stage prerequisites the learner context implies. The teacher`,
    `   said what the class is shaky on; that is evidence about where to start.`,
    `3. Every prerequisite edge needs a justification that names the dependency, not a`,
    `   restatement of the order. "B needs A" is not a justification.`,
    `4. The edges must form a directed acyclic graph. A cycle is rejected by a`,
    `   deterministic auditor, not negotiated.`,
    `5. Every component that is not an entry point must appear in at least one edge.`,
    `   Set atomicEntry true only for genuine starting points.`,
    `6. Misconceptions are specific error patterns with a named wrong move, not`,
    `   "struggles with ratios". Each attaches to the components where it shows up.`,
    `7. Between 5 and 9 components. Prefer fewer, well-separated components.`,
    ``,
    `Do not restate the curriculum. Do not write lessons or questions. Decompose.`,
  ].join("\n");
}

export interface MapperOutcome {
  graph?: CurriculumGraphType;
  abstained: boolean;
  /** One sentence, written for the pipeline panel. */
  reason: string;
  call: ModelCallRecord;
  counts: Record<string, number>;
}

function abstain(reason: string, modelName: string, model: string): MapperOutcome {
  return {
    abstained: true,
    reason,
    counts: {},
    call: {
      agentId: "agent:curriculum-mapper",
      model,
      promptVersion: MAPPER_PROMPT_VERSION,
      abstained: true,
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
    },
  };
}

/**
 * Runs the mapper. Returns an abstention rather than throwing for every failure
 * mode, so the caller can fall through to the deterministic map and the gate can
 * record an honest abstention.
 */
export async function mapCurriculumWithModel(input: {
  request: CompilationRequest;
  adapter: JurisdictionAdapter;
  sourceManifest: SourceManifest;
  catalogue: CurriculumCatalogue;
  modelClient: ModelClient;
}): Promise<MapperOutcome> {
  const { request, adapter, catalogue, modelClient } = input;
  const modelName = modelClient.name === "xai" ? "grok-4.6" : "mock-deterministic";

  const standards = catalogue.resolve(request.standardIds);
  if (standards.length === 0) {
    return abstain(
      "No requested standard resolves in the fetched snapshot, so there is nothing to decompose.",
      modelClient.name,
      modelName,
    );
  }

  const knownCodes = new Set(standards.map((standard) => standard.sourceCode));
  const modelRequest: StructuredModelRequest<MapperProposal> = {
    role: "curriculum_mapper",
    promptVersion: MAPPER_PROMPT_VERSION,
    prompt: buildPrompt({ request, adapter, standards, catalogue }),
    schema: MAPPER_SCHEMA,
    // Decomposition, not deep reasoning. Low effort answers in seconds rather than
    // minutes, and a stage that times out helps nobody.
    reasoningEffort: "low",
    parse: (raw) => {
      const value = raw as MapperProposal;
      if (!Array.isArray(value?.knowledgeComponents) || value.knowledgeComponents.length === 0) {
        throw new Error("no knowledge components returned");
      }
      if (!Array.isArray(value.prerequisiteEdges)) throw new Error("no prerequisiteEdges array");
      if (!Array.isArray(value.misconceptions)) throw new Error("no misconceptions array");
      return value;
    },
  };

  const response = await modelClient.complete(modelRequest);
  if (!response.ok) {
    return abstain(
      `Curriculum mapper abstained: ${response.reason}. The deterministic map runs instead.`,
      modelClient.name,
      modelName,
    );
  }

  const proposal = response.value;
  const call: ModelCallRecord = {
    agentId: "agent:curriculum-mapper",
    model: modelName,
    promptVersion: MAPPER_PROMPT_VERSION,
    abstained: false,
    latencyMs: response.latencyMs,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };

  const namespace = `${adapter.jurisdictionId}.${slugify(request.stage.localLabel)}.${slugify(request.subject)}`;
  const kcId = (slug: string) => `kc:${namespace}.${slugify(slug)}`;
  const mcId = (slug: string) => `mc:${namespace}.${slugify(slug)}`;

  const stage = adapter.resolveStage(request.stage.localLabel) ?? request.stage;
  const belowStage = { ...stage, ordinal: Math.max(0, stage.ordinal - 1) };
  const snapshot = findSnapshot(catalogue.sourceId);
  const standardsByCode = new Map(standards.map((standard) => [standard.sourceCode, standard]));

  let droppedCodes = 0;
  let spanMatched = 0;

  const componentSlugs = new Set(proposal.knowledgeComponents.map((c) => slugify(c.slug)));
  const declaredMisconceptions = new Set(proposal.misconceptions.map((m) => slugify(m.slug)));

  const knowledgeComponents: KnowledgeComponent[] = proposal.knowledgeComponents.map(
    (component) => {
      // The model may only point at codes the snapshot actually carried.
      const codes = component.standardCodes.filter((code) => {
        const known = knownCodes.has(code);
        if (!known) droppedCodes += 1;
        return known;
      });
      const cited = codes
        .map((code) => standardsByCode.get(code))
        .filter((standard): standard is StandardNode => standard !== undefined);

      // Evidence is attached by code, quoting the content description verbatim, so
      // the span always matches the snapshot the digest covers.
      const evidence = cited.map((standard) => ({
        sourceId: catalogue.sourceId,
        quotedSpan: standard.statement,
        locator: standard.sourceCode,
        retrievalLanguage: "en",
      }));
      const matched = snapshot
        ? evidence.filter((reference) => spanMatches(snapshot.body, reference.quotedSpan)).length
        : 0;
      spanMatched += matched;

      const basis = [
        `model mapping via ${modelName}`,
        `${matched} of ${evidence.length} evidence spans matched the snapshot`,
      ];

      return {
        knowledgeComponentId: kcId(component.slug),
        label: component.label,
        description: component.description,
        standardIds: cited.map((standard) => standard.standardId),
        stage: component.belowStage ? belowStage : stage,
        prerequisiteOnly: component.belowStage,
        atomicEntry: component.atomicEntry,
        misconceptionIds: component.misconceptionSlugs
          .map((slug) => slugify(slug))
          .filter((slug) => declaredMisconceptions.has(slug))
          .map((slug) => mcId(slug)),
        evidence,
        confidence: {
          // Computed, never self-reported: the share of this component's citations
          // that a validator could actually match, discounted because no expert has
          // seen it. A component with no citation cannot score above the floor.
          value:
            evidence.length === 0 ? 0.3 : Math.min(0.75, 0.3 + 0.45 * (matched / evidence.length)),
          basis,
          unmeasured: ["expert_review", "pilot_data", "item_difficulty"],
        },
      };
    },
  );

  // Edges whose endpoints the model did not declare are dropped rather than
  // repaired. A dangling edge is a mapping error, and inventing the missing node
  // would hide it.
  let droppedEdges = 0;
  const prerequisiteEdges: PrerequisiteEdge[] = proposal.prerequisiteEdges
    .filter((edge) => {
      const ok =
        componentSlugs.has(slugify(edge.fromSlug)) &&
        componentSlugs.has(slugify(edge.toSlug)) &&
        slugify(edge.fromSlug) !== slugify(edge.toSlug) &&
        edge.justification.trim().length > 0;
      if (!ok) droppedEdges += 1;
      return ok;
    })
    .map((edge) => ({
      from: kcId(edge.fromSlug),
      to: kcId(edge.toSlug),
      justification: edge.justification.trim(),
      evidence: [],
    }));

  const misconceptions: Misconception[] = proposal.misconceptions
    .map((misconception) => ({
      misconceptionId: mcId(misconception.slug),
      label: misconception.label,
      description: misconception.description,
      knowledgeComponentIds: misconception.knowledgeComponentSlugs
        .map((slug) => slugify(slug))
        .filter((slug) => componentSlugs.has(slug))
        .map((slug) => kcId(slug)),
    }))
    // A misconception attached to nothing is not a misconception, it is a note.
    .filter((misconception) => misconception.knowledgeComponentIds.length > 0);

  const candidate = {
    schemaVersion: "0.1.0",
    jurisdictionId: request.jurisdictionId,
    curriculumSourceId: request.curriculumSourceId,
    // Standards are the catalogue's, never the model's.
    standards,
    knowledgeComponents,
    prerequisiteEdges,
    misconceptions,
  };

  const parsed = CurriculumGraph.safeParse(candidate);
  if (!parsed.success) {
    return {
      ...abstain(
        `Mapper output did not satisfy the graph contract: ${parsed.error.issues[0]?.message ?? "unknown issue"}. The deterministic map runs instead.`,
        modelClient.name,
        modelName,
      ),
      call: { ...call, abstained: true },
    };
  }

  return {
    graph: parsed.data,
    abstained: false,
    reason: `Mapped ${knowledgeComponents.length} knowledge components and ${prerequisiteEdges.length} prerequisite edges from ${standards.length} fetched content descriptions.`,
    call,
    counts: {
      nodes: knowledgeComponents.length,
      edges: prerequisiteEdges.length,
      misconceptions: misconceptions.length,
      belowStage: knowledgeComponents.filter((kc) => kc.prerequisiteOnly).length,
      spansMatched: spanMatched,
      droppedInventedCodes: droppedCodes,
      droppedDanglingEdges: droppedEdges,
    },
  };
}
