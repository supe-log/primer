import type { SourceLicence } from "@contracts";
import { normalizeForSpanMatch } from "../sources/snapshotStore";

/**
 * Licence posture is decided here, never by a model. The researcher may quote a
 * sentence from a terms page; this table decides what that sentence earns.
 *
 * Unknown is cite-only and may not be redistributed. That is the closed default:
 * a missing match is not a permission.
 */

const UNKNOWN_LICENCE: SourceLicence = {
  licenceId: "unknown",
  posture: "unknown",
  mayQuote: false,
  mayRedistribute: false,
  attributionText: "Licence not verified. Citation and link only; no redistribution.",
  excludedMaterial: ["full source text"],
};

export function unknownLicence(publisher: string): SourceLicence {
  return {
    ...UNKNOWN_LICENCE,
    attributionText: `${publisher}. Licence not verified. Citation and link only; no redistribution.`,
  };
}

/**
 * True when the quote occurs in the fetched licence page. Whitespace is the only
 * latitude, matching the snapshot span rule.
 */
export function licenceQuoteAppears(pageText: string, quote: string): boolean {
  const span = normalizeForSpanMatch(quote);
  if (span.length < 12) return false;
  return normalizeForSpanMatch(pageText).includes(span);
}

export function classifyLicence(input: {
  pageText: string;
  quote: string;
  publisher: string;
}): SourceLicence {
  if (!licenceQuoteAppears(input.pageText, input.quote)) {
    return unknownLicence(input.publisher);
  }

  const haystack = normalizeForSpanMatch(`${input.pageText} ${input.quote}`).toLowerCase();

  if (
    haystack.includes("creative commons attribution 4.0") ||
    haystack.includes("cc by 4.0") ||
    haystack.includes("creativecommons.org/licenses/by/4.0")
  ) {
    return {
      licenceId: "cc-by-4.0",
      posture: "redistributable",
      mayQuote: true,
      mayRedistribute: true,
      attributionText: `${input.publisher}, licensed CC BY 4.0.`,
      excludedMaterial: ["logos and other trade marks", "website design and layout"],
    };
  }

  if (
    haystack.includes("work of the united states government") ||
    haystack.includes("u.s. government work")
  ) {
    return {
      licenceId: "us-gov-work-not-verified",
      posture: "cite_only",
      mayQuote: true,
      mayRedistribute: false,
      attributionText: `${input.publisher}. U.S. government work; redistribution rights not verified here.`,
      excludedMaterial: ["full text of any publisher-held manuscript"],
    };
  }

  return unknownLicence(input.publisher);
}
