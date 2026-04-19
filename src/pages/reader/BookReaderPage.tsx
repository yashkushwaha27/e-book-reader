import { PageFlip } from "page-flip";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { bookNeedsDriveProxyNote, getBookById, resolveBookFetchUrl } from "../../data/books";
import { htmlToPageElements } from "../../lib/htmlToPages";
import { addBookmark, getBookmarkIndices, removeBookmark } from "../../lib/readerBookmarks";
import { ROUTES } from "../../routes/routes.constants";
import "./BookReaderPage.css";

type ReaderStatus = "loading" | "ready" | "error";

type LoadingPhase = "fetch" | "paginate";

type HtmlCache = { bookId: string; html: string };

const RESIZE_DEBOUNCE_MS = 220;
/** Ignore sub-pixel drift from StPageFlip `update()` so we do not repaginate entire books twice. */
const PAGE_DIMENSION_THRESHOLD_PX = 12;
/** Skip ResizeObserver-driven rebuilds when the stage barely changed (stops feedback loops). */
const STAGE_RESIZE_EPSILON_PX = 10;

const PORTRAIT_BREAKPOINT_PX = 960;

/** Bump when `.book-page` / `.reader-measure-host` typography changes so pagination remeasures. */
const READER_PAGE_TYPO_KEY = "12px-compact-v1";

/** Must match `flippingTime` in `buildFlipSettings` — fallback must run after the flip can finish. */
const FLIP_ANIMATION_MS = 880;
const FLIP_FALLBACK_AFTER_MS = FLIP_ANIMATION_MS + 120;

/**
 * StPageFlip keeps `currentPageIndex` on the left page of a spread in landscape.
 * Use the right-hand page number for 1-based UI so "Go to page 200" matches the badge.
 */
function displayPage1Based(currentIdx: number, portrait: boolean, total: number): number {
  if (portrait || total < 1) return currentIdx + 1;
  if (currentIdx >= total - 1) return currentIdx + 1;
  return currentIdx + 2;
}

/** Face index to persist for bookmarks (right page when two are visible). */
function canonicalBookmarkFaceIndex(currentIdx: number, portrait: boolean, total: number): number {
  if (portrait || total < 1) return currentIdx;
  if (currentIdx >= total - 1) return currentIdx;
  return currentIdx + 1;
}

async function waitAnimationFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

function computeStageGeometry(stage: HTMLElement, flipMount?: HTMLElement | null) {
  const w = stage.clientWidth;
  const stageH = stage.clientHeight;
  const mountH = flipMount?.clientHeight ?? 0;
  /** Stage is authoritative; max avoids a too-short flip mount shrinking `faceH` and exploding page count. */
  const h = Math.max(stageH, mountH > 40 ? mountH : 0);
  const usePortrait = w < PORTRAIT_BREAKPOINT_PX;
  const faceW = usePortrait ? Math.max(220, Math.floor(w)) : Math.max(220, Math.floor(w / 2));
  const faceH = Math.max(280, Math.floor(h));
  return { faceW, faceH, usePortrait };
}

function layoutKeyForStage(bookId: string, stage: HTMLElement, geom: ReturnType<typeof computeStageGeometry>) {
  if (geom.faceW < 8 || geom.faceH < 8) return null;
  return `${bookId}:${Math.round(stage.clientWidth)}:${Math.round(stage.clientHeight)}:${geom.usePortrait ? "p" : "l"}:${READER_PAGE_TYPO_KEY}`;
}

/** Scale StPageFlip root so the rendered spread fills the mount (reduces letterboxing). */
function applyReaderFlipScale(mount: HTMLElement) {
  mount.style.removeProperty("--reader-flip-scale");
  const root = mount.querySelector(".stf__parent") as HTMLElement | null;
  if (!root) return;
  const mw = mount.clientWidth;
  const mh = mount.clientHeight;
  if (mw < 8 || mh < 8) return;
  const spreadRect = root.getBoundingClientRect();
  if (spreadRect.width < 4 || spreadRect.height < 4) return;
  /* Fill the mount (same as mobile); cap only guards pathological rects. */
  const scale = Math.min(mw / spreadRect.width, mh / spreadRect.height, 2);
  if (Math.abs(scale - 1) > 0.004) {
    mount.style.setProperty("--reader-flip-scale", String(scale));
  }
}

/**
 * `PageFlip.flipNext` / `flipPrev` pass synthetic points with `y: 1` / `height - 2` and `x: 10` without
 * adding `getRect().top` / `.left`. With `disableFlipByClick`, `flip()` rejects those points when the
 * spread is centered (`top !== 0`), so toolbar Next/Prev never animate and only the timeout fallback runs.
 */
