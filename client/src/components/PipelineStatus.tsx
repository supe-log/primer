import clsx from "clsx";
import type { AgentEvent } from "@contracts";
import { stageTone, type StageTone } from "@/lib/pipelineTone";
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

const TONE_STYLES: Record<StageTone, string> = {
  idle: "border-border text-muted-foreground",
  live: "border-primary/40 bg-primary/5 text-primary",
  pass: "border-success/30 bg-success/5 text-success",
  fail: "border-error/40 bg-error/5 text-error",
  abstain: "border-warning/40 bg-warning/5 text-warning",
};

function groupByStage(events: AgentEvent[]): { agentId: string; events: AgentEvent[] }[] {
  const groups: { agentId: string; events: AgentEvent[] }[] = [];
  for (const event of events) {
    const last = groups.at(-1);
    if (last && last.agentId === event.agentId) {
      last.events.push(event);
    } else {
      groups.push({ agentId: event.agentId, events: [event] });
    }
  }
  return groups;
}

function namedRule(event: AgentEvent): string | null {
  if (event.phase !== "check_failed") {
    return null;
  }
  const checkMatch = event.message.match(/check:[a-z0-9][a-z0-9._\-]*/i);
  if (checkMatch) {
    return checkMatch[0];
  }
  const itemMatch = event.message.match(/item:[a-z0-9][a-z0-9._\-]*/i);
  return itemMatch ? itemMatch[0] : event.message;
}

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
  const revisions = events.filter((event) => event.phase === "revision_started").length;
  const stages = groupByStage(events);
  const failures = events.filter((event) => event.phase === "check_failed");

  return (
    <Panel
      title="Pipeline"
      subtitle={
        streaming
          ? "Streaming agent events. Artifacts arrive when the run finishes."
          : events.length === 0
            ? "No run yet."
            : `${stages.length} stages · ${events.length} events`
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
          Submit the form to compile. This panel renders only from the event stream.
        </p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="list-pipeline-counters">
            <Counter label="passed" value={passed} tone="text-success" />
            <Counter label="failed" value={failed} tone="text-error" />
            <Counter label="abstained" value={abstained} tone="text-warning" />
            <Counter label="revisions" value={revisions} tone="text-muted-foreground" />
          </dl>

          {failures.length > 0 ? (
            <div
              className="rounded-md border border-error/40 bg-error/10 p-3"
              data-testid="list-pipeline-failures"
            >
              <h3 className="label text-error">Failed checks</h3>
              <ul className="mt-2 space-y-1.5">
                {failures.map((event) => (
                  <li key={`${event.runId}-${event.seq}`} className="text-sm">
                    <span className="font-mono text-xs text-error">{namedRule(event)}</span>
                    <p className="mt-0.5">{event.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <ol className="space-y-3" data-testid="list-events">
            {stages.map((stage, index) => {
              const tone = stageTone(stage.events, streaming, index === stages.length - 1);
              const name = stage.agentId.replace(/^agent:/, "");
              return (
                <li
                  key={`${stage.agentId}-${stage.events[0]?.seq ?? index}`}
                  className={clsx("rounded-md border p-3", TONE_STYLES[tone])}
                  data-testid={`row-stage-${name}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-mono text-xs uppercase tracking-wide">{name}</h3>
                    <span className="font-mono text-xs uppercase">{tone}</span>
                  </div>
                  <ol className="mt-2 space-y-2 text-foreground">
                    {stage.events.map((event) => (
                      <li
                        key={`${event.runId}-${event.seq}`}
                        className="grid grid-cols-[2.25rem_1fr] gap-2"
                        data-testid={`row-event-${event.seq}`}
                      >
                        <span className="font-mono text-xs text-muted-foreground">
                          {String(event.seq).padStart(2, "0")}
                        </span>
                        <div>
                          <span
                            className={clsx(
                              "font-mono text-xs uppercase",
                              PHASE_TONE[event.phase],
                            )}
                          >
                            {event.phase.replace(/_/g, " ")}
                          </span>
                          <p className="mt-0.5 break-words text-sm">{event.message}</p>
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
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Panel>
  );
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-alt px-3 py-2">
      <dt className="label">{label}</dt>
      <dd className={clsx("mt-1 font-mono text-2xl leading-none", tone)} data-testid={`count-${label}`}>
        {value}
      </dd>
    </div>
  );
}
