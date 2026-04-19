export type PageFitOptions = {
  /** Full page face width in px (border-box, matches StPageFlip page element). */
  pageWidthPx: number;
  /** Full page face height in px. */
  pageHeightPx: number;
  /** Multiplier for base reader font (1 = default). Must match live `.book-page` scaling. */
  fontScale?: number;
};

export type HtmlToPagesAsyncOptions = {
  /** Call `scheduler.yield` / `setTimeout(0)` every N `fits` evaluations (0 = never). */
  yieldEvery?: number;
};

const BLOCK_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, blockquote, pre, ul, ol, table, hr";

function createPageDiv(innerHTML: string, _globalPageIndex: number): HTMLDivElement {
  const page = document.createElement("div");
  page.className = "book-page";
  page.innerHTML = innerHTML;
  return page;
}

function stripProjectGutenbergShell(body: HTMLElement) {
  body.querySelector("#pg-header")?.remove();
  body.querySelector("#pg-footer")?.remove();
}

/** Keep only outermost matching nodes (e.g. exclude `p` inside `blockquote`). */
function outermostBlocks(container: Element): Element[] {
  const all = Array.from(container.querySelectorAll(BLOCK_SELECTOR));
  return all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
}

function blocksFromChapters(body: HTMLElement): { blocks: Element[]; chapterBreakAt: Set<number> } {
  const chapters = body.querySelectorAll("div.chapter");
  if (chapters.length === 0) return { blocks: [], chapterBreakAt: new Set() };
  const out: Element[] = [];
  const chapterBreakAt = new Set<number>();
  chapters.forEach((chapter) => {
    if ((chapter.textContent?.trim().length ?? 0) < 20) return;
    const found = outermostBlocks(chapter);
    if (found.length === 0) return;
    if (out.length > 0) chapterBreakAt.add(out.length);
    out.push(...found);
  });
  return { blocks: out, chapterBreakAt };
}

function blocksFromSections(body: HTMLElement): { blocks: Element[]; chapterBreakAt: Set<number> } {
  const sections = body.querySelectorAll(":scope > section");
  if (sections.length === 0) return { blocks: [], chapterBreakAt: new Set() };
  const out: Element[] = [];
  const chapterBreakAt = new Set<number>();
  sections.forEach((section) => {
    const inner = section.innerHTML.trim();
    if (!inner) return;
    const wrap = document.createElement("div");
    wrap.innerHTML = inner;
    const found = outermostBlocks(wrap);
    const batch = found.length > 0 ? found : Array.from(wrap.children);
    if (batch.length === 0) return;
    if (out.length > 0) chapterBreakAt.add(out.length);
    out.push(...batch);
  });
  return { blocks: out, chapterBreakAt };
}

function blocksFromBody(body: HTMLElement): Element[] {
  const wrap = document.createElement("div");
  wrap.innerHTML = body.innerHTML;
  const found = outermostBlocks(wrap);
  if (found.length > 0) return found;
  return Array.from(wrap.querySelectorAll(BLOCK_SELECTOR));
}

function createMeasurer(fit: PageFitOptions): { fits: (html: string) => boolean; cleanup: () => void } {
  const host = document.createElement("div");
  host.className = "reader-measure-host reader-shell";
  host.style.setProperty("--reader-font-scale", String(fit.fontScale ?? 1));
  const page = document.createElement("div");
  page.className = "book-page";
  page.style.boxSizing = "border-box";
  page.style.width = `${fit.pageWidthPx}px`;
  page.style.height = `${fit.pageHeightPx}px`;
  page.style.overflow = "hidden";
  host.appendChild(page);
  document.body.appendChild(host);

  const fits = (html: string) => {
    page.innerHTML = html;
    return page.scrollHeight <= page.clientHeight + 2;
  };

  return {
    fits,
    cleanup: () => {
      host.remove();
    },
  };
}

