export type PageFitOptions = {
  /** Full page face width in px (border-box, matches StPageFlip page element). */
  pageWidthPx: number;
  /** Full page face height in px. */
  pageHeightPx: number;
  /** Multiplier for base reader font (1 = default). Must match live `.book-page` scaling. */
  fontScale?: number;
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

function splitTextIntoWrappers(text: string, fits: (html: string) => boolean, tag: string): string[] {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const pieces: string[] = [];
  let rest = text.trim();
  if (!rest.length) return pieces;

  while (rest.length > 0) {
    let lo = 1;
    let hi = rest.length;
    let best = 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const chunk = rest.slice(0, mid);
      if (fits(`${open}${chunk}${close}`)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 1) best = 1;
    pieces.push(`${open}${rest.slice(0, best)}${close}`);
    rest = rest.slice(best).trimStart();
  }
  return pieces;
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

function splitBlockToFitPieces(outerHtml: string, fits: (html: string) => boolean): string[] {
  const wrapped = `<div id="split-root">${outerHtml}</div>`;
  const doc = new DOMParser().parseFromString(wrapped, "text/html");
  const el = doc.getElementById("split-root")?.firstElementChild;
  if (!el) return fits(outerHtml) ? [outerHtml] : [`<p>${outerHtml}</p>`];

  if (fits(outerHtml)) return [outerHtml];

  const tag = el.tagName.toLowerCase();
  const inner = el.innerHTML;

  if (tag === "pre") {
    return splitTextIntoWrappers(inner, fits, "pre");
  }

  if (tag === "p" || tag === "blockquote" || tag === "li") {
    return splitTextIntoWrappers(inner, fits, tag);
  }

  if (tag.startsWith("h") && tag.length === 2) {
    return splitTextIntoWrappers(inner, fits, tag);
  }

  const text = el.textContent?.trim() ?? "";
  if (text.length) {
    return splitTextIntoWrappers(text, fits, "p");
  }

  return [outerHtml];
}

function paginateBlocks(
  blocks: Element[],
  fits: (html: string) => boolean,
  chapterBreakAt: Set<number>,
): string[] {
  const pages: string[] = [];
  let bucket: string[] = [];

  const currentHtml = () => bucket.join("");

  const flush = () => {
    if (bucket.length === 0) return;
    pages.push(currentHtml());
    bucket = [];
  };

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const forceNewPage =
      bucket.length > 0 && (chapterBreakAt.has(i) || isChapterHeading(block));
    if (forceNewPage) {
      flush();
    }

    const outer = block.outerHTML;
    const trial = bucket.length ? currentHtml() + outer : outer;

    if (fits(trial)) {
      bucket.push(outer);
      continue;
    }

    if (bucket.length > 0) {
      flush();
    }

    if (fits(outer)) {
      bucket.push(outer);
      continue;
    }

    const pieces = splitBlockToFitPieces(outer, fits);
    for (const piece of pieces) {
      const trial2 = bucket.length ? currentHtml() + piece : piece;
      if (fits(trial2)) {
        bucket.push(piece);
        continue;
      }

      flush();

      if (fits(piece)) {
        bucket.push(piece);
        continue;
      }

      const wrapDoc = new DOMParser().parseFromString(piece, "text/html");
      const wrapEl = wrapDoc.body.firstElementChild;
      const tag = wrapEl?.tagName.toLowerCase() ?? "p";
      const innerOnly = wrapEl?.innerHTML ?? piece;
      const micro = splitTextIntoWrappers(innerOnly, fits, tag);
      for (const m of micro) {
        const trial3 = bucket.length ? currentHtml() + m : m;
        if (fits(trial3)) {
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

/**
 * Turn fetched book HTML into discrete page elements for StPageFlip.
 * With `fit`, packs real block nodes into pages using off-screen measurement so each
 * face matches the pixel size of `.book-page` in the reader.
 */
export function htmlToPageElements(html: string, fit?: PageFitOptions): HTMLDivElement[] {
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

  if (blocks.length === 0) {
    const fallback = body.innerHTML.trim() || "<p>No readable content.</p>";
    return [createPageDiv(fallback, 0)];
  }

  if (!fit) {
    const joined = blocks.map((b) => b.outerHTML).join("");
    return [createPageDiv(joined.slice(0, 14000), 0)];
  }

  const { fits, cleanup } = createMeasurer(fit);
  try {
    const htmlPages = paginateBlocks(blocks, fits, chapterBreakAt);
    return htmlPages.map((h, i) => createPageDiv(h, i));
  } finally {
    cleanup();
  }
}
