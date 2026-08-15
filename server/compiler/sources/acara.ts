import type { SourceLicence } from "@contracts";

/**
 * ACARA V9 source adapter: how Primer acquires the Australian Curriculum.
 *
 * The V9 site is a single-page app backed by a public search endpoint that returns
 * curriculum records as JSON. Fetching that endpoint gives the content descriptions
 * verbatim with their official codes, which is exactly what a compiler needs and
 * exactly what scraping rendered HTML would put at risk.
 *
 * Two halves, deliberately separated:
 *  - `fetchAcaraSubject` does network I/O. Only `script/snapshot.ts` calls it.
 *  - `parseAcaraRecords` is pure over bytes. The compiler calls it on snapshot bytes,
 *    so what the compiler reads is exactly what was hashed.
 */

export const ACARA_ORIGIN = "https://v9.australiancurriculum.edu.au";
export const ACARA_QUERY_PATH = "/conf/acara/search/api/query.json";

/**
 * Quoted from the authority's own terms page. The exclusions are named because a
 * blanket "CC BY 4.0" claim over an ACARA page would be wrong: logos, site design,
 * third-party material and the literacy progressions are carved out.
 */
export const ACARA_LICENCE: SourceLicence = {
  licenceId: "cc-by-4.0",
  posture: "redistributable",
  mayQuote: true,
  mayRedistribute: true,
  attributionText:
    "Australian Curriculum, Assessment and Reporting Authority (ACARA), Australian Curriculum Version 9.0, licensed CC BY 4.0.",
  excludedMaterial: [
    "ACARA logos and other trade marks",
    "website design and layout",
    "third-party material identified as such",
    "National Literacy and Numeracy Learning Progressions",
  ],
};

/**
 * Licence posture for the pedagogical evidence sources. Cite-only is not a
 * formality: it is the difference between a bundle that may carry the words and one
 * that may carry only the citation, the link and the attribution, and the export
 * path enforces that difference in code rather than in a prompt.
 */
export const IES_LICENCE: SourceLicence = {
  licenceId: "us-gov-work-not-verified",
  posture: "cite_only",
  mayQuote: true,
  mayRedistribute: false,
  attributionText:
    "Institute of Education Sciences, U.S. Department of Education. Redistribution rights not verified for this page.",
  excludedMaterial: ["full text of the funded study and any publisher-held manuscript"],
};

/**
 * Record types the endpoint returns. Only these four carry curriculum text worth
 * compiling; the rest of the taxonomy is navigation.
 */
export type AcaraDocumentType =
  /** Content description: the assessable statement, and the unit a standard maps to. */
  | "CD"
  /** Elaboration: a non-mandatory illustration of a content description. */
  | "EL"
  /** Achievement standard segment: what a student can do by the end of the year. */
  | "SAS"
  /** Level description. */
  | "LA";

export interface AcaraRecord {
  /** The jurisdiction's own code, verbatim. Never renumbered. */
  code: string;
  documentType: AcaraDocumentType;
  /** The curriculum text, verbatim from the authority. */
  statement: string;
  /** Canonical page for this record on the authority's site. */
  url: string;
  yearLevel: string;
  learningArea: string;
  /** For an elaboration, the content description it elaborates. */
  elaborates?: string;
}

/** Level codes the adapter knows how to fetch. `MATMATY7` is Year 7 Mathematics. */
export interface AcaraSubjectQuery {
  levelCode: string;
  /** Upper bound on records requested. The endpoint caps a page; the caller paginates. */
  limit?: number;
}

export function acaraQueryUrl(query: AcaraSubjectQuery, offset = 0): string {
  const params = new URLSearchParams({
    q: "*",
    start: String(offset),
    limit: String(query.limit ?? 200),
    fq: `lvl_code:${query.levelCode}`,
  });
  return `${ACARA_ORIGIN}${ACARA_QUERY_PATH}?${params.toString()}`;
}

interface RawAcaraResponse {
  count?: string | number;
  offset?: string | number;
  results?: unknown[];
}

/**
 * Fetches every record for one level code, paginating until the endpoint's reported
 * count is satisfied, and returns the exact bytes to hash alongside the pages that
 * produced them.
 *
 * Throws on a network or status failure. The caller is `script/snapshot.ts`, run by
 * a human ahead of a demo, so a loud failure there is correct: the alternative is a
 * silent half-snapshot that later cites content descriptions that were never fetched.
 */
