import { extractGoogleDriveFileId } from "../lib/drive";

const GUTENBERG_ORIGIN = "https://www.gutenberg.org";

export type BookEntry = {
  /** Stable id for URLs (slug). */
  id: string;
  /** Display name — this is the primary human-facing key. */
  title: string;
  description: string;
  tags: string[];
  /**
   * When `gdriveFileId` is omitted, this must be a fetchable HTML URL
   * (local `/books/...` or any CORS-friendly absolute URL).
   */
  htmlUrl: string;
  /**
   * Optional Google Drive file id (or a Drive URL — it will be parsed).
   * In dev, the app proxies `/api/gdrive-html?fileId=` so the browser can load HTML
   * without CORS errors. For production you still need a small server-side proxy or a
   * public HTML URL that sends permissive CORS headers.
   */
  gdriveFileId?: string;
};

/**
 * Central catalog: add titles here and point each to HTML (local path or absolute URL)
 * or to Google Drive via `gdriveFileId`.
 */
export const BOOK_CATALOG: BookEntry[] = [
  {
    id: "demo-tale",
    title: "A Quiet Demo",
    description: "Bundled sample with multiple sections so page-flip has room to shine.",
    tags: ["sample", "local"],
    htmlUrl: "/books/demo-tale.html",
  },
  {
    id: "marginalia-sketch",
    title: "Marginalia Sketch",
    description: "A shorter second title for search and shelf experiments.",
    tags: ["sample", "local"],
    htmlUrl: "/books/second-sketch.html",
  },
  {
    id: "crime-punishment-gutenberg",
    title: "Crime and Punishment (Project Gutenberg)",
    description:
      "Cached EPUB HTML from Project Gutenberg (#2554). In dev, the app proxies gutenberg.org so the fetch succeeds.",
    tags: ["gutenberg", "classic", "remote"],
    htmlUrl: "https://www.gutenberg.org/cache/epub/2554/pg2554-images.html",
  },
];

const byId = new Map(BOOK_CATALOG.map((b) => [b.id, b]));

/**
 * Same catalog as a plain title → HTML URL map (Drive-backed rows may use `htmlUrl`
 * as a fallback path while `gdriveFileId` supplies the real source).
 */
export const BOOK_HTML_BY_NAME: Record<string, string> = Object.fromEntries(
  BOOK_CATALOG.map((book) => [book.title, book.htmlUrl]),
);

export function getBookById(id: string | undefined): BookEntry | undefined {
  if (!id) return undefined;
  return byId.get(id);
}

function rewriteGutenbergUrlForDev(url: string): string {
  if (!import.meta.env.DEV) return url;
  if (url.startsWith(GUTENBERG_ORIGIN)) {
    return `/gutenberg-proxy${url.slice(GUTENBERG_ORIGIN.length)}`;
  }
  return url;
}

export function resolveBookFetchUrl(book: BookEntry): string {
  const rawDrive = book.gdriveFileId?.trim();
  if (rawDrive) {
    const fileId = extractGoogleDriveFileId(rawDrive) ?? rawDrive;
    if (import.meta.env.DEV) {
      return `/api/gdrive-html?fileId=${encodeURIComponent(fileId)}`;
    }
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
  }
  return rewriteGutenbergUrlForDev(book.htmlUrl);
}

export function bookNeedsDriveProxyNote(book: BookEntry): boolean {
  return Boolean(book.gdriveFileId?.trim()) && !import.meta.env.DEV;
}

/** Drive or Gutenberg (and similar) URLs need a dev-style proxy in production static hosts. */
export function bookNeedsRemoteFetchProxyNote(book: BookEntry): boolean {
  if (import.meta.env.DEV) return false;
  if (book.gdriveFileId?.trim()) return true;
  return book.htmlUrl.includes("www.gutenberg.org");
}
