import { PageFlip } from "page-flip";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  bookNeedsDriveProxyNote,
  bookNeedsRemoteFetchProxyNote,
  getBookById,
  resolveBookFetchUrl,
} from "../../data/books";
import { htmlToPageElements } from "../../lib/htmlToPages";
import { addBookmark, getBookmarkIndices, removeBookmark } from "../../lib/readerBookmarks";
import { ROUTES } from "../../routes/routes.constants";
import "./BookReaderPage.css";

type ReaderStatus = "loading" | "ready" | "error";

type HtmlCache = { bookId: string; html: string };

async function waitAnimationFrames(count: number): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }
}

/** Base aspect for StPageFlip — rendered face size comes from the layout probe. */
const PAGE_FLIP_FACE_WIDTH = 640;
const PAGE_FLIP_FACE_HEIGHT = 920;

export function BookReaderPage() {
  const { bookId } = useParams();
  const [searchParams] = useSearchParams();
  const skin = searchParams.get("skin") ?? "classic";

  const mountRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<PageFlip | null>(null);
  const htmlCacheRef = useRef<HtmlCache | null>(null);

  const [status, setStatus] = useState<ReaderStatus>("loading");
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

  const syncPageLabel = useCallback(() => {
    const pf = flipRef.current;
    if (!pf) return;
    const idx = pf.getCurrentPageIndex();
    const total = pf.getPageCount();
    setPageLabel(`${idx + 1} / ${total}`);
    setPageCount(total);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    flipRef.current?.destroy();
    flipRef.current = null;
    mount.innerHTML = "";

    if (!book || !bookId) {
      setStatus("error");
      setErrorText("That title is not in the catalog yet.");
      return;
    }

    let cancelled = false;

    const flipSettings: Record<string, unknown> = {
      width: PAGE_FLIP_FACE_WIDTH,
      height: PAGE_FLIP_FACE_HEIGHT,
      size: "stretch",
      minWidth: 200,
      maxWidth: 3200,
      minHeight: 240,
      maxHeight: 2400,
      showCover: false,
      drawShadow: true,
      flippingTime: 880,
      usePortrait: false,
      startZIndex: 0,
      autoSize: true,
      disableFlipByClick: true,
      useMouseEvents: true,
      showPageCorners: true,
    };

    (async () => {
      const cacheHit = htmlCacheRef.current?.bookId === book.id;
      if (!cacheHit) {
        setStatus("loading");
        setErrorText("");
      }

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
        if (cancelled) return;

        await waitAnimationFrames(2);
        if (cancelled) return;

        const blockProbe = document.createElement("div");
        blockProbe.style.width = "100%";
        mount.appendChild(blockProbe);

        const dummy = document.createElement("div");
        dummy.className = "book-page";
        dummy.innerHTML = "<p style=\"margin:0\">&nbsp;</p>";

        const probe = new PageFlip(blockProbe, flipSettings);
        probe.loadFromHTML([dummy]);
        await waitAnimationFrames(3);

        if (cancelled) {
          probe.destroy();
          mount.innerHTML = "";
          return;
        }

        const rect = probe.getRender().getRect();
        probe.destroy();
        mount.innerHTML = "";

        let pageW = Math.max(220, Math.floor(rect.pageWidth));
        let pageH = Math.max(280, Math.floor(rect.height));

        let pages = htmlToPageElements(html, {
          pageWidthPx: pageW,
          pageHeightPx: pageH,
          fontScale: 1,
        });

        const block = document.createElement("div");
        block.style.width = "100%";
        mount.appendChild(block);

        const pf = new PageFlip(block, flipSettings);
        pf.loadFromHTML(pages);
        flipRef.current = pf;
        pf.on("flip", () => {
          syncPageLabel();
        });

        await waitAnimationFrames(3);
        if (cancelled) {
          pf.destroy();
          mount.innerHTML = "";
          return;
        }
        pf.update();
        const settled = pf.getRender().getRect();
        const settledW = Math.max(220, Math.floor(settled.pageWidth));
        const settledH = Math.max(280, Math.floor(settled.height));
        if (Math.abs(settledW - pageW) > 3 || Math.abs(settledH - pageH) > 3) {
          pageW = settledW;
          pageH = settledH;
          pages = htmlToPageElements(html, {
            pageWidthPx: pageW,
            pageHeightPx: pageH,
            fontScale: 1,
          });
          pf.updateFromHtml(pages);
        }

        syncPageLabel();
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        flipRef.current?.destroy();
        flipRef.current = null;
        mount.innerHTML = "";
        if (htmlCacheRef.current?.bookId === book.id) {
          htmlCacheRef.current = null;
        }
        setStatus("error");
        setErrorText(err instanceof Error ? err.message : "Failed to open book.");
      }
    })();

    return () => {
      cancelled = true;
      flipRef.current?.destroy();
      flipRef.current = null;
      mount.innerHTML = "";
    };
  }, [book, bookId, syncPageLabel]);

  const handleNext = useCallback(() => {
    flipRef.current?.turnToNextPage();
    requestAnimationFrame(() => {
      syncPageLabel();
    });
  }, [syncPageLabel]);

  const handlePrev = useCallback(() => {
    flipRef.current?.turnToPrevPage();
    requestAnimationFrame(() => {
      syncPageLabel();
    });
  }, [syncPageLabel]);

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
    requestAnimationFrame(() => {
      syncPageLabel();
    });
  }, [jumpInput, status, syncPageLabel]);

  const handleBookmarkPage = useCallback(() => {
    const pf = flipRef.current;
    if (!book?.id || !pf || status !== "ready") return;
    const idx = pf.getCurrentPageIndex();
    setBookmarks(addBookmark(book.id, idx));
    setJumpHint("");
  }, [book?.id, status]);

  const handleGoToBookmark = useCallback(
    (pageIndex: number) => {
      const pf = flipRef.current;
      if (!pf || status !== "ready") return;
      const total = pf.getPageCount();
      if (pageIndex < 0 || pageIndex >= total) return;
      pf.turnToPage(pageIndex);
      requestAnimationFrame(() => {
        syncPageLabel();
      });
    },
    [status, syncPageLabel],
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
          <Link className="reader-back" to={ROUTES.HOME}>
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

        {book && bookNeedsRemoteFetchProxyNote(book) && !bookNeedsDriveProxyNote(book) ? (
          <p className="reader-banner">
            This title loads from Project Gutenberg. For production builds, add the same
            kind of host proxy you use in dev (
            <code className="reader-inline-code">/gutenberg-proxy</code>) on your server,
            or mirror the HTML where your app can fetch it.
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
              <div className="reader-stage" aria-busy={status === "loading"}>
                {status === "loading" ? (
                  <div className="reader-loading" aria-hidden>
                    <span className="reader-loading-dot" />
                    <span className="reader-loading-dot" />
                    <span className="reader-loading-dot" />
                  </div>
                ) : null}
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

          {bookmarks.length > 0 ? (
            <div className="reader-bookmarks" aria-label="Saved bookmarks">
              <span className="reader-bookmarks-title">Bookmarks</span>
              <ul className="reader-bookmarks-list">
                {bookmarks.map((idx) => (
                  <li key={idx}>
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

          {jumpHint ? (
            <p id="reader-jump-hint" className="reader-jump-hint" role="status">
              {jumpHint}
            </p>
          ) : null}

          <p className="reader-hint">
            Use the buttons or bookmarks to change pages. Drag from a page corner for the page-turn
            animation.
          </p>
        </footer>
      </div>
    </div>
  );
}
