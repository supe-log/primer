import { useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import {
  SCHEMA_VERSION,
  type AgentEvent,
  type CompilationRequest,
  type CompilationResult,
} from "@contracts";
import { compile, fetchDemoRequest, fetchExport, fetchGraph, streamEvents } from "@/lib/api";
import type { GraphView, PublicExportBundle } from "@/lib/views";
import { IntakeForm } from "@/components/IntakeForm";
import { PipelineStatus } from "@/components/PipelineStatus";
import { ArtifactSummary } from "@/components/ArtifactSummary";
import { GateVerdictPanel } from "@/components/GateVerdictPanel";
import { KnowledgeGraph } from "@/components/KnowledgeGraph";
import { ExportPanel } from "@/components/ExportPanel";
import { Logo } from "@/components/primitives";

/**
 * The single page. State lives here: request, result, events, theme. No storage APIs
 * are used anywhere in this app, by rule.
 */
export default function Compile() {
  const [initialRequest, setInitialRequest] = useState<CompilationRequest | null>(null);
  const [result, setResult] = useState<CompilationResult | null>(null);
  const [graph, setGraph] = useState<GraphView | null>(null);
  const [exported, setExported] = useState<PublicExportBundle | null>(null);
  const [loadId, setLoadId] = useState("");
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

  async function loadPresentation(runId: string) {
    const [nextGraph, nextExport] = await Promise.all([
      fetchGraph(runId).catch(() => null),
      fetchExport(runId),
    ]);
    setGraph(nextGraph);
    setExported(nextExport);
    setLoadId(runId);
  }

  async function run(request: CompilationRequest) {
    setPending(true);
    setError(null);
    setEvents([]);
    setResult(null);
    setGraph(null);
    setExported(null);
    unsubscribe.current?.();

    try {
      const compiled = await compile(request);
      setResult(compiled);
      await loadPresentation(compiled.runId);
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

  async function loadExisting() {
    const runId = loadId.trim();
    if (!runId) return;
    setPending(true);
    setError(null);
    try {
      await loadPresentation(runId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setGraph(null);
      setExported(null);
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

      <div className="mt-6 space-y-6">
        <div className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[16rem] flex-1">
            <label className="label" htmlFor="run-id">
              Persisted run
            </label>
            <input
              id="run-id"
              className="field mt-1.5"
              value={loadId}
              onChange={(event) => setLoadId(event.target.value)}
              placeholder="run:…"
              data-testid="input-run-id"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadExisting()}
            disabled={pending || loadId.trim().length === 0}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface-alt disabled:opacity-60"
            data-testid="button-load-run"
          >
            Load graph and export
          </button>
        </div>
        <KnowledgeGraph graph={graph} runId={result?.runId ?? (loadId || undefined)} />
        <ExportPanel exported={exported} runId={result?.runId ?? (loadId || undefined)} />
      </div>
    </main>
  );
}
