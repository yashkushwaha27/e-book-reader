import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { BookEntry } from "../../data/books";
import { BOOK_CATALOG } from "../../data/books";
import { listOfflineBookIds } from "../../utils/offlineBookStorage";
import { ROUTES } from "../../routes/routes.constants";
import "./LibraryPage.css";

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

function LibraryCardDescription({
  book,
  onReadMore,
}: {
  book: BookEntry;
  onReadMore: (b: BookEntry) => void;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [book.description]);

  return (
    <div className="library-card-desc-block">
      <p ref={ref} className="library-card-desc">
        {book.description}
      </p>
      {isClamped ? (
        <button
          type="button"
          className="library-card-read-more"
          onClick={() => onReadMore(book)}
        >
          Read more
        </button>
      ) : null}
    </div>
  );
}

export function LibraryPage() {
  const [query, setQuery] = useState("");
  const [descriptionModalBook, setDescriptionModalBook] = useState<BookEntry | null>(null);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const modalCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    void listOfflineBookIds().then((ids) => {
      if (!cancelled) setOfflineIds(new Set(ids));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return BOOK_CATALOG;
    return BOOK_CATALOG.filter((book) => {
      const hay = `${book.title} ${book.description}`;
      return normalize(hay).includes(q);
    });
  }, [query]);

  useEffect(() => {
    if (!descriptionModalBook) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDescriptionModalBook(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [descriptionModalBook]);

  useEffect(() => {
    if (descriptionModalBook) modalCloseRef.current?.focus();
  }, [descriptionModalBook]);

  return (
    <div className="library library-browse">
      <section className="library-browse-top" aria-label="Browse catalog">
        <label className="library-search">
          <span className="sr-only">Search books</span>
          <span className="library-search-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            className="library-search-input"
            placeholder="Search by title, tag, or description…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            autoComplete="off"
          />
        </label>
        <p className="library-browse-hint">
          <Link className="library-inline-link" to={ROUTES.OFFLINE_DATA}>
            Saved books
          </Link>
        </p>
      </section>

      {filtered.length === 0 ? (
        <div className="library-empty-panel">
          <p className="library-empty-title">No book found</p>
          <p className="library-empty">We currently don't have this book in our library. Let me know if you have any suggestions!</p>
          <p className="library-empty">I promise to add it soon! 💋</p>
        </div>
      ) : (
        <ul className="library-grid">
          {filtered.map((book) => (
            <li key={book.id}>
              <article className="library-card">
                <Link
                  className="library-card-hit"
                  to={ROUTES.read(book.id)}
                  aria-labelledby={`lib-card-title-${book.id}`}
                >
                  <span className="sr-only">Open {book.title} in reader</span>
                </Link>
                <div className="library-card-inner">
                  <span className="library-card-spine" aria-hidden />
                  <div className="library-card-body">
                    <div className="library-card-title-row">
                      <h2 id={`lib-card-title-${book.id}`} className="library-card-title">
                        {book.title}
                      </h2>
                      {offlineIds.has(book.id) ? (
                        <span className="library-card-offline-pill" title="Saved on this device for offline reading">
                          Offline
                        </span>
                      ) : null}
                    </div>
                    <LibraryCardDescription book={book} onReadMore={setDescriptionModalBook} />
                  </div>
                  <div className="library-card-footer">
                    <span className="library-card-cta">Open in reader</span>
                    <span className="library-card-arrow" aria-hidden>
                      →
                    </span>
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}

      {descriptionModalBook
        ? createPortal(
            <div
              className="library-modal-root"
              role="presentation"
              onClick={() => setDescriptionModalBook(null)}
            >
              <div
                className="library-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="library-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="library-modal-header">
                  <h2 id="library-modal-title" className="library-modal-title">
                    {descriptionModalBook.title}
                  </h2>
                  <button
                    ref={modalCloseRef}
                    type="button"
                    className="library-modal-close"
                    aria-label="Close description"
                    onClick={() => setDescriptionModalBook(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="library-modal-body">{descriptionModalBook.description}</p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
