const DB_NAME = "e-book-reader-offline";
const STORE = "books";
const DB_VERSION = 1;

export type OfflineBookRecord = {
  bookId: string;
  title: string;
  html: string;
  savedAt: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB error"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "bookId" });
      }
    };
  });
}

function reqDone<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export async function saveOfflineBook(
  payload: Pick<OfflineBookRecord, "bookId" | "title" | "html"> & { savedAt?: number },
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const record: OfflineBookRecord = {
    bookId: payload.bookId,
    title: payload.title,
    html: payload.html,
    savedAt: payload.savedAt ?? Date.now(),
  };
  await reqDone(store.put(record));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export async function getOfflineBookHtml(bookId: string): Promise<string | null> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const row = await reqDone(store.get(bookId) as IDBRequest<OfflineBookRecord | undefined>);
  return row?.html ?? null;
}

export async function isBookSavedOffline(bookId: string): Promise<boolean> {
  const html = await getOfflineBookHtml(bookId);
  return html !== null && html.length > 0;
}

export async function listOfflineBookIds(): Promise<string[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  return reqDone(store.getAllKeys() as IDBRequest<string[]>);
}
