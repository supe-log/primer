import clsx from "clsx";
import type { AgentEvent } from "@contracts";
import { Panel } from "./primitives";

/**
 * Visible pipeline status, rendered only from the AgentEvent stream. This component
 * knows nothing about compiler internals, which is the point of the event contract.
 */

const PHASE_TONE: Record<AgentEvent["phase"], string> = {
  run_started: "text-muted-foreground",
  agent_started: "text-muted-foreground",
  agent_succeeded: "text-foreground",
  agent_abstained: "text-warning",
  check_passed: "text-success",
  check_failed: "text-error",
  revision_started: "text-warning",
  gate_evaluated: "text-primary",
  run_completed: "text-primary",
  run_refused: "text-error",
};

export function PipelineStatus({
  events,
  streaming,
}: {
  events: AgentEvent[];
  streaming: boolean;
}) {
  const passed = events.filter((event) => event.phase === "check_passed").length;
  const failed = events.filter((event) => event.phase === "check_failed").length;
  const abstained = events.filter((event) => event.phase === "agent_abstained").length;

  return (
    <Panel
      title="Pipeline"
      subtitle={
        streaming
          ? "Streaming agent events."
          : `${events.length} events. ${passed} checks passed, ${failed} failed, ${abstained} abstained.`
      }
      testId="panel-pipeline"
      action={
        streaming ? (
          <span className="chip" data-testid="status-stream">
            live
          </span>
        ) : null
      }
    >
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No run yet. Submit the form to compile a course.
        </p>
      ) : (
        <ol className="space-y-2.5" data-testid="list-events">
          {events.map((event) => (
            <li
              key={`${event.runId}-${event.seq}`}
              className="grid grid-cols-[3rem_1fr] gap-3 border-b border-border pb-2.5 last:border-0"
              data-testid={`row-event-${event.seq}`}
            >
              <span className="font-mono text-xs text-muted-foreground">
                {String(event.seq).padStart(2, "0")}
              </span>
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {event.agentId.replace(/^agent:/, "")}
                  </span>
                  <span
                    className={clsx("font-mono text-xs uppercase", PHASE_TONE[event.phase])}
                  >
                    {event.phase.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="mt-1 text-sm">{event.message}</p>
                {Object.keys(event.counts).length > 0 ? (
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {Object.entries(event.counts)
                      .map(([key, value]) => `${key} ${value}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
