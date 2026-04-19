/**
 * Extract a Google Drive file id from common share / open URL shapes.
 */
export function extractGoogleDriveFileId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const openMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  const driveMatch = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (driveMatch) return driveMatch[1];

  if (/^[a-zA-Z0-9_-]{10,}$/.test(trimmed)) return trimmed;

  return null;
}

export function buildDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
}
