import { getBookmarkIndices } from "./readerBookmarks";
import { getReadingPosition } from "./readerProgress";

/** Whether to show “start vs continue” when opening the reader. */
export function shouldOfferResumePrompt(bookId: string): boolean {
  if (getBookmarkIndices(bookId).length > 0) return true;
  const pos = getReadingPosition(bookId);
  return pos !== null && pos > 0;
}

/** Target face index when user chooses Continue (before totalPages clamp). */
export function getResumeTargetFaceIndex(bookId: string): number | null {
  const saved = getReadingPosition(bookId);
  if (saved !== null && saved > 0) return saved;
  const bm = getBookmarkIndices(bookId);
  if (bm.length > 0) return Math.min(...bm);
  return null;
}
