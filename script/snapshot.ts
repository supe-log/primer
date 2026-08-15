import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceLicence } from "@contracts";
import {
  ACARA_LICENCE,
  ACARA_ORIGIN,
  contentDescriptions,
  fetchAcaraSubject,
  IES_LICENCE,
  parseAcaraRecords,
} from "../server/compiler/sources/acara";

/**
 * Snapshot refresh. Run by a human, never by a compile:
 *
 *   npm run snapshot
 *
 * Fetches each registered source live, hashes the exact bytes with SHA-256, and
 * writes `snapshots/<slug>.json` holding the provenance record and the bytes it
 * describes. Those files are committed, so a compile does no network I/O and every
 * digest in a run manifest is checkable against a file in the repository.
 *
 * This script fails loudly. A half-written snapshot would let the compiler cite
 * content descriptions that were never fetched, which is the one thing this whole
 * system exists to prevent.
 */

const SNAPSHOT_DIR = path.resolve(import.meta.dirname, "..", "snapshots");

function sha256(bytes: string): string {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

async function writeSnapshot(input: {
  slug: string;
  sourceId: string;
  title: string;
  publisher: string;
  url: string;
  bytes: string;
  licence: SourceLicence;
  retrievedAt: string;
}): Promise<void> {
  const record = {
    snapshot: {
      sourceId: input.sourceId,
      title: input.title,
      publisher: input.publisher,
      url: input.url,
      retrievedAt: input.retrievedAt,
      contentSha256: sha256(input.bytes),
      fetched: true,
      licence: input.licence,
    },
    body: input.bytes,
  };
  const file = path.join(SNAPSHOT_DIR, `${input.slug}.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  console.log(
    `  wrote ${input.slug}.json  sha256=${record.snapshot.contentSha256.slice(0, 16)}…  ${input.bytes.length} bytes`,
  );
}

/**
 * Deterministic text extraction from an HTML page.
 *
 * The snapshot body for an HTML source is this extraction, not the raw markup, and
 * the digest covers the extraction. That is the honest description of what the
 * compiler actually reads: a span-match validator has to compare a quoted claim
 * against prose, and prose interrupted by tags is not prose. The function is pure,
 * so anyone can re-derive the same bytes from the same page.
 */
function extractText(markup: string): string {
  const withoutCode = markup
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withoutTags = withoutCode.replace(/<[^>]+>/g, " ");
  const decoded = withoutTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "’")
    .replace(/&lsquo;/g, "‘")
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”");
  return `${decoded.replace(/\s+/g, " ").trim()}\n`;
}

async function fetchExtractedText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { accept: "text/html,application/json" } });
  if (!response.ok) {
    throw new Error(`fetch failed with HTTP ${response.status} for ${url}`);
  }
  return extractText(await response.text());
}

async function main(): Promise<void> {
  await mkdir(SNAPSHOT_DIR, { recursive: true });
  const retrievedAt = new Date().toISOString();
  console.log(`snapshotting sources at ${retrievedAt}`);

  console.log("ACARA V9, Year 7 Mathematics…");
  const subject = await fetchAcaraSubject({ levelCode: "MATMATY7" });
  const records = parseAcaraRecords(subject.bytes);
  const descriptions = contentDescriptions(records);
  if (descriptions.length === 0) {
    throw new Error("ACARA returned no content descriptions; refusing to write an empty snapshot");
  }
  console.log(
    `  ${records.length} records, ${descriptions.length} content descriptions, ${subject.pageUrls.length} page(s)`,
  );
  await writeSnapshot({
    slug: "acara-v9-mathematics-year-7",
    sourceId: "src:acara.v9.mathematics.year-7",
    title: "Australian Curriculum V9.0, Mathematics, Year 7: content descriptions, elaborations and achievement standard",
    publisher: "Australian Curriculum, Assessment and Reporting Authority",
    url: `${ACARA_ORIGIN}/f-10-curriculum/learning-areas/mathematics/year-7`,
    bytes: subject.bytes,
    licence: ACARA_LICENCE,
    retrievedAt,
  });

  console.log("ACARA copyright and terms of use…");
  const termsUrl = "https://www.australiancurriculum.edu.au/copyright-and-terms-of-use";
  await writeSnapshot({
    slug: "acara-v9-terms",
    sourceId: "src:acara.v9.terms",
    title: "Australian Curriculum: copyright and terms of use (text extraction)",
    publisher: "Australian Curriculum, Assessment and Reporting Authority",
    url: termsUrl,
    bytes: await fetchExtractedText(termsUrl),
    licence: ACARA_LICENCE,
    retrievedAt,
  });

  // A second licence posture, on purpose. The pedagogical evidence behind a
  // sequencing decision is cite-only: Primer may quote it internally and must link
  // and attribute it, and the export never reproduces its text. Without a cite-only
  // source in the manifest the licence gate would be untested arithmetic.
  console.log("IES interleaved mathematics practice efficacy study…");
  const iesUrl = "https://ies.ed.gov/use-work/awards/efficacy-study-interleaved-mathematics-practice";
  await writeSnapshot({
    slug: "ies-interleaving-rct",
    sourceId: "src:ies.interleaving-rct",
    title: "An Efficacy Study of Interleaved Mathematics Practice, award R305A160263 (text extraction)",
    publisher: "Institute of Education Sciences, U.S. Department of Education",
    url: iesUrl,
    bytes: await fetchExtractedText(iesUrl),
    licence: IES_LICENCE,
    retrievedAt,
  });

  console.log("done. Commit snapshots/ so the compile stays reproducible offline.");
}

main().catch((error) => {
  console.error("snapshot failed:", error);
  process.exit(1);
});
