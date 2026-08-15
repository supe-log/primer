import { z } from "zod";
import { EvidenceReference } from "./source";
import {
  Confidence,
  KnowledgeComponentId,
  MisconceptionId,
  StandardId,
  Stage,
  schemaVersionField,
} from "./primitives";

/**
 * The curriculum graph: the intermediate representation of the compiler.
 *
 * Invariants (all enforced by the deterministic graph validator, not by a model):
 *  - Prerequisite edges form a directed acyclic graph.
 *  - Every edge's `from` and `to` reference a knowledge component in `knowledgeComponents`.
 *  - Every edge carries a justification. An unjustified edge is a validator failure.
 *  - A knowledge component with no incoming and no outgoing edge must set
 *    `atomicEntry: true`, otherwise it is an orphan and fails the graph gate.
 *  - Every knowledge component carries at least one EvidenceReference, or is
 *    flagged `prerequisiteOnly: true` when it sits below the requested stage.
 */

export const StandardNode = z.object({
  standardId: StandardId,
  /** The jurisdiction's own code, verbatim. Never renumbered. */
  sourceCode: z.string().min(1),
  statement: z.string().min(1),
  evidence: z.array(EvidenceReference).min(1),
});
export type StandardNode = z.infer<typeof StandardNode>;

export const Misconception = z.object({
  misconceptionId: MisconceptionId,
  label: z.string().min(1),
  description: z.string().min(1),
  /** The knowledge components this error pattern attaches to. */
  knowledgeComponentIds: z.array(KnowledgeComponentId).min(1),
});
export type Misconception = z.infer<typeof Misconception>;

export const KnowledgeComponent = z.object({
  knowledgeComponentId: KnowledgeComponentId,
  label: z.string().min(1),
  /** What a learner can do when this component is held. Written for a teacher. */
  description: z.string().min(1),
  standardIds: z.array(StandardId).default([]),
  stage: Stage,
  /** True when the component sits below the requested stage and was pulled in. */
  prerequisiteOnly: z.boolean().default(false),
  /** True when the component has no prerequisites by design. */
  atomicEntry: z.boolean().default(false),
  misconceptionIds: z.array(MisconceptionId).default([]),
  evidence: z.array(EvidenceReference).default([]),
  confidence: Confidence,
});
export type KnowledgeComponent = z.infer<typeof KnowledgeComponent>;

export const PrerequisiteEdge = z.object({
  from: KnowledgeComponentId,
  to: KnowledgeComponentId,
  /** Why this ordering holds. Required. */
  justification: z.string().min(1),
  evidence: z.array(EvidenceReference).default([]),
});
export type PrerequisiteEdge = z.infer<typeof PrerequisiteEdge>;

export const CurriculumGraph = z.object({
  schemaVersion: schemaVersionField,
  jurisdictionId: z.string().min(1),
  curriculumSourceId: z.string().min(1),
  standards: z.array(StandardNode).min(1),
  knowledgeComponents: z.array(KnowledgeComponent).min(1),
  prerequisiteEdges: z.array(PrerequisiteEdge),
  misconceptions: z.array(Misconception).default([]),
});
export type CurriculumGraph = z.infer<typeof CurriculumGraph>;
