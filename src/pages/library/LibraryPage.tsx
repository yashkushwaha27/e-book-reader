import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BOOK_CATALOG } from "../../data/books";
import { ROUTES } from "../../routes/routes.constants";
import "./LibraryPage.css";

function normalize(s: string): string {
  return s.toLowerCase().trim();
}

export function LibraryPage() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return BOOK_CATALOG;
    return BOOK_CATALOG.filter((book) => {
      const hay = `${book.title} ${book.description} ${book.tags.join(" ")}`;
      return normalize(hay).includes(q);
    });
  }, [query]);

  return (
    <div className="library">
      <section className="library-hero">
        <p className="library-eyebrow">Digital shelf</p>
        <h1 className="library-title">Curated for immersive reading</h1>
        <p className="library-lede">
          Browse the catalog and open any title in the page-flip reader. Add or edit
          entries in{" "}
          <code className="inline-code">src/data/books.ts</code>.
        </p>
        <p className="library-sub">
          <Link className="library-inline-link" to={ROUTES.TEMPLATES}>
            Templates &amp; remote sources
          </Link>
          <span className="library-sub-dot" aria-hidden>
            ·
          </span>
          <span>Click a book card to start reading.</span>
        </p>
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
      </section>

      {filtered.length === 0 ? (
        <div className="library-empty-panel">
          <p className="library-empty-title">No matches</p>
          <p className="library-empty">Try a different search term.</p>
        </div>
      ) : (
        <ul className="library-grid">
          {filtered.map((book) => (
            <li key={book.id}>
              <Link className="library-card" to={ROUTES.read(book.id)}>
                <span className="library-card-spine" aria-hidden />
                <div className="library-card-body">
                  <h2 className="library-card-title">{book.title}</h2>
                  <p className="library-card-desc">{book.description}</p>
                  <ul className="library-tags" aria-label="Tags">
                    {book.tags.map((tag) => (
                      <li key={tag} className="library-tag">
                        {tag}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="library-card-footer">
                  <span className="library-card-cta">Open in reader</span>
                  <span className="library-card-arrow" aria-hidden>
                    →
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
