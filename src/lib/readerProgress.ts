const STORAGE_KEY = "ebook-reader.reading-position.v1";

type Store = Record<string, number>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Last-opened page as a 0-based StPageFlip face index (same as bookmark indices). */
export function getReadingPosition(bookId: string): number | null {
  const store = readStore();
  const n = store[bookId];
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return null;
  return n;
}

export function setReadingPosition(bookId: string, pageFaceIndex: number): void {
  if (!Number.isInteger(pageFaceIndex) || pageFaceIndex < 0) return;
  const store = readStore();
  store[bookId] = pageFaceIndex;
  writeStore(store);
}