export async function fetchAcaraSubject(
  query: AcaraSubjectQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<{ bytes: string; pageUrls: string[]; recordCount: number }> {
  const pageSize = query.limit ?? 200;
  const pages: unknown[] = [];
  const pageUrls: string[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  // Bounded at 20 pages. An endpoint that keeps reporting more is a bug, not a
  // reason to fetch forever.
  for (let page = 0; page < 20 && offset < total; page += 1) {
    const url = acaraQueryUrl(query, offset);
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`ACARA query failed with HTTP ${response.status} for ${url}`);
    }
    const payload = (await response.json()) as RawAcaraResponse;
    const results = Array.isArray(payload.results) ? payload.results : [];
    pages.push(payload);
    pageUrls.push(url);
    total = Number(payload.count ?? results.length);
    offset += results.length;
    if (results.length === 0) break;
    if (results.length < pageSize) break;
  }

  const envelope = {
    source: "acara-v9-query-api",
    levelCode: query.levelCode,
    pageUrls,
    pages,
  };
  // Stable key order and two-space indent, so the digest depends on the payload
  // rather than on how a JSON serializer felt that day.
  const bytes = `${JSON.stringify(envelope, null, 2)}\n`;
  return { bytes, pageUrls, recordCount: parseAcaraRecords(bytes).length };
}

function absoluteUrl(relative: unknown): string {
  if (typeof relative !== "string" || relative.length === 0) return `${ACARA_ORIGIN}/`;
  if (relative.startsWith("http")) return relative;
  return `${ACARA_ORIGIN}/${relative.replace(/^\/+/, "")}`;
}

const KNOWN_TYPES = new Set<AcaraDocumentType>(["CD", "EL", "SAS", "LA"]);

/**
 * Pure parse over snapshot bytes. Returns records in the authority's own order,
 * deduplicated by code, so the compiler's tie-breaking can honour source order.
 */
export function parseAcaraRecords(bytes: string): AcaraRecord[] {
  let envelope: { pages?: RawAcaraResponse[] };
  try {
    envelope = JSON.parse(bytes) as { pages?: RawAcaraResponse[] };
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const records: AcaraRecord[] = [];

  for (const page of envelope.pages ?? []) {
    for (const entry of page.results ?? []) {
      const row = entry as Record<string, unknown>;
      const code = typeof row.code === "string" ? row.code : "";
      const documentType = row.documentType as AcaraDocumentType;
      const statement = typeof row.title === "string" ? row.title : "";
      if (!code || !statement || !KNOWN_TYPES.has(documentType)) continue;
      if (seen.has(code)) continue;
      seen.add(code);
      records.push({
        code,
        documentType,
        statement,
        url: absoluteUrl(row.url),
        yearLevel: typeof row.lvl_title === "string" ? row.lvl_title : "",
        learningArea: typeof row.la_title === "string" ? row.la_title : "",
        elaborates: typeof row.cd_code === "string" ? row.cd_code : undefined,
      });
    }
  }
  return records;
}

/** Content descriptions only, in the authority's order. These become standards. */
export function contentDescriptions(records: AcaraRecord[]): AcaraRecord[] {
  return records.filter((record) => record.documentType === "CD");
}

/** Elaborations for one content description. Context for the mapper, never a standard. */
export function elaborationsFor(records: AcaraRecord[], code: string): AcaraRecord[] {
  return records.filter((record) => record.documentType === "EL" && record.elaborates === code);
}

/** Achievement standard segments for the level. Context for backward design. */
export function achievementStandard(records: AcaraRecord[]): AcaraRecord[] {
  return records.filter((record) => record.documentType === "SAS");
}

/**
 * Stable contract id for an ACARA code. Contract ids are lowercase slugs, and the
 * official code is preserved verbatim in `StandardNode.sourceCode`, never here.
 */
export function standardIdForCode(code: string): string {
  return `std:acara.v9.${code.toLowerCase()}`;
}

export function codeForStandardId(standardId: string): string {
  return standardId.replace(/^std:acara\.v9\./, "").toUpperCase();
}
