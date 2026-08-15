import type { AgentEvent, CompilationRequest, CompilationResult } from "@contracts";
import { MockModelClient, type ModelClient } from "./model/modelClient";
import { defaultDeps, runCompile, COMPILER_VERSION } from "./orchestrator";

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

export interface CompilerOptions {
  /** Defaults to MockModelClient, which abstains and lets the deterministic path run. */
  modelClient?: ModelClient;
  /** Defaults to a fixed clock so replays are byte-identical. */
  now?: () => Date;
}

export function createCompiler(options: CompilerOptions = {}): Compiler {
  const base = defaultDeps();
  const deps = {
    modelClient: options.modelClient ?? base.modelClient,
    now: options.now ?? base.now,
  };
  const runs = new Map<string, AgentEvent[]>();
  let sequence = 0;

  return {
    async compile(request) {
      sequence += 1;
      const record = runCompile(request, deps, sequence);
      runs.set(record.result.runId, record.events);
      return record.result;
    },
    observe(runId) {
      return runs.get(runId) ?? [];
    },
  };
}

export { MockModelClient, COMPILER_VERSION };
export type { ModelClient };
