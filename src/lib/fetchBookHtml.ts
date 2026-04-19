import type { BookEntry } from "../data/books";
import { resolveBookFetchUrl } from "../data/books";

const GUTENBERG_PREFIX = "https://www.gutenberg.org/";

function isProdGutenberg(book: BookEntry): boolean {
  return import.meta.env.PROD && book.htmlUrl.startsWith(GUTENBERG_PREFIX);
}

/** Reject tiny error/JSON bodies from dead proxies. */
function looksLikeBookHtml(html: string): boolean {
  if (html.length < 500) return false;
  const t = html.trimStart();
  if (t.startsWith("{")) return false;
  const head = t.slice(0, 250).toLowerCase();
  return head.includes("<!doctype") || head.includes("<html");
}

function gutenbergProxyUrls(canonical: string): string[] {
  const list: string[] = [];
  const custom = import.meta.env.VITE_GUTENBERG_PROXY_PREFIX?.trim();
  if (custom) list.push(`${custom}${encodeURIComponent(canonical)}`);
  list.push(
    `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(canonical)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(canonical)}`,
  );
  return list;
}

/**
 * Load book HTML in the browser. Production Gutenberg URLs use a fallback chain of
 * public CORS proxies (Codetabs first); set `VITE_GUTENBERG_PROXY_PREFIX` to prefer your own.
 */
export async function fetchBookHtmlText(book: BookEntry): Promise<string> {
  if (!isProdGutenberg(book)) {
    const res = await fetch(resolveBookFetchUrl(book));
    if (!res.ok) {
      throw new Error(`Could not download HTML (HTTP ${res.status}).`);
    }
    return res.text();
  }

  const canonical = book.htmlUrl;
  let lastErr: Error | null = null;

  for (const url of gutenbergProxyUrls(canonical)) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        lastErr = new Error(`Could not download HTML (HTTP ${res.status}).`);
        continue;
      }
      const text = await res.text();
      if (!looksLikeBookHtml(text)) {
        lastErr = new Error("Book proxy returned an empty or invalid response.");
        continue;
      }
      return text;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  throw (
    lastErr ??
    new Error(
      "Could not load this Gutenberg title from any CORS proxy. Host your own proxy (see VITE_GUTENBERG_PROXY_PREFIX) or mirror the HTML.",
    )
  );
}
