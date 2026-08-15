import type { AgentEvent, CompilationRequest, CompilationResult } from "@contracts";
import { resolveAdapter, type JurisdictionAdapter } from "./adapters/jurisdiction";
import {
  collectionFetchForTests,
  ensureEvidence,
  evidenceIsReady,
} from "./collect/ensureEvidence";
import { MockModelClient, type ModelClient } from "./model/modelClient";
import { modelClientFromEnv } from "./model/xaiModelClient";
import { defaultDeps, runCompile, COMPILER_VERSION } from "./orchestrator";
import { buildSourceManifest } from "./sources/catalogue";
import { buildModelBundle, type ModelBundle, type StageNote } from "./stages/modelBundle";

function manifestFor(adapter: JurisdictionAdapter) {
  return buildSourceManifest(adapter.snapshotSourceIds);
}

/**
 * The external compiler seam. Two operations, nothing else:
 *
 *   compile(request)   run one compile and get the whole result
 *   observe(runId)     read the event stream that run produced
 *
 * Everything else, meaning adapters, snapshot handling, validators, critics, gate
 * arithmetic, revision loops, is private to the implementation. Callers cannot
 * reach a stage directly, which is what keeps the pipeline free to change while
 * the route handlers, the client and the tests stay still.
 *
 * Interface contract:
 *  - `compile` never throws for an unsupported or unsafe request. It returns a
 *    result with status "refused" and a refusal report naming the missing evidence.
 *    It throws only for a programming error, which is a 500.
 *  - `compile` never publishes. Every result comes back with approvedByHuman false.
 *  - `observe` returns the full event list for a completed run, ordered by seq, and
 *    an empty array for an unknown run id.
 *  - With the default MockModelClient the compiler is deterministic: the same
 *    request produces byte-identical artifacts apart from the run sequence number.
 */
export interface Compiler {
  compile(request: CompilationRequest): Promise<CompilationResult>;
  observe(runId: string): AgentEvent[];
}

/**
 * Process-local handle used by HTTP routes. `result` is not part of the public
 * Compiler seam; it only lets export and graph presentation read a completed run
 * without reaching into stages.
 */
export interface CompilerHandle extends Compiler {
  result(runId: string): CompilationResult | undefined;
}

export interface CompilerOptions {
  /** Defaults to MockModelClient, which abstains and lets the deterministic path run. */
  modelClient?: ModelClient;
  /** Defaults to a fixed clock so replays are byte-identical. */
  now?: () => Date;
  /**
   * Used only when a snapshot is missing and collection runs. Tests inject a fake
   * so CI never touches the network. In Vitest the default throws; elsewhere it
   * is global fetch.
   */
  fetchImpl?: typeof fetch;
}

export function createCompiler(options: CompilerOptions = {}): CompilerHandle {
  const base = defaultDeps();
  const deps = {
    // Explicit option first, then the environment, then the mock. Passing a client
    // in tests keeps them offline and deterministic; setting XAI_API_KEY switches
    // the real stages on without any caller changing.
    modelClient: options.modelClient ?? modelClientFromEnv() ?? base.modelClient,
    now: options.now ?? base.now,
    fetchImpl: options.fetchImpl ?? collectionFetchForTests(),
  };
  const runs = new Map<string, AgentEvent[]>();
  const results = new Map<string, CompilationResult>();
  let sequence = 0;

  return {
    async compile(request) {
      sequence += 1;
      // Collection runs first so a missing snapshot is fetched and hashed before
      // any mapper spends a token. Official exam emulation never collects.
      const evidence = await ensureEvidence(request, deps);
      const generated = evidence.ready ? await generateArtifacts(evidence.request, deps) : undefined;
      const record = runCompile(evidence.request, deps, sequence, generated);
      const events = spliceCollectionNotes(record.events, evidence.notes, deps.now);
      runs.set(record.result.runId, events);
      results.set(record.result.runId, record.result);
      return record.result;
    },
    observe(runId) {
      return runs.get(runId) ?? [];
    },
    result(runId) {
      return results.get(runId);
    },
  };
}

/**
 * Runs the model-backed stages for a request the compiler will accept. Returns
 * undefined when there is nothing to generate — an unresolvable jurisdiction, or a
 * request the compiler is going to refuse before generating anything — so a refusal
 * never spends a token, which is the rule that makes the refusal path fast and the
 * demo safe.
 */
async function generateArtifacts(
  request: CompilationRequest,
  deps: { modelClient: ModelClient },
): Promise<ModelBundle | undefined> {
  const adapter = resolveAdapter(request.jurisdictionId);
  if (!adapter) return undefined;
  if (!adapter.resolveStage(request.stage.localLabel)) return undefined;
  if (request.assessmentTarget === "official_exam_emulation" && !adapter.blueprintAvailable(request)) {
    return undefined;
  }
  if (!evidenceIsReady(request)) return undefined;

  return buildModelBundle({
    request,
    adapter,
    sourceManifest: manifestFor(adapter),
    modelClient: deps.modelClient,
  });
}

function spliceCollectionNotes(
  events: AgentEvent[],
  notes: StageNote[],
  now: () => Date,
): AgentEvent[] {
  if (notes.length === 0) return events;
  const runId = events[0]?.runId;
  if (!runId) return events;
  const injected: AgentEvent[] = notes.map((entry) => ({
    schemaVersion: "0.1.0",
    runId,
    seq: 0,
    at: now().toISOString(),
    agentId: entry.agentId,
    phase: entry.phase,
    message: entry.message,
    counts: entry.counts ?? {},
    attempt: entry.attempt ?? 1,
  }));
  const start = events[0];
  const rest = events.slice(1);
  return [start, ...injected, ...rest].map((event, seq) => ({ ...event, seq }));
}

export { MockModelClient, COMPILER_VERSION };
export type { ModelClient };
