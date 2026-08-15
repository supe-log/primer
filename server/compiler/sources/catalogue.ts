import {
  SourceManifest,
  type SourceManifest as SourceManifestType,
  type StandardNode,
} from "@contracts";
import {
  achievementStandard,
  contentDescriptions,
  elaborationsFor,
  parseAcaraRecords,
  standardIdForCode,
  type AcaraRecord,
} from "./acara";
import { allSnapshots, findSnapshot, spanMatches } from "./snapshotStore";

/**
 * The curriculum catalogue: standards derived from hashed snapshot bytes.
 *
 * This is the join between provenance and pedagogy. Everything a `StandardNode`
 * asserts — the official code, the statement, the quoted span — is read out of a
 * snapshot whose digest is recorded in the run manifest, so a reviewer can take any
 * standard in a bundle and find the bytes it came from.
 *
 * Nothing here paraphrases. `sourceCode` is the jurisdiction's own code verbatim and
 * `statement` is the authority's own wording, because a compiler that rewrites its
 * source has stopped being a compiler.
 */

export interface CurriculumCatalogue {
  /** Snapshot these standards were read from. */
  readonly sourceId: string;
  /** Every content description for the level, in the authority's own order. */
  readonly standards: readonly StandardNode[];
  /** Achievement standard segments, verbatim. Backward design starts here. */
  readonly achievementStandard: readonly string[];
  /** Non-mandatory illustrations for one content description, verbatim. */
  elaborations(sourceCode: string): readonly string[];
  /** Standards for a requested id list, in request order. Unknown ids are dropped. */
  resolve(standardIds: readonly string[]): StandardNode[];
}

function toStandardNode(record: AcaraRecord, sourceId: string): StandardNode {
  return {
    standardId: standardIdForCode(record.code),
    // The authority's code, never renumbered. This is what a teacher searches for.
    sourceCode: record.code,
    statement: record.statement,
    evidence: [
      {
        sourceId,
        // The whole statement is the span, so a span match is a real check rather
        // than a token that would match almost any curriculum page.
        quotedSpan: record.statement,
        locator: record.code,
        retrievalLanguage: "en",
      },
    ],
  };
}

/**
 * Builds a catalogue from a snapshot id. Returns undefined when the snapshot is not
 * in the store or carries no content descriptions, which the caller must treat as a
 * refusal rather than a reason to invent standards.
 */
export function catalogueFromSnapshot(sourceId: string): CurriculumCatalogue | undefined {
  const stored = findSnapshot(sourceId);
  if (!stored) return undefined;

  const records = parseAcaraRecords(stored.body);
  const descriptions = contentDescriptions(records);
  if (descriptions.length === 0) return undefined;

  const standards = descriptions.map((record) => toStandardNode(record, sourceId));
  const byId = new Map(standards.map((standard) => [standard.standardId, standard]));

  return {
    sourceId,
    standards,
    achievementStandard: achievementStandard(records).map((record) => record.statement),
    elaborations: (sourceCode) =>
      elaborationsFor(records, sourceCode).map((record) => record.statement),
    resolve: (standardIds) =>
      standardIds
        .map((id) => byId.get(id))
        .filter((standard): standard is StandardNode => standard !== undefined),
  };
}

/**
 * Assembles the run's source manifest from the snapshot store.
 *
 * Every id must resolve. A missing snapshot throws, because a manifest that quietly
 * omits a source would let downstream evidence point at a source the run never read.
 */
export function buildSourceManifest(sourceIds: readonly string[]): SourceManifestType {
  const sources = sourceIds.map((sourceId) => {
    const stored = findSnapshot(sourceId);
    if (!stored) {
      throw new Error(`no snapshot for ${sourceId}; run "npm run snapshot" before compiling`);
    }
    return stored.snapshot;
  });
  return SourceManifest.parse({ schemaVersion: "0.1.0", sources });
}

/**
 * Whether an adapter can actually compile the standards a request asks for.
 *
 * An adapter that resolves a stage ladder but has no fetched curriculum behind it is
 * a registered jurisdiction, not a supported one. Without this check the pipeline
 * would fall through to a generic map and emit invented standards under an official
 * jurisdiction's name, which is precisely the fake bundle this system exists to
 * refuse. Support requires that jurisdiction's own snapshot and its own gate report.
 */
export interface CurriculumReadiness {
  ok: boolean;
  /** Requested ids with no fetched standard behind them. */
  unresolved: string[];
  reason: string;
}

export function curriculumReadiness(input: {
  catalogueSourceId?: string;
  authorityName: string;
  standardIds: readonly string[];
}): CurriculumReadiness {
  if (!input.catalogueSourceId) {
    return {
      ok: false,
      unresolved: [...input.standardIds],
      reason: `No curriculum snapshot has been fetched for ${input.authorityName}. The adapter resolves the stage ladder, which is not the same as supporting the jurisdiction.`,
    };
  }
  const catalogue = catalogueFromSnapshot(input.catalogueSourceId);
  if (!catalogue) {
    return {
      ok: false,
      unresolved: [...input.standardIds],
      reason: `Snapshot ${input.catalogueSourceId} is registered but carries no content descriptions.`,
    };
  }
  const known = new Set(catalogue.standards.map((standard) => standard.standardId));
  const unresolved = input.standardIds.filter((id) => !known.has(id));
  return {
    ok: unresolved.length === 0,
    unresolved,
    reason:
      unresolved.length === 0
        ? `${input.standardIds.length} requested standards all resolve in the fetched snapshot.`
        : `${unresolved.length} requested standards have no fetched content description: ${unresolved.join(", ")}.`,
  };
}

/**
 * Every snapshot the compiler holds. Used for a run that never resolved an adapter:
 * the manifest then describes what was available rather than what was read, which is
 * the honest record for a refusal. Observing is always allowed; compiling is not.
 */
export function allSnapshotsManifest(): SourceManifestType {
  return SourceManifest.parse({
    schemaVersion: "0.1.0",
    sources: allSnapshots().map((stored) => stored.snapshot),
  });
}

/**
 * Verifies one evidence reference against the snapshot it names. Returns false for
 * an unknown source, which is the same answer as an unmatched span: the claim is not
 * supported by anything this run actually read.
 */
export function evidenceIsSupported(reference: {
  sourceId: string;
  quotedSpan: string;
}): boolean {
  const stored = findSnapshot(reference.sourceId);
  if (!stored) return false;
  return spanMatches(stored.body, reference.quotedSpan);
}
