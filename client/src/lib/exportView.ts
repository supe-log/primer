import type { PublicExportBundle, PublicSourceCitation } from "./views";

/**
 * Cite-only defence for the export panel. The server already strips snapshot
 * bodies; the UI still refuses to render a quote when the source is cite-only
 * or unknown, so a leaked field cannot reach the projector.
 */

export interface CitationRow {
  citation: PublicSourceCitation;
  citeOnly: boolean;
  /** Present only when redistribution is permitted. Never a cite-only body. */
  quote?: string;
}

export function citationRows(exported: PublicExportBundle): CitationRow[] {
  const citeOnly = new Set(exported.licence.citeOnlySourceIds);
  return exported.citations.map((citation) => {
    const blocked = citeOnly.has(citation.sourceId) || citation.posture !== "redistributable";
    return {
      citation,
      citeOnly: blocked,
      quote: blocked ? undefined : citation.quotedText,
    };
  });
}

export function exportShowsCiteOnlyBody(exported: PublicExportBundle): boolean {
  return citationRows(exported).some((row) => row.citeOnly && row.quote !== undefined);
}
