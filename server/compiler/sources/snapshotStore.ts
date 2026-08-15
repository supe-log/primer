import { createHash } from "node:crypto";
import { SourceSnapshot, type SourceSnapshot as SourceSnapshotType } from "@contracts";
import acaraMathematicsY7 from "../../../snapshots/acara-v9-mathematics-year-7.json";
import acaraMathematicsY8 from "../../../snapshots/acara-v9-mathematics-year-8.json";
import acaraTerms from "../../../snapshots/acara-v9-terms.json";
import iesInterleaving from "../../../snapshots/ies-interleaving-rct.json";
import iesOrganizing from "../../../snapshots/ies-organizing-instruction.json";
import rosenshine from "../../../snapshots/rosenshine-principles.json";

/**
 * The snapshot store: fetched bytes plus their provenance record.
 *
 * A snapshot is the unit of truth in this system. The digest covers the exact
 * bytes that were fetched, and everything downstream — standards, evidence spans,
 * licence posture — is derived from those bytes rather than from a model's memory
 * of what a curriculum says.
 *
 * Snapshots are refreshed by `npm run snapshot`, which fetches live, hashes and
 * writes the files in `snapshots/`. They are then imported statically here, so a
 * compile does no network I/O: the same request replays byte-identically, the demo
 * survives a hostile network, and the digest in the run manifest is verifiable
 * against a file in the repository.
 *
 * Invariants, enforced at module load:
 *  - Every stored record parses as a SourceSnapshot.
 *  - `contentSha256` equals the SHA-256 of `body`. A snapshot whose digest does not
 *    match its bytes is a corrupt snapshot, and the process fails loudly here rather
 *    than serving artifacts that cite bytes nobody can reproduce.
 */

/** A provenance record plus the bytes it describes. Private to the compiler. */
export interface StoredSnapshot {
  snapshot: SourceSnapshotType;
  /** The exact fetched payload, as UTF-8 text. `contentSha256` is the digest of this. */
  body: string;
}

export function sha256(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

function loadStored(raw: unknown, label: string): StoredSnapshot {
  const record = raw as { snapshot: unknown; body: unknown };
  if (typeof record?.body !== "string") {
    throw new Error(`snapshot ${label} has no body; run "npm run snapshot" to rebuild it`);
  }
  const snapshot = SourceSnapshot.parse(record.snapshot);
  const digest = sha256(record.body);
  if (digest !== snapshot.contentSha256) {
    throw new Error(
      `snapshot ${label} does not match its digest: recorded ${snapshot.contentSha256}, computed ${digest}. ` +
        `The bytes were edited after they were hashed. Re-run "npm run snapshot".`,
    );
  }
  return { snapshot, body: record.body };
}

const STORE: readonly StoredSnapshot[] = [
  loadStored(acaraMathematicsY7, "acara-v9-mathematics-year-7"),
  loadStored(acaraMathematicsY8, "acara-v9-mathematics-year-8"),
  loadStored(acaraTerms, "acara-v9-terms"),
  loadStored(iesInterleaving, "ies-interleaving-rct"),
  loadStored(iesOrganizing, "ies-organizing-instruction"),
  loadStored(rosenshine, "rosenshine-principles"),
];

/**
 * Run-scoped snapshots collected during compile. Checked before the committed
 * store so a just-fetched curriculum is visible to catalogue and evidence
 * checks without writing `snapshots/*.json`.
 */
const OVERLAY = new Map<string, StoredSnapshot>();

export function putOverlaySnapshot(stored: StoredSnapshot): void {
  const digest = sha256(stored.body);
  if (digest !== stored.snapshot.contentSha256) {
    throw new Error(
      `overlay snapshot ${stored.snapshot.sourceId} does not match its digest: ` +
        `recorded ${stored.snapshot.contentSha256}, computed ${digest}`,
    );
  }
  OVERLAY.set(stored.snapshot.sourceId, stored);
}

export function clearOverlaySnapshots(): void {
  OVERLAY.clear();
}

export function allSnapshots(): readonly StoredSnapshot[] {
  if (OVERLAY.size === 0) return STORE;
  const committed = STORE.filter((entry) => !OVERLAY.has(entry.snapshot.sourceId));
  return [...OVERLAY.values(), ...committed];
}

export function findSnapshot(sourceId: string): StoredSnapshot | undefined {
  return OVERLAY.get(sourceId) ?? STORE.find((stored) => stored.snapshot.sourceId === sourceId);
}

/**
 * Whole days between a snapshot's retrieval and now. The client renders this as a
 * staleness label: a source is never silently "current", it is a specific number of
 * days old. Returns 0 rather than a negative number for a clock skew.
 */
export function snapshotAgeDays(snapshot: SourceSnapshotType, now: Date): number {
  const retrieved = new Date(snapshot.retrievedAt).getTime();
  const elapsed = now.getTime() - retrieved;
  return elapsed <= 0 ? 0 : Math.floor(elapsed / 86_400_000);
}

/**
 * Whitespace-normalized substring match. This is the arithmetic behind a
 * "supported" citation: a quoted span either occurs in the snapshot bytes or the
 * claim is unsupported. Normalizing whitespace is the only latitude given, because
 * JSON payloads and rendered HTML differ in line breaks but not in wording.
 */
export function normalizeForSpanMatch(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function spanMatches(body: string, quotedSpan: string): boolean {
  const span = normalizeForSpanMatch(quotedSpan);
  if (span.length === 0) return false;

  const haystack = normalizeForSpanMatch(body);
  if (haystack.includes(span)) return true;

  // A snapshot whose bytes are JSON holds its text escaped: a content description
  // containing LaTeX, a quote or a backslash appears as \\( rather than \(. The span
  // was parsed out of that JSON, so comparing it raw is comparing across an encoding
  // boundary. Retry in the snapshot's own encoding. This widens what counts as a
  // match by exactly one re-encoding of the same characters, never by fuzzy matching.
  const escaped = JSON.stringify(span).slice(1, -1);
  return escaped !== span && haystack.includes(escaped);
}
