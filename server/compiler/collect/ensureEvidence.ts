import type { CompilationRequest } from "@contracts";
import { catalogueSourceIdFor, resolveAdapter, restoreStockAdapters } from "../adapters/jurisdiction";
import type { ModelClient } from "../model/modelClient";
import { clearCollectedCatalogues, curriculumReadiness } from "../sources/catalogue";
import { clearOverlaySnapshots } from "../sources/snapshotStore";
import type { StageNote } from "../stages/modelBundle";
import { collectEvidence, type CollectDeps } from "./collectEvidence";

/** Clears ephemeral snapshots and adapters. Tests call this in afterEach. */
export function resetCollectionState(): void {
  clearOverlaySnapshots();
  clearCollectedCatalogues();
  restoreStockAdapters();
}

export interface EvidenceAssurance {
  request: CompilationRequest;
  /** True when a snapshot is ready and compile may generate. */
  ready: boolean;
  notes: StageNote[];
}

export function evidenceIsReady(request: CompilationRequest): boolean {
  const adapter = resolveAdapter(request.jurisdictionId);
  if (!adapter) return false;
  if (!adapter.resolveStage(request.stage.localLabel)) return false;
  return curriculumReadiness({
    catalogueSourceId: catalogueSourceIdFor(adapter, request.stage.localLabel),
    authorityName: adapter.authorityName,
    standardIds: request.standardIds,
  }).ok;
}

/**
 * If the request already has a fetched snapshot, do nothing.
 * Official exam emulation never collects — that would invent a blueprint.
 * Otherwise research, fetch, hash and licence-classify for this run.
 */
export async function ensureEvidence(
  request: CompilationRequest,
  deps: CollectDeps,
): Promise<EvidenceAssurance> {
  if (request.assessmentTarget === "official_exam_emulation") {
    return { request, ready: false, notes: [] };
  }
  if (evidenceIsReady(request)) {
    return { request, ready: true, notes: [] };
  }

  const collected = await collectEvidence(request, deps);
  if (!collected.ok) {
    return { request, ready: false, notes: collected.notes };
  }
  return {
    request: collected.request,
    ready: evidenceIsReady(collected.request),
    notes: collected.notes,
  };
}

export function collectionFetchForTests(env: NodeJS.ProcessEnv = process.env): typeof fetch {
  if (env.VITEST) {
    return async () => {
      throw new Error("network disabled in tests; inject fetchImpl to collect");
    };
  }
  return fetch;
}

export type { ModelClient };
