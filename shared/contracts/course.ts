import { z } from "zod";
import { EvidenceReference } from "./source";
import {
  ItemId,
  KnowledgeComponentId,
  LessonId,
  UnitId,
  schemaVersionField,
} from "./primitives";

/**
 * The course plan: scope, sequence, lessons and worked examples.
 *
 * Invariants:
 *  - Lesson order across units is a topological order of the prerequisite graph.
 *  - Every knowledge component in the graph is scheduled in exactly one lesson as
 *    `introducesKnowledgeComponentIds`, and may recur in `reviewsKnowledgeComponentIds`.
 *  - Every sequencing decision carries a reason and, where the reason is an
 *    empirical claim, an EvidenceReference. A model asserting "spaced for retention"
 *    is not the same artifact as a schedule that computes intervals and cites why.
 *  - Worked examples fade: `fadedSteps` is a subset of the steps left for the learner.
 */

export const SequencingDecision = z.object({
  /** One of the named pedagogical levers this scaffold understands. */
  lever: z.enum([
    "prerequisite_order",
    "spacing",
    "interleaving",
    "retrieval_practice",
    "worked_example_fading",
    "mastery_threshold",
    "explicit_instruction_arc",
  ]),
  reason: z.string().min(1),
  /** Evidence level of the principle invoked, so a weak rule is never a hard constraint. */
  evidenceLevel: z.enum(["strong", "moderate", "low", "convention"]),
  evidence: z.array(EvidenceReference).default([]),
});
export type SequencingDecision = z.infer<typeof SequencingDecision>;

export const WorkedExample = z.object({
  prompt: z.string().min(1),
  steps: z.array(z.string().min(1)).min(1),
  /** Indices of steps shown fully worked. The rest are left for the learner. */
  fadedSteps: z.array(z.number().int().min(0)).default([]),
  knowledgeComponentId: KnowledgeComponentId,
});
export type WorkedExample = z.infer<typeof WorkedExample>;

export const Lesson = z.object({
  lessonId: LessonId,
  unitId: UnitId,
  title: z.string().min(1),
  /** Learner-facing objective, backward-designed from the assessed knowledge component. */
  objective: z.string().min(1),
  introducesKnowledgeComponentIds: z.array(KnowledgeComponentId).min(1),
  reviewsKnowledgeComponentIds: z.array(KnowledgeComponentId).default([]),
  /** Explicit-instruction arc. All five phases are required. */
  arc: z.object({
    review: z.string().min(1),
    modelling: z.string().min(1),
    guidedPractice: z.string().min(1),
    independentPractice: z.string().min(1),
    closingReview: z.string().min(1),
  }),
  /** Target success rate during guided practice, expressed as a proportion. */
  guidedPracticeSuccessTarget: z.number().min(0).max(1),
  workedExamples: z.array(WorkedExample).default([]),
  retrievalPrompts: z.array(z.string().min(1)).default([]),
  deepExplanatoryQuestions: z.array(z.string().min(1)).default([]),
  itemIds: z.array(ItemId).default([]),
  decisions: z.array(SequencingDecision).default([]),
});
export type Lesson = z.infer<typeof Lesson>;

export const Unit = z.object({
  unitId: UnitId,
  title: z.string().min(1),
  goal: z.string().min(1),
  lessonIds: z.array(LessonId).min(1),
});
export type Unit = z.infer<typeof Unit>;

export const CoursePlan = z.object({
  schemaVersion: schemaVersionField,
  title: z.string().min(1),
  /** Topological order over the prerequisite graph, tie-broken by the source's own order. */
  knowledgeComponentOrder: z.array(KnowledgeComponentId).min(1),
  units: z.array(Unit).min(1),
  lessons: z.array(Lesson).min(1),
  /** Mastery rule per knowledge component, stated as a rule rather than a vibe. */
  masteryCriteria: z
    .array(
      z.object({
        knowledgeComponentId: KnowledgeComponentId,
        rule: z.string().min(1),
      }),
    )
    .default([]),
  decisions: z.array(SequencingDecision).default([]),
});
export type CoursePlan = z.infer<typeof CoursePlan>;
