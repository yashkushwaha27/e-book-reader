import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { getBookById } from "../../data/books";
import {
  clearAllOfflineBooks,
  listOfflineBookIds,
  removeOfflineBook,
} from "../../utils/offlineBookStorage";
import { ROUTES } from "../../routes/routes.constants";
import "./OfflineDataPage.css";

export function OfflineDataPage() {
  const [bookIds, setBookIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const refreshIds = useCallback(async () => {
    const ids = await listOfflineBookIds();
    setBookIds(ids);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void refreshIds().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [refreshIds]);

  useEffect(() => {
    if (bookIds.length === 0) setConfirmOpen(false);
  }, [bookIds.length]);

  const handleRemoveOne = async (bookId: string) => {
    const book = getBookById(bookId);
    const label = book?.title ?? `“${bookId}”`;
    setRemovingId(bookId);
    try {
      await removeOfflineBook(bookId);
      await refreshIds();
      toast.success(`Removed ${label} from offline storage on this device.`, {
        toastId: `offline-removed-${bookId}`,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not remove this book.", {
        toastId: `offline-remove-err-${bookId}`,
      });
    } finally {
      setRemovingId(null);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearAllOfflineBooks();
      await refreshIds();
      setConfirmOpen(false);
      toast.success("All books saved for offline reading were removed from this device.", {
        toastId: "offline-cleared-all",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not clear saved books.", {
        toastId: "offline-clear-all-err",
      });
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="offline-data">
      <header className="offline-data-header">
        <p className="offline-data-eyebrow">Privacy &amp; storage</p>
        <h1 className="offline-data-title">Offline books</h1>
        <p className="offline-data-lede">
          <Link className="offline-data-back" to={ROUTES.LIBRARY}>
            ← Back to library
          </Link>
        </p>
      </header>

      <section className="offline-data-panel" aria-labelledby="offline-data-list-heading">
        <h2 id="offline-data-list-heading" className="offline-data-list-heading">
          Saved on this device
        </h2>
        {loading ? (
          <p className="offline-data-muted">Loading…</p>
        ) : bookIds.length === 0 ? (
          <p className="offline-data-muted">No books are stored for offline reading yet.</p>
        ) : (
          <ul className="offline-data-list">
            {bookIds.map((id) => {
              const book = getBookById(id);
              const label = book?.title ?? `Unknown book (${id})`;
              const busy = removingId === id;
              return (
                <li key={id} className="offline-data-item">
                  <span className="offline-data-item-title">{label}</span>
                  <button
                    type="button"
                    className="offline-data-item-remove"
                    onClick={() => void handleRemoveOne(id)}
                    disabled={busy || clearing}
                    aria-label={`Remove ${label} from offline storage`}
                  >
                    {busy ? "Removing…" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!loading && bookIds.length > 0 ? (
        <section className="offline-data-danger" aria-labelledby="offline-data-clear-heading">
          <h2 id="offline-data-clear-heading" className="offline-data-danger-title">
            Clear all saved books
          </h2>
          <p className="offline-data-danger-text">
            You won&apos;t be able to read these titles offline until you download and save them
            again while online.
          </p>
          {!confirmOpen ? (
            <button
              type="button"
              className="offline-data-clear-btn"
              onClick={() => {
                setConfirmOpen(true);
              }}
              disabled={clearing || removingId !== null}
            >
              Remove all saved books
            </button>
          ) : (
            <div className="offline-data-confirm" role="group" aria-label="Confirm clear storage">
              <p className="offline-data-confirm-text">Remove every book stored for offline reading?</p>
              <div className="offline-data-confirm-actions">
                <button
                  type="button"
                  className="offline-data-confirm-cancel"
                  onClick={() => setConfirmOpen(false)}
                  disabled={clearing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="offline-data-confirm-delete"
                  onClick={handleClearAll}
                  disabled={clearing}
                >
                  {clearing ? "Removing…" : "Remove all"}
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
