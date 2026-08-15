import { z } from "zod";
import {
  CheckId,
  GateVerdict,
  PermissionTier,
  schemaVersionField,
} from "./primitives";

/**
 * Gate checks and the gate report.
 *
 * Invariants:
 *  - Gate arithmetic is pure code. No model decides a verdict.
 *  - A blocking check with status "fail" forces at most YELLOW, and a failed
 *    licence or source check forces AMBER or RED.
 *  - "abstain" is a first-class status. It is never coerced into "pass" or "fail".
 *  - `permission` is the ceiling earned, not the ceiling requested.
 *  - Anything the run could not measure is listed in `unmeasured`, and anything
 *    missing that would raise the verdict is listed in `missingEvidence`.
 */

export const GateCheckStatus = z.enum(["pass", "fail", "abstain", "skipped"]);
export type GateCheckStatus = z.infer<typeof GateCheckStatus>;

export const GateCheck = z.object({
  checkId: CheckId,
  label: z.string().min(1),
  /** Deterministic checks are model-free and blocking. Critics screen and may abstain. */
  kind: z.enum(["deterministic", "model_critic", "expert_review", "pilot_measurement"]),
  blocking: z.boolean(),
  status: GateCheckStatus,
  /** What the check looked at and what it found. Shown verbatim in the UI. */
  detail: z.string().min(1),
  /** Countable evidence, for example items inspected and items rejected. */
  counts: z.record(z.string(), z.number()).default({}),
});
export type GateCheck = z.infer<typeof GateCheck>;

export const GateReport = z.object({
  schemaVersion: schemaVersionField,
  verdict: GateVerdict,
  permission: PermissionTier,
  checks: z.array(GateCheck).min(1),
  /** Named evidence that, if collected, could raise the verdict. */
  missingEvidence: z.array(z.string().min(1)).default([]),
  /** Properties this run did not measure. Listed, never silently defaulted. */
  unmeasured: z.array(z.string().min(1)).default([]),
  /** Artifacts that a human must look at before use. */
  needsHumanReview: z.array(z.string().min(1)).default([]),
  /** One-line summary written for a reviewer, not for marketing. */
  summary: z.string().min(1),
});
export type GateReport = z.infer<typeof GateReport>;
