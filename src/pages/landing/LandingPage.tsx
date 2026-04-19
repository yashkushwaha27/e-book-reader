import { Link } from "react-router-dom";
import { BOOK_CATALOG } from "../../data/books";
import { formatRecentReadTime } from "../../lib/formatRecentReadTime";
import { getRecentlyReadEntries } from "../../lib/recentlyRead";
import { ROUTES } from "../../routes/routes.constants";
import "../library/LibraryPage.css";

export function LandingPage() {
  const recentRows = getRecentlyReadEntries()
    .map((entry) => {
      const book = BOOK_CATALOG.find((b) => b.id === entry.bookId);
      if (!book) return null;
      return { book, readAt: entry.readAt };
    })
    .filter((row): row is { book: (typeof BOOK_CATALOG)[number]; readAt: number } => row != null);

  return (
    <div className="library library-landing">
      <section className="library-hero library-landing-hero">
        <p className="library-eyebrow">Digital shelf</p>
        <h1 className="library-title">Curated for immersive reading</h1>
        <div className="library-landing-actions">
          <Link to={ROUTES.LIBRARY} className="library-view-btn">
            View library
          </Link>
        </div>
      </section>

      {recentRows.length > 0 ? (
        <section className="library-recent" aria-label="Recently read">
          <h2 className="library-recent-title">Recently read</h2>
          <ul className="library-recent-list">
            {recentRows.map(({ book, readAt }) => (
              <li key={book.id}>
                <Link className="library-recent-card" to={ROUTES.read(book.id)}>
                  <span className="library-recent-card-main">
                    <span className="library-recent-card-title">{book.title}</span>
                    <time className="library-recent-card-time" dateTime={new Date(readAt).toISOString()}>
                      {formatRecentReadTime(readAt)}
                    </time>
                  </span>
                  <span className="library-recent-card-arrow" aria-hidden>
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
