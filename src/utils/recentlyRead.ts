const STORAGE_KEY_V2 = "ebook-reader.recently-read.v2";
const STORAGE_KEY_V1 = "ebook-reader.recently-read.v1";
const MAX = 8;

export type RecentReadEntry = {
  bookId: string;
  /** Unix ms when the book was last opened. */
  readAt: number;
};

function readRawV1(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return null;
  }
}

function migrateV1ToV2(ids: string[]): RecentReadEntry[] {
  return ids.map((bookId, i) => ({
    bookId,
    readAt: Date.now() - i * 60_000,
  }));
}

function readEntries(): RecentReadEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      const out: RecentReadEntry[] = [];
      for (const row of parsed) {
        if (!row || typeof row !== "object") continue;
        const bookId = (row as { bookId?: unknown }).bookId;
        const readAt = (row as { readAt?: unknown }).readAt;
        if (typeof bookId !== "string" || bookId.length === 0) continue;
        if (typeof readAt !== "number" || !Number.isFinite(readAt)) continue;
        out.push({ bookId, readAt });
      }
      return out;
    }
    const legacy = readRawV1();
    if (legacy && legacy.length > 0) {
      const migrated = migrateV1ToV2(legacy);
      writeEntries(migrated);
      localStorage.removeItem(STORAGE_KEY_V1);
      return migrated;
    }
  } catch {
    return [];
  }
  return [];
}

function writeEntries(entries: RecentReadEntry[]) {
  localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(entries));
}

export function recordRecentBook(bookId: string): void {
  const prev = readEntries().filter((e) => e.bookId !== bookId);
  const next: RecentReadEntry[] = [{ bookId, readAt: Date.now() }, ...prev].slice(0, MAX);
  writeEntries(next);
}

export function getRecentlyReadEntries(): RecentReadEntry[] {
  return readEntries();
}
