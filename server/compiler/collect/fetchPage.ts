import { extractText } from "./extractText";

const MAX_BYTES = 1_500_000;
const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * HTTPS fetch with a size cap, a timeout, and a private-address block.
 * Returns extracted prose so the digest covers what the compiler will read.
 */
export async function fetchExtractedPage(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<{ url: string; body: string }> {
  const parsed = parsePublicHttpsUrl(url);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetchImpl(parsed.href, {
      headers: { accept: "text/html,application/json,text/plain" },
      signal: abort.signal,
      redirect: "follow",
    });
    if (!response.ok) {
      throw new Error(`fetch failed with HTTP ${response.status} for ${parsed.href}`);
    }
    const raw = await response.text();
    if (raw.length > MAX_BYTES) {
      throw new Error(`fetch exceeded ${MAX_BYTES} bytes for ${parsed.href}`);
    }
    const body = looksLikeHtml(raw) ? extractText(raw) : `${raw.replace(/\s+/g, " ").trim()}\n`;
    if (body.trim().length < 40) {
      throw new Error(`fetched body is too thin to be a curriculum page: ${parsed.href}`);
    }
    return { url: parsed.href, body };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`fetch timed out after ${timeoutMs}ms for ${parsed.href}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export function parsePublicHttpsUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`not a URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`only https URLs may be collected: ${url}`);
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error(`refusing to fetch a private or local host: ${parsed.hostname}`);
  }
  return parsed;
}

function looksLikeHtml(raw: string): boolean {
  const head = raw.slice(0, 200).toLowerCase();
  return head.includes("<html") || head.includes("<!doctype") || head.includes("<body");
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "0.0.0.0" || host === "::1" || host === "127.0.0.1") return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (/^169\.254\./.test(host)) return true;
  return false;
}
