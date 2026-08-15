import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@contracts";
import { stageTone } from "../client/src/lib/pipelineTone";

function event(phase: AgentEvent["phase"], seq: number): AgentEvent {
  return {
    schemaVersion: "0.1.0",
    runId: "run:test",
    seq,
    at: "2026-08-15T14:00:00.000Z",
    agentId: "agent:curriculum-mapper",
    phase,
    message: phase,
    counts: {},
    attempt: 1,
  };
}

describe("pipeline stage tone", () => {
  it("lets a later success beat an earlier abstain", () => {
    expect(
      stageTone([event("agent_abstained", 0), event("agent_succeeded", 1)], false, true),
    ).toBe("pass");
  });

  it("keeps a lone abstain as abstain", () => {
    expect(stageTone([event("agent_abstained", 0)], false, true)).toBe("abstain");
  });

  it("lets a failed check win over success", () => {
    expect(
      stageTone([event("agent_succeeded", 0), event("check_failed", 1)], false, true),
    ).toBe("fail");
  });
});
