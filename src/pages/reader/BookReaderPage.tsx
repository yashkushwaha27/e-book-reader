import { PageFlip } from "page-flip";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { bookNeedsDriveProxyNote, getBookById } from "../../data/books";
import { fetchBookHtmlText } from "../../lib/fetchBookHtml";
import { htmlToPageElements } from "../../lib/htmlToPages";
import { addBookmark, getBookmarkIndices, removeBookmark } from "../../lib/readerBookmarks";
import { recordRecentBook } from "../../lib/recentlyRead";
import { getResumeTargetFaceIndex, shouldOfferResumePrompt } from "../../lib/readerResume";
import { isBookSavedOffline, saveOfflineBook } from "../../lib/offlineBookStorage";
import { getReadingPosition, setReadingPosition } from "../../lib/readerProgress";
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
  const readingSaveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queueSaveReadingPositionRef = useRef<() => void>(() => {});
  const resumeFromStartRef = useRef(false);

  const [status, setStatus] = useState<ReaderStatus>("loading");
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase | null>(null);
  const [errorText, setErrorText] = useState("");
  const [pageLabel, setPageLabel] = useState("— / —");
  const [pageCount, setPageCount] = useState(0);
  const [jumpInput, setJumpInput] = useState("");
  const [jumpHint, setJumpHint] = useState("");
  const [bookmarks, setBookmarks] = useState<number[]>([]);
  const [resumePromptOpen, setResumePromptOpen] = useState(() => {
    const b = getBookById(bookId);
    return b ? shouldOfferResumePrompt(b.id) : false;
  });
  const [offlineSaved, setOfflineSaved] = useState(false);
  const [saveOfflineBusy, setSaveOfflineBusy] = useState(false);
  const [saveOfflineHint, setSaveOfflineHint] = useState("");
  const [netOnline, setNetOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  const book = getBookById(bookId);

  useEffect(() => {
    if (book?.id) {
      setBookmarks(getBookmarkIndices(book.id));
    } else {
      setBookmarks([]);
    }
  }, [book?.id]);

  useEffect(() => {
    if (!book) {
      setResumePromptOpen(false);
      return;
    }
    resumeFromStartRef.current = false;
    setResumePromptOpen(shouldOfferResumePrompt(book.id));
  }, [book?.id]);

  useEffect(() => {
    if (!book?.id) {
      setOfflineSaved(false);
      return;
    }
    let cancelled = false;
    void isBookSavedOffline(book.id).then((saved) => {
      if (!cancelled) setOfflineSaved(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [book?.id]);

  useEffect(() => {
    setSaveOfflineHint("");
  }, [book?.id]);

  useEffect(() => {
    const onOnline = () => setNetOnline(true);
    const onOffline = () => setNetOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

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

  const queueSaveReadingPosition = useCallback(() => {
    if (!book?.id) return;
    window.clearTimeout(readingSaveTimerRef.current);
    readingSaveTimerRef.current = window.setTimeout(() => {
      const pf = flipRef.current;
      if (!pf || !book?.id) return;
      const total = pf.getPageCount();
      if (total < 1) return;
      const face = canonicalBookmarkFaceIndex(
        pf.getCurrentPageIndex(),
        flipPortraitRef.current,
        total,
      );
      setReadingPosition(book.id, face);
    }, 380);
  }, [book?.id]);

  queueSaveReadingPositionRef.current = queueSaveReadingPosition;

  const flushSaveReadingPosition = useCallback(() => {
    if (!book?.id) return;
    window.clearTimeout(readingSaveTimerRef.current);
    const pf = flipRef.current;
    if (!pf || status !== "ready") return;
    const total = pf.getPageCount();
    if (total < 1) return;
    const face = canonicalBookmarkFaceIndex(
      pf.getCurrentPageIndex(),
      flipPortraitRef.current,
      total,
    );
    setReadingPosition(book.id, face);
  }, [book?.id, status]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushSaveReadingPosition();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushSaveReadingPosition);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushSaveReadingPosition);
    };
  }, [flushSaveReadingPosition]);

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

    if (resumePromptOpen) {
      setStatus("loading");
      setLoadingPhase(null);
      setErrorText("");
      return () => {};
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
          html = await fetchBookHtmlText(book);
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
          queueSaveReadingPositionRef.current();
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

        const totalPages = pf.getPageCount();
        if (!resumeFromStartRef.current && totalPages > 0) {
          const target = getResumeTargetFaceIndex(book.id);
          if (target !== null) {
            const clamped = Math.min(Math.max(0, target), totalPages - 1);
            pf.turnToPage(clamped);
          }
        }

        syncPageLabel();
        setLoadingPhase(null);
        setStatus("ready");
        recordRecentBook(book.id);
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
      window.clearTimeout(readingSaveTimerRef.current);
      if (flipNavFallbackRef.current !== undefined) {
        window.clearTimeout(flipNavFallbackRef.current);
        flipNavFallbackRef.current = undefined;
      }
      ro?.disconnect();
      flipRef.current?.destroy();
      flipRef.current = null;
      mount.innerHTML = "";
    };
  }, [book, bookId, resumePromptOpen, syncPageLabel, syncAfterFlip]);

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
      queueSaveReadingPositionRef.current();
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
      queueSaveReadingPositionRef.current();
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
    queueSaveReadingPosition();
  }, [jumpInput, status, syncAfterFlip, queueSaveReadingPosition]);

  const handleBookmarkPage = useCallback(() => {
    const pf = flipRef.current;
    if (!book?.id || !pf || status !== "ready") return;
    const idx = pf.getCurrentPageIndex();
    const total = pf.getPageCount();
    const face = canonicalBookmarkFaceIndex(idx, flipPortraitRef.current, total);
    setBookmarks(addBookmark(book.id, face));
    setJumpHint("");
    setReadingPosition(book.id, face);
  }, [book?.id, status]);

  const handleGoToBookmark = useCallback(
    (pageIndex: number) => {
      const pf = flipRef.current;
      if (!pf || status !== "ready") return;
      const total = pf.getPageCount();
      if (pageIndex < 0 || pageIndex >= total) return;
      pf.turnToPage(pageIndex);
      syncAfterFlip();
      queueSaveReadingPosition();
    },
    [status, syncAfterFlip, queueSaveReadingPosition],
  );

  const handleRemoveBookmark = useCallback(
    (pageIndex: number, e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (!book?.id) return;
      setBookmarks(removeBookmark(book.id, pageIndex));
    },
    [book?.id],
  );

  const handleSaveOffline = useCallback(async () => {
    if (!book) return;
    const cached = htmlCacheRef.current;
    if (!cached || cached.bookId !== book.id) {
      setSaveOfflineHint("Finish loading the book, then try again.");
      return;
    }
    setSaveOfflineBusy(true);
    setSaveOfflineHint("");
    try {
      await saveOfflineBook({
        bookId: book.id,
        title: book.title,
        html: cached.html,
      });
      setOfflineSaved(true);
      setSaveOfflineHint("Saved — you can read this title without internet.");
    } catch (err) {
      setSaveOfflineHint(err instanceof Error ? err.message : "Could not save for offline.");
    } finally {
      setSaveOfflineBusy(false);
    }
  }, [book]);

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
            {!netOnline ? (
              <span className="reader-offline-badge" title="Network unavailable">
                Offline
              </span>
            ) : null}
            <span className="reader-page-badge" aria-live="polite">
              Page {resumePromptOpen ? "— / —" : pageLabel}
            </span>
            {book && !resumePromptOpen && status === "ready" ? (
              offlineSaved ? (
                <span className="reader-offline-saved" title="HTML is stored on this device">
                  Saved offline
                </span>
              ) : (
                <button
                  type="button"
                  className="reader-save-offline-btn"
                  onClick={handleSaveOffline}
                  disabled={saveOfflineBusy || !netOnline}
                  title={
                    netOnline
                      ? "Store this book on your device for reading without internet"
                      : "Connect to the internet once to download and save"
                  }
                >
                  {saveOfflineBusy ? "Saving…" : "Save for offline"}
                </button>
              )
            ) : null}
          </div>
        </div>

        {!netOnline ? (
          <p className="reader-banner reader-banner--offline">
            You’re offline. Books you’ve saved for offline still open; reconnect to download new
            titles.
          </p>
        ) : null}

        {saveOfflineHint ? (
          <p className="reader-offline-hint" role="status">
            {saveOfflineHint}
          </p>
        ) : null}

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
              <div
                ref={stageRef}
                className="reader-stage"
                aria-busy={status === "loading" && !resumePromptOpen}
              >
                <div
                  className={
                    status === "loading" && !resumePromptOpen
                      ? "reader-loading reader-loading--visible"
                      : "reader-loading"
                  }
                  aria-hidden={status !== "loading" || resumePromptOpen}
                >
                  <div className="reader-loading-inner">
                    <div className="reader-loading-book" aria-hidden />
                    <p className="reader-loading-text">
                      {loadingPhase === "fetch"
                        ? typeof navigator !== "undefined" && !navigator.onLine
                          ? "Opening saved copy…"
                          : "Downloading book…"
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
            <button
              type="button"
              className="reader-btn"
              onClick={handlePrev}
              disabled={status !== "ready" || resumePromptOpen}
            >
              Previous page
            </button>
            <button
              type="button"
              className="reader-btn reader-btn-accent"
              onClick={handleNext}
              disabled={status !== "ready" || resumePromptOpen}
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
                disabled={status !== "ready" || pageCount === 0 || resumePromptOpen}
                aria-describedby={jumpHint ? "reader-jump-hint" : undefined}
              />
              <button
                type="submit"
                className="reader-btn"
                disabled={status !== "ready" || pageCount === 0 || resumePromptOpen}
              >
                Go
              </button>
            </form>

            <button
              type="button"
              className="reader-btn reader-btn-bookmark"
              onClick={handleBookmarkPage}
              disabled={status !== "ready" || resumePromptOpen}
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

      {book && resumePromptOpen
        ? createPortal(
            <div
              className="reader-resume-backdrop"
              role="presentation"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="reader-resume-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reader-resume-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h2 id="reader-resume-title" className="reader-resume-title">
                  How would you like to read?
                </h2>
                <p className="reader-resume-lede">
                  {(() => {
                    const n = getBookmarkIndices(book.id).length;
                    const pos = getReadingPosition(book.id);
                    const parts: string[] = [];
                    if (n > 0) parts.push(`${n} saved bookmark${n === 1 ? "" : "s"}`);
                    if (pos !== null && pos > 0) {
                      parts.push(`last session around page ${pos + 1}`);
                    }
                    return parts.length > 0 ? parts.join(" · ") : "You have saved progress for this title.";
                  })()}
                </p>
                <div className="reader-resume-actions">
                  <button
                    type="button"
                    className="reader-resume-btn reader-resume-btn--primary"
                    onClick={() => {
                      resumeFromStartRef.current = false;
                      setResumePromptOpen(false);
                    }}
                  >
                    Continue
                  </button>
                  <button
                    type="button"
                    className="reader-resume-btn reader-resume-btn--secondary"
                    onClick={() => {
                      resumeFromStartRef.current = true;
                      setReadingPosition(book.id, 0);
                      setResumePromptOpen(false);
                    }}
                  >
                    Start from the beginning
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
