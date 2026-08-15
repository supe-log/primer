import type { AgentEvent } from "@contracts";

export type StageTone = "idle" | "live" | "pass" | "fail" | "abstain";

/**
 * Colour a pipeline stage from its events. A later success beats an earlier
 * abstain so a mapper that falls back still shows as having produced a graph.
 * Any failed check or refusal still wins.
 */
export function stageTone(
  events: AgentEvent[],
  streaming: boolean,
  isLast: boolean,
): StageTone {
  if (events.some((event) => event.phase === "check_failed" || event.phase === "run_refused")) {
    return "fail";
  }
  if (
    events.some(
      (event) =>
        event.phase === "check_passed" ||
        event.phase === "agent_succeeded" ||
        event.phase === "gate_evaluated" ||
        event.phase === "run_completed",
    )
  ) {
    return "pass";
  }
  if (events.some((event) => event.phase === "agent_abstained")) {
    return "abstain";
  }
  if (streaming && isLast) {
    return "live";
  }
  return "idle";
}
