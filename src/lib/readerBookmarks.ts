const STORAGE_KEY = "ebook-reader.bookmarks.v1";

type Store = Record<string, number[]>;

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

export function getBookmarkIndices(bookId: string): number[] {
  const store = readStore();
  const list = store[bookId];
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((n) => Number.isInteger(n) && n >= 0))].sort((a, b) => a - b);
}

export function addBookmark(bookId: string, pageIndex: number): number[] {
  const store = readStore();
  const prev = new Set(store[bookId] ?? []);
  prev.add(pageIndex);
  const next = [...prev].sort((a, b) => a - b);
  store[bookId] = next;
  writeStore(store);
  return next;
}

export function removeBookmark(bookId: string, pageIndex: number): number[] {
  const store = readStore();
  const prev = store[bookId] ?? [];
  const next = prev.filter((p) => p !== pageIndex);
  if (next.length === 0) delete store[bookId];
  else store[bookId] = next;
  writeStore(store);
  return next;
}
