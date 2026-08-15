import { z } from "zod";
import {
  IsoDateTime,
  LicencePosture,
  Sha256,
  SourceId,
  schemaVersionField,
} from "./primitives";

/**
 * Source provenance and licence policy.
 *
 * Invariants:
 *  - Every EvidenceReference points at a sourceId present in the run's SourceManifest.
 *  - A source with posture "cite_only" may be quoted internally but its text is never
 *    reproduced in an export. A source with posture "unknown" caps the run at
 *    investigate/prototype and blocks redistribution.
 *  - contentSha256 is the digest of the fetched bytes. Prototype fixtures use
 *    SAMPLE_DIGEST and set `fetched: false` so nobody mistakes them for real snapshots.
 */

export const SourceLicence = z.object({
  licenceId: z.string().min(1),
  posture: LicencePosture,
  mayQuote: z.boolean(),
  mayRedistribute: z.boolean(),
  attributionText: z.string().min(1),
  excludedMaterial: z.array(z.string().min(1)).default([]),
});
export type SourceLicence = z.infer<typeof SourceLicence>;

export const SourceSnapshot = z.object({
  sourceId: SourceId,
  title: z.string().min(1),
  publisher: z.string().min(1),
  url: z.string().url(),
  retrievedAt: IsoDateTime,
  contentSha256: Sha256,
  /** false means this is a hand-written prototype sample, not a fetched snapshot. */
  fetched: z.boolean(),
  licence: SourceLicence,
});
export type SourceSnapshot = z.infer<typeof SourceSnapshot>;

export const SourceManifest = z.object({
  schemaVersion: schemaVersionField,
  sources: z.array(SourceSnapshot).min(1),
});
export type SourceManifest = z.infer<typeof SourceManifest>;

/**
 * A span-anchored citation. "supported" is only claimable when a validator can
 * match `quotedSpan` inside the named snapshot. When the span cannot be matched,
 * the claim is marked unsupported and removed rather than softened.
 */
export const EvidenceReference = z.object({
  sourceId: SourceId,
  /** Verbatim excerpt used for span matching. Kept short on cite_only sources. */
  quotedSpan: z.string().min(1),
  /** Optional locator inside the source, for example a content-description code. */
  locator: z.string().min(1).optional(),
  retrievalLanguage: z.string().min(2).default("en"),
});
export type EvidenceReference = z.infer<typeof EvidenceReference>;
