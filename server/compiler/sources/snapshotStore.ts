import { createHash } from "node:crypto";
import { SourceSnapshot, type SourceSnapshot as SourceSnapshotType } from "@contracts";
import acaraMathematicsY7 from "../../../snapshots/acara-v9-mathematics-year-7.json";
import acaraTerms from "../../../snapshots/acara-v9-terms.json";
import iesInterleaving from "../../../snapshots/ies-interleaving-rct.json";

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
  loadStored(acaraTerms, "acara-v9-terms"),
  loadStored(iesInterleaving, "ies-interleaving-rct"),
];

export function allSnapshots(): readonly StoredSnapshot[] {
  return STORE;
}

export function findSnapshot(sourceId: string): StoredSnapshot | undefined {
  return STORE.find((stored) => stored.snapshot.sourceId === sourceId);
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
  return normalizeForSpanMatch(body).includes(span);
}