function flipFromCorner(pf: PageFlip, direction: "next" | "prev", corner: "top" | "bottom") {
  const rect = pf.getBoundsRect();
  const y = corner === "top" ? rect.top + 2 : rect.top + rect.height - 2;
  const x =
    direction === "next" ? rect.left + 2 * rect.pageWidth - 10 : rect.left + 10;
  pf.getFlipController().flip({ x, y });
}

function buildFlipSettings(geom: ReturnType<typeof computeStageGeometry>): Record<string, unknown> {
  return {
    width: geom.faceW,
    height: geom.faceH,
    size: "stretch",
    minWidth: 200,
    maxWidth: 4000,
    minHeight: 240,
    maxHeight: 3200,
    showCover: false,
    drawShadow: true,
    flippingTime: FLIP_ANIMATION_MS,
    usePortrait: geom.usePortrait,
    startZIndex: 0,
    autoSize: true,
    disableFlipByClick: true,
    useMouseEvents: true,
    showPageCorners: true,
    /** Favor drag-to-flip on touch; when true, moves often go to scroll and never reach the flip controller. */
    mobileScrollSupport: false,
  };
}

export function BookReaderPage() {
  const { bookId } = useParams();
  const [searchParams] = useSearchParams();
  const skin = searchParams.get("skin") ?? "classic";

  const stageRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const htmlCacheRef = useRef<HtmlCache | null>(null);
  const runGenerationRef = useRef(0);
  const lastLayoutKeyRef = useRef<string | null>(null);
  const layoutInProgressRef = useRef(false);
  /** Mirrors last PageFlip `usePortrait` so page labels match spread vs single-page mode. */
  const flipPortraitRef = useRef(true);
  const flipNavFallbackRef = useRef<number | undefined>(undefined);

  const [status, setStatus] = useState<ReaderStatus>("loading");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase | null>(null);
  const [errorText, setErrorText] = useState("");
  const [pageLabel, setPageLabel] = useState("— / —");
  const [pageCount, setPageCount] = useState(0);
  const [jumpInput, setJumpInput] = useState("");
  const [jumpHint, setJumpHint] = useState("");
  const [bookmarks, setBookmarks] = useState<number[]>([]);

  const book = getBookById(bookId);

  useEffect(() => {
    if (book?.id) {
      setBookmarks(getBookmarkIndices(book.id));
    } else {
      setBookmarks([]);
    }
  }, [book?.id]);

  useEffect(() => {
    return () => {
      if (flipNavFallbackRef.current !== undefined) {
        window.clearTimeout(flipNavFallbackRef.current);
      }
    };
  }, []);

  const syncPageLabel = useCallback(() => {
    const pf = flipRef.current;
    if (!pf) return;
    const idx = pf.getCurrentPageIndex();
    const total = pf.getPageCount();
    const portrait = flipPortraitRef.current;
    const shown = displayPage1Based(idx, portrait, total);
    setPageLabel(`${shown} / ${total}`);
    setPageCount(total);
    setJumpInput(String(shown));
  }, []);

  const syncAfterFlip = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncPageLabel();
      });
    });
  }, [syncPageLabel]);

  useEffect(() => {
    const mount = mountRef.current;
    const stage = stageRef.current;
    if (!mount || !stage) return;

    flipRef.current?.destroy();
    flipRef.current = null;
    mount.innerHTML = "";

    if (!book || !bookId) {
      setStatus("error");
      setErrorText("That title is not in the catalog yet.");
      return;
    }

    lastLayoutKeyRef.current = null;

    let cancelled = false;
    let debounceTimer: number | undefined;
    let ro: ResizeObserver | null = null;
    let layoutChain: Promise<void> = Promise.resolve();
    let lastObservedStage = { w: -1, h: -1, portrait: false as boolean };

    const runLayout = async (generation: number) => {
      if (cancelled) return;

      const geom = computeStageGeometry(stage, mount);
      if (geom.faceW < 8 || geom.faceH < 8) {
        return;
      }

      const layoutKey = layoutKeyForStage(book.id, stage, geom);
      if (layoutKey && flipRef.current && lastLayoutKeyRef.current === layoutKey) {
        return;
      }

      layoutInProgressRef.current = true;

      flipRef.current?.destroy();
      flipRef.current = null;
      mount.innerHTML = "";

      const flipSettings = buildFlipSettings(geom);
      flipPortraitRef.current = geom.usePortrait;

      const cacheHit = htmlCacheRef.current?.bookId === book.id;
      setStatus("loading");
      setErrorText("");
      setLoadingPhase(cacheHit ? "paginate" : "fetch");

      try {
        let html: string;
        if (cacheHit && htmlCacheRef.current) {
          html = htmlCacheRef.current.html;
        } else {
          const url = resolveBookFetchUrl(book);
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`Could not download HTML (HTTP ${res.status}).`);
          }
          html = await res.text();
          htmlCacheRef.current = { bookId: book.id, html };
        }

        if (cancelled || generation !== runGenerationRef.current) return;

        setLoadingPhase("paginate");

        await waitAnimationFrames(2);
        if (cancelled || generation !== runGenerationRef.current) return;

        const blockProbe = document.createElement("div");
        blockProbe.style.width = "100%";
        blockProbe.style.height = "100%";
        blockProbe.style.minHeight = "0";
        blockProbe.style.boxSizing = "border-box";
        mount.appendChild(blockProbe);

        const dummy = document.createElement("div");
        dummy.className = "book-page";
        dummy.innerHTML = "<p style=\"margin:0\">&nbsp;</p>";

        const probe = new PageFlip(blockProbe, flipSettings);
        probe.loadFromHTML([dummy]);
        await waitAnimationFrames(3);

        if (cancelled || generation !== runGenerationRef.current) {
          probe.destroy();
          mount.innerHTML = "";
          return;
        }

        const rect = probe.getRender().getRect();
        probe.destroy();
        mount.innerHTML = "";

        let pageW = Math.max(220, Math.floor(rect.pageWidth));
        let pageH = Math.max(280, Math.floor(rect.height));

        let pages = await htmlToPageElements(
          html,
          {
            pageWidthPx: pageW,
            pageHeightPx: pageH,
            fontScale: 1,
          },
          { yieldEvery: 48 },
        );

        if (cancelled || generation !== runGenerationRef.current) return;

        const block = document.createElement("div");
        block.style.width = "100%";
        block.style.height = "100%";
        block.style.minHeight = "0";
        block.style.boxSizing = "border-box";
        mount.appendChild(block);

        const pf = new PageFlip(block, flipSettings);
        pf.loadFromHTML(pages);
        flipRef.current = pf;
        pf.on("flip", () => {
          syncAfterFlip();
        });

        await waitAnimationFrames(3);
        if (cancelled || generation !== runGenerationRef.current) {
          pf.destroy();
          mount.innerHTML = "";
          return;
        }

        pf.update();
        applyReaderFlipScale(mount);
        await waitAnimationFrames(1);
        applyReaderFlipScale(mount);
        const settled = pf.getRender().getRect();
        const settledW = Math.max(220, Math.floor(settled.pageWidth));
        const settledH = Math.max(280, Math.floor(settled.height));
        if (
          Math.abs(settledW - pageW) > PAGE_DIMENSION_THRESHOLD_PX ||
          Math.abs(settledH - pageH) > PAGE_DIMENSION_THRESHOLD_PX
        ) {
          pageW = settledW;
          pageH = settledH;
          pages = await htmlToPageElements(
            html,
            {
              pageWidthPx: pageW,
              pageHeightPx: pageH,
              fontScale: 1,
            },
            { yieldEvery: 48 },
          );
          if (cancelled || generation !== runGenerationRef.current) {
            pf.destroy();
            mount.innerHTML = "";
            return;
          }
          pf.updateFromHtml(pages);
          pf.update();
          applyReaderFlipScale(mount);
          await waitAnimationFrames(1);
          applyReaderFlipScale(mount);
        }

        if (cancelled || generation !== runGenerationRef.current) return;

        const doneKey = layoutKeyForStage(book.id, stage, computeStageGeometry(stage, mount));
        if (doneKey) {
          lastLayoutKeyRef.current = doneKey;
        }
        lastObservedStage = {
          w: stage.clientWidth,
          h: stage.clientHeight,
          portrait: stage.clientWidth < PORTRAIT_BREAKPOINT_PX,
        };

        syncPageLabel();
        setLoadingPhase(null);
        setStatus("ready");
      } catch (err) {
        if (cancelled || generation !== runGenerationRef.current) return;
        flipRef.current?.destroy();
        flipRef.current = null;
        mount.innerHTML = "";
        if (htmlCacheRef.current?.bookId === book.id) {
          htmlCacheRef.current = null;
        }
        setLoadingPhase(null);
        setStatus("error");
        setErrorText(err instanceof Error ? err.message : "Failed to open book.");
      } finally {
        layoutInProgressRef.current = false;
      }
    };

    const queueLayout = () => {
      runGenerationRef.current += 1;
      const generation = runGenerationRef.current;
      layoutChain = layoutChain.then(() => runLayout(generation)).catch(() => {});
    };

    const scheduleLayoutDebounced = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(queueLayout, RESIZE_DEBOUNCE_MS);
    };

    ro = new ResizeObserver(() => {
      if (layoutInProgressRef.current) return;
      const w = stage.clientWidth;
      const h = stage.clientHeight;
      const portrait = w < PORTRAIT_BREAKPOINT_PX;
      if (
        lastObservedStage.w >= 0 &&
        Math.abs(w - lastObservedStage.w) < STAGE_RESIZE_EPSILON_PX &&
        Math.abs(h - lastObservedStage.h) < STAGE_RESIZE_EPSILON_PX &&
        portrait === lastObservedStage.portrait
      ) {
        return;
      }
      scheduleLayoutDebounced();
    });
    ro.observe(stage);
    queueLayout();

    return () => {
      cancelled = true;
      runGenerationRef.current += 1;
      window.clearTimeout(debounceTimer);
      if (flipNavFallbackRef.current !== undefined) {
        window.clearTimeout(flipNavFallbackRef.current);
        flipNavFallbackRef.current = undefined;
      }
      ro?.disconnect();
      flipRef.current?.destroy();
      flipRef.current = null;
      mount.innerHTML = "";
    };
  }, [book, bookId, syncPageLabel, syncAfterFlip]);

  const handleNext = useCallback(() => {
    const pf = flipRef.current;
    if (!pf || status !== "ready") return;
    if (flipNavFallbackRef.current !== undefined) {
      window.clearTimeout(flipNavFallbackRef.current);
    }
    pf.update();
    const before = pf.getCurrentPageIndex();
    flipFromCorner(pf, "next", "top");
    flipNavFallbackRef.current = window.setTimeout(() => {
      flipNavFallbackRef.current = undefined;
      const cur = flipRef.current;
      if (!cur) return;
      if (cur.getCurrentPageIndex() === before) {
        cur.turnToNextPage();
        syncAfterFlip();
      }
    }, FLIP_FALLBACK_AFTER_MS);
  }, [status, syncAfterFlip]);

  const handlePrev = useCallback(() => {
    const pf = flipRef.current;
    if (!pf || status !== "ready") return;
    if (flipNavFallbackRef.current !== undefined) {
      window.clearTimeout(flipNavFallbackRef.current);
    }
    pf.update();
    const before = pf.getCurrentPageIndex();
    flipFromCorner(pf, "prev", "top");
    flipNavFallbackRef.current = window.setTimeout(() => {
      flipNavFallbackRef.current = undefined;
      const cur = flipRef.current;
      if (!cur) return;
      if (cur.getCurrentPageIndex() === before) {
        cur.turnToPrevPage();
        syncAfterFlip();
      }
    }, FLIP_FALLBACK_AFTER_MS);
  }, [status, syncAfterFlip]);

  const handleJump = useCallback(() => {
    const pf = flipRef.current;
    if (!pf || status !== "ready") return;
    const total = pf.getPageCount();
    const raw = jumpInput.trim();
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1 || n > total) {
      setJumpHint(`Enter a page from 1 to ${total}.`);
      return;
    }
    setJumpHint("");
    pf.turnToPage(n - 1);
    syncAfterFlip();
  }, [jumpInput, status, syncAfterFlip]);

  const handleBookmarkPage = useCallback(() => {
    const pf = flipRef.current;
    if (!book?.id || !pf || status !== "ready") return;
    const idx = pf.getCurrentPageIndex();
    const total = pf.getPageCount();
    const face = canonicalBookmarkFaceIndex(idx, flipPortraitRef.current, total);
    setBookmarks(addBookmark(book.id, face));
    setJumpHint("");
  }, [book?.id, status]);

  const handleGoToBookmark = useCallback(
    (pageIndex: number) => {
      const pf = flipRef.current;
      if (!pf || status !== "ready") return;
      const total = pf.getPageCount();
      if (pageIndex < 0 || pageIndex >= total) return;
      pf.turnToPage(pageIndex);
      syncAfterFlip();
    },
    [status, syncAfterFlip],
  );

  const handleRemoveBookmark = useCallback(
    (pageIndex: number, e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!book?.id) return;
      setBookmarks(removeBookmark(book.id, pageIndex));
    },
    [book?.id],
  );

  const shellClass =
    skin === "sepia"
      ? "reader-shell reader-shell--sepia"
      : skin === "contrast"
        ? "reader-shell reader-shell--contrast"
        : "reader-shell";

  return (
    <div className={shellClass}>
      <div className="reader-chrome">
        <div className="reader-toolbar">
          <Link className="reader-back" to={ROUTES.LIBRARY}>
            <span className="reader-back-icon" aria-hidden>
              ←
            </span>
            Library
          </Link>
          {book ? (
            <h1 className="reader-title">{book.title}</h1>
          ) : (
            <h1 className="reader-title">Missing book</h1>
          )}
          <div className="reader-toolbar-meta">
            <span className="reader-page-badge" aria-live="polite">
              Page {pageLabel}
            </span>
          </div>
        </div>

        {book && bookNeedsDriveProxyNote(book) ? (
          <p className="reader-banner">
            This title loads from Google Drive. Outside the dev server, configure a proxy
            or use a CORS-enabled HTML URL — see Templates → Drive tips.
          </p>
        ) : null}


        {status === "error" ? (
          <p className="reader-error" role="alert">
            {errorText}
          </p>
        ) : null}

        <div className="reader-book-outer" aria-label="Book">
          <div className="reader-book-spine" aria-hidden />
          <div className="reader-book-board">
            <div className="reader-book-rim" />
            <div className="reader-stage-wrap">
              <div ref={stageRef} className="reader-stage" aria-busy={status === "loading"}>
                <div
                  className={
                    status === "loading" ? "reader-loading reader-loading--visible" : "reader-loading"
                  }
                  aria-hidden={status !== "loading"}
                >
                  <div className="reader-loading-inner">
                    <div className="reader-loading-book" aria-hidden />
                    <p className="reader-loading-text">
                      {loadingPhase === "fetch"
                        ? "Downloading book…"
                        : loadingPhase === "paginate"
                          ? "Preparing pages…"
                          : "Loading…"}
                    </p>
                    {/* <div className="reader-loading-bar" aria-hidden>
                      <div className="reader-loading-bar-fill" />
                    </div>  */}
                    <div className="reader-loading-dots">
                      <span className="reader-loading-dot" />
                      <span className="reader-loading-dot" />
                      <span className="reader-loading-dot" />
                    </div>
                  </div>
                </div>
                <div ref={mountRef} className="reader-flip-mount" />
              </div>
            </div>
          </div>
        </div>

        <footer className="reader-footer">
          <div className="reader-controls">
            <button type="button" className="reader-btn" onClick={handlePrev} disabled={status !== "ready"}>
              Previous page
            </button>
            <button
              type="button"
              className="reader-btn reader-btn-accent"
              onClick={handleNext}
              disabled={status !== "ready"}
            >
              Next page
            </button>
          </div>

          <div className="reader-nav-tools">
            <form
              className="reader-jump"
              onSubmit={(e) => {
                e.preventDefault();
                handleJump();
              }}
            >
              <label className="reader-jump-label" htmlFor="reader-jump-page">
                Go to page
              </label>
              <input
                id="reader-jump-page"
                className="reader-jump-input"
                type="number"
                inputMode="numeric"
                min={1}
                max={pageCount > 0 ? pageCount : undefined}
                placeholder="1"
                value={jumpInput}
                onChange={(e) => {
                  setJumpInput(e.target.value);
                  setJumpHint("");
                }}
                disabled={status !== "ready" || pageCount === 0}
                aria-describedby={jumpHint ? "reader-jump-hint" : undefined}
              />
              <button type="submit" className="reader-btn" disabled={status !== "ready" || pageCount === 0}>
                Go
              </button>
            </form>

            <button
              type="button"
              className="reader-btn reader-btn-bookmark"
              onClick={handleBookmarkPage}
              disabled={status !== "ready"}
            >
              Bookmark this page
            </button>
          </div>

          {status === "ready" ? (
            <div className="reader-bookmarks-region">
              {bookmarks.length > 0 ? (
                <div className="reader-bookmarks" aria-label="Saved bookmarks">
                  <span className="reader-bookmarks-title">Bookmarks</span>
                  <ul className="reader-bookmarks-list">
                    {bookmarks.map((idx) => (
                      <li key={idx} className="reader-bookmark-pill">
                        <button
                          type="button"
                          className="reader-bookmark-chip"
                          onClick={() => handleGoToBookmark(idx)}
                          disabled={status !== "ready"}
                        >
                          Page {idx + 1}
                        </button>
                        <button
                          type="button"
                          className="reader-bookmark-remove"
                          aria-label={`Remove bookmark for page ${idx + 1}`}
                          onClick={(e) => handleRemoveBookmark(idx, e)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {jumpHint ? (
            <p id="reader-jump-hint" className="reader-jump-hint" role="status">
              {jumpHint}
            </p>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
