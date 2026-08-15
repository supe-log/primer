import { z } from "zod";
import { EvidenceReference } from "./source";
import {
  DemandBand,
  ItemId,
  ItemPurpose,
  KnowledgeComponentId,
  MisconceptionId,
  StandardId,
  schemaVersionField,
} from "./primitives";

/**
 * Question items.
 *
 * Invariants (deterministic validators enforce all of these):
 *  - Exactly one option has `correct: true`. Two defensible keys is a rejection,
 *    not a repair.
 *  - Every incorrect option names a misconceptionId that exists in the graph.
 *  - Every option carries a rationale. "None of the above" style options are rejected.
 *  - `standardIds` and `knowledgeComponentIds` are non-empty and resolve into the graph.
 *  - `difficulty.calibrated` is false until pilot response data exists, and
 *    `difficulty.difStatus` starts at "not_yet_measured". Honest absence beats a
 *    fake fairness badge.
 */

export const ItemOption = z.object({
  optionId: z.string().regex(/^[A-D]$/),
  text: z.string().min(1),
  correct: z.boolean(),
  rationale: z.string().min(1),
  /** Required on incorrect options: the named error pattern this distractor targets. */
  misconceptionId: MisconceptionId.optional(),
});
export type ItemOption = z.infer<typeof ItemOption>;

export const ItemDifficulty = z.object({
  /** Intended demand band. Measured against the blueprint as a histogram. */
  band: DemandBand,
  /** Author or model estimate on a 1 to 5 scale. Not a psychometric parameter. */
  estimate: z.number().int().min(1).max(5),
  calibrated: z.boolean(),
  difStatus: z.enum(["not_yet_measured", "measured_clear", "measured_flagged"]),
});
export type ItemDifficulty = z.infer<typeof ItemDifficulty>;

export const QuestionItem = z.object({
  schemaVersion: schemaVersionField,
  itemId: ItemId,
  purpose: ItemPurpose,
  stem: z.string().min(1),
  options: z.array(ItemOption).min(3).max(4),
  /** Denormalized key for readers that do not want to scan options. Must agree. */
  correctOptionId: z.string().regex(/^[A-D]$/),
  /** Why the key is the key, in language a reviewer can accept or reject fast. */
  keyRationale: z.string().min(1),
  standardIds: z.array(StandardId).min(1),
  knowledgeComponentIds: z.array(KnowledgeComponentId).min(1),
  difficulty: ItemDifficulty,
  /** Blueprint cell this item was generated to fill, when a blueprint exists. */
  blueprintCell: z.string().min(1).optional(),
  evidence: z.array(EvidenceReference).default([]),
  /** Set when a validator or critic rejected the item. Rejected items still ship visibly. */
  rejection: z
    .object({
      checkId: z.string().min(1),
      reason: z.string().min(1),
    })
    .optional(),
});
export type QuestionItem = z.infer<typeof QuestionItem>;
