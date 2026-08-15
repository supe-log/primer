import { z } from "zod";
import { AgentId, IsoDateTime, RunId, schemaVersionField } from "./primitives";

/**
 * AgentEvent is the observation half of the compiler seam. The client renders the
 * pipeline entirely from this stream and never reaches into compiler internals.
 *
 * Invariants:
 *  - `seq` starts at 0 and increases by one per event within a run. The client may
 *    rely on ordering and may detect gaps.
 *  - Every run's stream ends with exactly one event of phase "run_completed" or
 *    "run_refused". No other event may follow it.
 *  - `agentId` names the stage that produced the event, so the UI can group.
 *  - An event never carries an artifact body. Artifacts arrive in CompilationResult.
 */

export const AgentPhase = z.enum([
  "run_started",
  "agent_started",
  "agent_succeeded",
  "agent_abstained",
  "check_passed",
  "check_failed",
  "revision_started",
  "gate_evaluated",
  "run_completed",
  "run_refused",
]);
export type AgentPhase = z.infer<typeof AgentPhase>;

export const AgentEvent = z.object({
  schemaVersion: schemaVersionField,
  runId: RunId,
  seq: z.number().int().min(0),
  at: IsoDateTime,
  agentId: AgentId,
  phase: AgentPhase,
  /** One short sentence, written to be readable on a projector. */
  message: z.string().min(1),
  /** Optional counters for the UI, for example items generated and rejected. */
  counts: z.record(z.string(), z.number()).default({}),
  /** Revision loop depth. Bounded at 2 by the orchestrator. */
  attempt: z.number().int().min(1).default(1),
});
export type AgentEvent = z.infer<typeof AgentEvent>;
