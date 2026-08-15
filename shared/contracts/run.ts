import { z } from "zod";
import { IsoDateTime, RequestId, RunId, Sha256, schemaVersionField } from "./primitives";

/**
 * RunManifest is the reproducibility record. If an artifact cannot be reproduced
 * or repudiated from this record, the record is incomplete.
 *
 * Invariants:
 *  - Every model call the run made appears in `modelCalls`, including abstained ones.
 *  - `sourceDigests` lists every snapshot digest the run read.
 *  - `replayable: true` means running the same request against the same fixtures
 *    reproduces byte-identical artifacts.
 */

export const ModelCallRecord = z.object({
  agentId: z.string().min(1),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  /** true when the call could not produce a usable result. Abstentions are results. */
  abstained: z.boolean().default(false),
  latencyMs: z.number().int().min(0).default(0),
  inputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0).default(0),
});
export type ModelCallRecord = z.infer<typeof ModelCallRecord>;

export const RunManifest = z.object({
  schemaVersion: schemaVersionField,
  runId: RunId,
  requestId: RequestId,
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime,
  /** Name of the compiler build, so a demo recording can be traced to code. */
  compilerVersion: z.string().min(1),
  modelClient: z.enum(["mock", "xai"]),
  modelCalls: z.array(ModelCallRecord).default([]),
  sourceDigests: z.array(Sha256).default([]),
  /** Kept and discarded revision attempts. Discards are results too. */
  revisions: z
    .array(
      z.object({
        agentId: z.string().min(1),
        attempt: z.number().int().min(1),
        kept: z.boolean(),
        reason: z.string().min(1),
      }),
    )
    .default([]),
  replayable: z.boolean(),
});
export type RunManifest = z.infer<typeof RunManifest>;
