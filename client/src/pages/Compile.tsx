import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  SCHEMA_VERSION,
  type AgentEvent,
  type CompilationRequest,
  type CompilationResult,
} from "@contracts";
import { compile, fetchDemoRequest, streamEvents } from "@/lib/api";
import { IntakeForm } from "@/components/IntakeForm";
import { PipelineStatus } from "@/components/PipelineStatus";
import { ArtifactSummary } from "@/components/ArtifactSummary";
import { GateVerdictPanel } from "@/components/GateVerdictPanel";
import { Logo } from "@/components/primitives";

/**
 * The single page. State lives here: request, result, events, theme. No storage APIs
 * are used anywhere in this app, by rule.
 */
export default function Compile() {
  const [initialRequest, setInitialRequest] = useState<CompilationRequest | null>(null);
  const [result, setResult] = useState<CompilationResult | null>(null);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(
    () => typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  useEffect(() => {
    fetchDemoRequest()
      .then(setInitialRequest)
      .catch((cause: Error) => setError(cause.message));
    return () => unsubscribe.current?.();
  }, []);

  async function run(request: CompilationRequest) {
    setPending(true);
    setError(null);
    setEvents([]);
    setResult(null);
    unsubscribe.current?.();

    try {
      const compiled = await compile(request);
      setResult(compiled);
      setStreaming(true);
      unsubscribe.current = streamEvents(
        compiled.runId,
        (event) => setEvents((current) => [...current, event]),
        () => setStreaming(false),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setPending(false);
    }
  }

  const header = useMemo(
    () => (
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Logo className="mt-1 h-7 w-7 text-primary" />
          <div>
            <h1 className="text-xl font-bold tracking-tight">Primer Compiler</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Turns an official curriculum into a sequenced course and a standards-tagged item bank,
              and refuses anything it cannot trace to a source, a prerequisite and a passing check.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="chip">contracts {SCHEMA_VERSION}</span>
          <button
            type="button"
            onClick={() => setDark((current) => !current)}
            className="rounded-md border border-border p-2 text-muted-foreground hover:text-foreground"
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            data-testid="button-theme"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>
    ),
    [dark],
  );

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      {header}

      {error ? (
        <p
          className="mb-6 rounded-md border border-error/40 bg-error/10 p-3 text-sm text-error"
          data-testid="text-error"
        >
          {error}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {initialRequest ? (
            <IntakeForm initial={initialRequest} pending={pending} onSubmit={run} />
          ) : (
            <div className="card h-64 animate-pulse" aria-hidden="true" />
          )}
          <PipelineStatus events={events} streaming={streaming} />
        </div>

        <div className="space-y-6">
          {result ? <GateVerdictPanel result={result} /> : null}
          {result ? <ArtifactSummary result={result} /> : null}
          {result ? null : (
            <div className="card p-5 text-sm text-muted-foreground">
              <p>
                Nothing compiled yet. The scaffold runs the deterministic half of the pipeline for
                real: adapters, validators, gate arithmetic and the refusal path. Generated content
                is replayed from a frozen prototype sample until the model client is wired.
              </p>
              <p className="mt-3">
                Set assessment target to official exam emulation to see the refusal path.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