function cooperativeYield(): Promise<void> {
  const sched = (globalThis as unknown as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sched?.yield) return sched.yield();
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function wrapFitsWithYields(
  syncFits: (html: string) => boolean,
  yieldEvery: number,
): (html: string) => Promise<boolean> {
  if (yieldEvery <= 0) {
    return async (html: string) => syncFits(html);
  }
  let n = 0;
  return async (html: string) => {
    n += 1;
    if (n % yieldEvery === 0) {
      await cooperativeYield();
    }
    return syncFits(html);
  };
}

/** Tokens: word + following spaces, or whitespace run (for odd markup). */
function tokenizeWithWhitespace(s: string): string[] {
  return s.match(/\S+\s*|\s+/g) ?? [];
}

/**
 * Split plain-text (or inline HTML) into tag-wrapped chunks that each fit the page.
 * Uses word-aligned prefixes with binary search over token counts, with a char fallback
 * for tokens longer than one line.
 */
async function splitTextIntoWrappers(
  text: string,
  fits: (html: string) => Promise<boolean>,
  tag: string,
): Promise<string[]> {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const pieces: string[] = [];
  let rest = text.trim();
  if (!rest.length) return pieces;

  while (rest.length > 0) {
    const tokens = tokenizeWithWhitespace(rest);
    if (tokens.length === 0) break;

    let lo = 1;
    let hi = tokens.length;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const chunk = tokens.slice(0, mid).join("");
      if (await fits(`${open}${chunk}${close}`)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (best === 0) {
      const firstTok = tokens[0];
      const wordMatch = firstTok.match(/^(\S+)(\s*)$/);
      const word = wordMatch ? wordMatch[1] : firstTok.trim();
      const spAfter = wordMatch ? wordMatch[2] : "";

      if (!word.length) {
        rest = rest.slice(firstTok.length).trimStart();
        continue;
      }

      let loC = 1;
      let hiC = word.length;
      let bestC = 1;
      while (loC <= hiC) {
        const mid = (loC + hiC) >> 1;
        if (await fits(`${open}${word.slice(0, mid)}${close}`)) {
          bestC = mid;
          loC = mid + 1;
        } else {
          hiC = mid - 1;
        }
      }

      pieces.push(`${open}${word.slice(0, bestC)}${close}`);
      rest = (word.slice(bestC) + spAfter + rest.slice(firstTok.length)).trimStart();
      continue;
    }

    const chunk = tokens.slice(0, best).join("");
    pieces.push(`${open}${chunk}${close}`);
    rest = rest.slice(chunk.length).trimStart();
  }

  return pieces;
}

/** Parse a single root element wrapper without DOMParser when structure is simple. */
function parseSingleTagWrapper(html: string): { tag: string; inner: string } | null {
  const m = html.match(/^<([a-zA-Z][\w:-]*)[^>]*>([\s\S]*)<\/\1>\s*$/);
  if (!m) return null;
  return { tag: m[1].toLowerCase(), inner: m[2] };
}

/** Typical Gutenberg / novel headings — start on a fresh page when possible. */
function isChapterHeading(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (!/^h[1-6]$/.test(tag)) return false;
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ");
  if (!text) return false;
  if (/^chapter\b/i.test(text)) return true;
  if (/^part\b/i.test(text)) return true;
  if (/^book\b/i.test(text)) return true;
  return false;
}

async function splitBlockToFitPieces(
  outerHtml: string,
  fits: (html: string) => Promise<boolean>,
): Promise<string[]> {
  let parsed = parseSingleTagWrapper(outerHtml.trim());
  if (!parsed) {
    const wrapped = `<div id="split-root">${outerHtml}</div>`;
    const doc = new DOMParser().parseFromString(wrapped, "text/html");
    const el = doc.getElementById("split-root")?.firstElementChild;
    if (el) {
      parsed = { tag: el.tagName.toLowerCase(), inner: el.innerHTML };
    }
  }
  if (!parsed) {
    return (await fits(outerHtml)) ? [outerHtml] : [`<p>${outerHtml}</p>`];
  }

  if (await fits(outerHtml)) return [outerHtml];

  const { tag, inner } = parsed;

  if (tag === "pre") {
    return splitTextIntoWrappers(inner, fits, "pre");
  }

  if (tag === "p" || tag === "blockquote" || tag === "li") {
    return splitTextIntoWrappers(inner, fits, tag);
  }

  if (tag.startsWith("h") && tag.length === 2) {
    return splitTextIntoWrappers(inner, fits, tag);
  }

  const text = inner.replace(/<[^>]+>/g, "").trim();
  if (text.length) {
    return splitTextIntoWrappers(text, fits, "p");
  }

  return [outerHtml];
}

async function paginateBlocks(
  blocks: Element[],
  fits: (html: string) => Promise<boolean>,
  chapterBreakAt: Set<number>,
  yieldEvery: number,
): Promise<string[]> {
  const pages: string[] = [];
  let bucket: string[] = [];

  const currentHtml = () => bucket.join("");

  const flush = () => {
    if (bucket.length === 0) return;
    pages.push(currentHtml());
    bucket = [];
  };

  for (let i = 0; i < blocks.length; i++) {
    if (yieldEvery > 0 && i > 0 && i % 40 === 0) {
      await cooperativeYield();
    }

    const block = blocks[i];
    const forceNewPage =
      bucket.length > 0 && (chapterBreakAt.has(i) || isChapterHeading(block));
    if (forceNewPage) {
      flush();
    }

    const outer = block.outerHTML;
    const trial = bucket.length ? currentHtml() + outer : outer;

    if (await fits(trial)) {
      bucket.push(outer);
      continue;
    }

    if (bucket.length > 0) {
      flush();
    }

    if (await fits(outer)) {
      bucket.push(outer);
      continue;
    }

    const pieces = await splitBlockToFitPieces(outer, fits);
    for (const piece of pieces) {
      const trial2 = bucket.length ? currentHtml() + piece : piece;
      if (await fits(trial2)) {
        bucket.push(piece);
        continue;
      }

      flush();

      if (await fits(piece)) {
        bucket.push(piece);
        continue;
      }

      const wrap = parseSingleTagWrapper(piece.trim());
      const tag = wrap?.tag ?? "p";
      const innerOnly = wrap?.inner ?? piece;
      const micro = await splitTextIntoWrappers(innerOnly, fits, tag);
      for (const m of micro) {
        const trial3 = bucket.length ? currentHtml() + m : m;
        if (await fits(trial3)) {
          bucket.push(m);
        } else {
          flush();
          bucket.push(m);
        }
      }
    }
  }

  flush();

  if (pages.length === 0) {
    const joined = blocks.map((b) => b.outerHTML).join("");
    return [joined.trim() || "<p>No readable content.</p>"];
  }
  return pages;
}

function collectBlocksFromHtml(html: string): {
  blocks: Element[];
  chapterBreakAt: Set<number>;
  body: HTMLElement;
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script").forEach((el) => el.remove());

  const body = doc.body;
  stripProjectGutenbergShell(body);

  let blocks: Element[] = [];
  let chapterBreakAt = new Set<number>();

  const fromSections = blocksFromSections(body);
  if (fromSections.blocks.length > 0) {
    blocks = fromSections.blocks;
    chapterBreakAt = fromSections.chapterBreakAt;
  } else {
    const fromChapters = blocksFromChapters(body);
    if (fromChapters.blocks.length > 0) {
      blocks = fromChapters.blocks;
      chapterBreakAt = fromChapters.chapterBreakAt;
    } else {
      blocks = blocksFromBody(body);
    }
  }

  return { blocks, chapterBreakAt, body };
}

/**
 * Turn fetched book HTML into discrete page elements for StPageFlip.
 * With `fit`, packs real block nodes into pages using off-screen measurement so each
 * face matches the pixel size of `.book-page` in the reader.
 */
export async function htmlToPageElements(
  html: string,
  fit?: PageFitOptions,
  asyncOpts?: HtmlToPagesAsyncOptions,
): Promise<HTMLDivElement[]> {
  const { blocks, chapterBreakAt, body } = collectBlocksFromHtml(html);

  if (blocks.length === 0) {
    const fallback = body.innerHTML.trim() || "<p>No readable content.</p>";
    return [createPageDiv(fallback, 0)];
  }

  if (!fit) {
    const joined = blocks.map((b) => b.outerHTML).join("");
    return [createPageDiv(joined.slice(0, 14000), 0)];
  }

  const yieldEvery = asyncOpts?.yieldEvery ?? 48;
  const { fits: syncFits, cleanup } = createMeasurer(fit);
  const fits = wrapFitsWithYields(syncFits, yieldEvery);

  try {
    const htmlPages = await paginateBlocks(blocks, fits, chapterBreakAt, yieldEvery);
    return htmlPages.map((h, i) => createPageDiv(h, i));
  } finally {
    cleanup();
  }
}
