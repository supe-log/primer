import type {
  GateCheck,
  LicencePosture,
  SourceManifest,
  SourceSnapshot,
} from "@contracts";

/**
 * Licence policy, enforced in code at export time. A prompt cannot override this.
 *
 * Outcomes:
 *  - redistributable + mayRedistribute: citation, link, and quoted text may leave the box
 *  - cite_only: citation, link and attribution only. Source text never appears in an export
 *  - unknown: treated as cite_only and the run is capped (blocking fail)
 *
 * A cite_only record that claims mayRedistribute is a data error, not a permission.
 * The gate fails closed and blocks redistribution.
 */

export function mayRedistributeSource(source: SourceSnapshot): boolean {
  if (source.licence.posture !== "redistributable") return false;
  return source.licence.mayRedistribute;
}

export function mayQuoteSource(source: SourceSnapshot): boolean {
  if (source.licence.posture === "unknown") return false;
  return source.licence.mayQuote;
}

export interface PublicSourceCitation {
  sourceId: string;
  title: string;
  url: string;
  publisher: string;
  attributionText: string;
  posture: LicencePosture;
  /** Present only when redistribution is permitted. Never the cite-only body. */
  quotedText?: string;
}

/**
 * The public export of a source list. Cite-only and unknown sources become a
 * citation and a link. Their snapshot text is not copied into the export.
 */
export function exportSourceCitations(
  manifest: SourceManifest,
  quotedBySourceId: Record<string, string> = {},
): PublicSourceCitation[] {
  return manifest.sources.map((source) => {
    const citation: PublicSourceCitation = {
      sourceId: source.sourceId,
      title: source.title,
      url: source.url,
      publisher: source.publisher,
      attributionText: source.licence.attributionText,
      posture: source.licence.posture,
    };
    if (mayRedistributeSource(source) && quotedBySourceId[source.sourceId]) {
      citation.quotedText = quotedBySourceId[source.sourceId];
    }
    return citation;
  });
}

export function evaluateLicenceGate(manifest: SourceManifest): GateCheck[] {
  const citeOnly = manifest.sources.filter((source) => source.licence.posture === "cite_only");
  const unknown = manifest.sources.filter((source) => source.licence.posture === "unknown");
  const leaking = citeOnly.filter((source) => source.licence.mayRedistribute);
  const blocked = manifest.sources.filter((source) => !mayRedistributeSource(source));

  return [
    {
      checkId: "check:source.cite-only-no-redistribute",
      label: "Cite-only sources cannot be redistributed",
      kind: "deterministic",
      blocking: true,
      status: leaking.length === 0 ? "pass" : "fail",
      detail:
        leaking.length === 0
          ? `${citeOnly.length} cite-only sources. Redistribution is blocked in code; an export may carry a citation and a link only.`
          : `${leaking.length} cite-only sources incorrectly allow redistribution: ${leaking
              .map((source) => source.sourceId)
              .join(", ")}. Blocked.`,
      counts: {
        citeOnly: citeOnly.length,
        leaking: leaking.length,
        blocked: blocked.length,
      },
    },
    {
      checkId: "check:source.unknown-blocks-redistribution",
      label: "Unknown licences cap the run and block redistribution",
      kind: "deterministic",
      blocking: true,
      status: unknown.length === 0 ? "pass" : "fail",
      detail:
        unknown.length === 0
          ? "No source has an unknown licence."
          : `${unknown.length} sources have an unknown licence, which caps this run and blocks redistribution: ${unknown
              .map((source) => source.sourceId)
              .join(", ")}.`,
      counts: { unknown: unknown.length },
    },
  ];
}

/**
 * Walk a JSON-like export and replace any verbatim cite-only snapshot body with
 * an attribution stub. Used as the last line of defence before a bundle leaves
 * the compiler. Matching is exact-substring on the stored body, not fuzzy.
 */
export function stripCiteOnlyBodies(
  payload: unknown,
  protectedBodies: Record<string, string>,
): unknown {
  const needles = Object.entries(protectedBodies).filter(([, body]) => body.trim().length > 0);
  const redact = (value: string): string => {
    let next = value;
    for (const [sourceId, body] of needles) {
      if (next.includes(body)) {
        next = next.split(body).join(`[cite only: ${sourceId}]`);
      }
    }
    return next;
  };

  const walk = (value: unknown): unknown => {
    if (typeof value === "string") return redact(value);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, child]) => [key, walk(child)]),
      );
    }
    return value;
  };

  return walk(payload);
}

export function exportLeaksCiteOnlyBody(
  exported: unknown,
  protectedBodies: Record<string, string>,
): string[] {
  const serialized = JSON.stringify(exported);
  return Object.entries(protectedBodies)
    .filter(([, body]) => body.trim().length > 0 && serialized.includes(body))
    .map(([sourceId]) => sourceId);
}
