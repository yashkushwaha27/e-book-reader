import { extractGoogleDriveFileId } from "../lib/drive";

const GUTENBERG_ORIGIN = "https://www.gutenberg.org";

export type BookEntry = {
  /** Stable id for URLs (slug). */
  id: string;
  /** Display name — this is the primary human-facing key. */
  title: string;
  description: string;
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
    id: "crime-punishment-gutenberg",
    title: "Crime and Punishment by Fyodor Dostoyevsky",
    description: `"Crime and Punishment" by Fyodor Dostoevsky is a novel published in 1866. It follows Rodion Raskolnikov, an impoverished former law student in Saint Petersburg who plans to murder an unscrupulous pawnbroker. He convinces himself that certain crimes are justifiable if committed by "extraordinary" men pursuing higher goals. Once the deed is done, however, he is consumed by confusion, paranoia, and guilt as his theoretical justifications crumble and he faces the internal and external consequences of his actions. (This is an automatically generated summary.)`,
    htmlUrl: "https://www.gutenberg.org/cache/epub/2554/pg2554-images.html",
  },
  {
    id: 'the-green-mummy',
    title: "The Green Mummy by Fergus Hume",
    description: `The Green Mummy" by Fergus Hume is a novel likely written during the late 19th century. The story revolves around a young couple, Archie Hope and Lucy Kendal, as they navigate romance against a backdrop filled with mystery and intrigue, particularly centering on a rare mummy that Lucy's archaeologist stepfather, Professor Braddock, is eager to acquire. At the start of the novel, readers are introduced to Archie and Lucy, who share a playful yet serious conversation about their engagement. Archie reveals the lengths he has gone to in order to gain Professor Braddock’s consent to marry Lucy, involving the purchase of a valuable Peruvian mummy from Malta. Their lighthearted banter is soon overshadowed by more foreboding concerns regarding the mysterious mummy, as Lucy expresses unease about her stepfather's obsession with archaeology. The opening establishes a combination of romantic elements and hints at darker, unforeseen complications, setting the stage for a larger mystery involving the disappearance of the mummy and the tragic fate of Braddock’s assistant, which subsequently unfolds. (This is an automatically generated summary.)`,
    htmlUrl: 'https://www.gutenberg.org/cache/epub/2868/pg2868-images.html'
  },
  {
    id: 'the-strange-case-of-dr-jekyll-and-mr-hyde',
    title: 'The strange case of Dr. Jekyll and Mr. Hyde by Robert Louis Stevenson',
    description: `"The Strange Case of Dr. Jekyll and Mr. Hyde" by Robert Louis Stevenson is a Gothic horror novella published in 1886. When London lawyer Gabriel John Utterson investigates strange occurrences involving his old friend Dr. Henry Jekyll and a murderous criminal named Edward Hyde, he uncovers a disturbing mystery. This defining work of Gothic horror explores the duality of human nature and has profoundly influenced popular culture, making "Jekyll and Hyde" synonymous with hidden evil beneath respectable appearances. (This is an automatically generated summary.)`,
    htmlUrl: 'https://www.gutenberg.org/cache/epub/43/pg43-images.html'
  }
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
