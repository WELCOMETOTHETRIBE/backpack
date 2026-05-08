/**
 * Control display title normalization for NIST 800-171 controls.
 * Used by GET /api/controls/nist and by validate-control-titles script.
 * When the DB title is wrong (metadata, fragment, or too short), derive from nistExactText.
 */

export const TITLE_MAX_LEN = 120;
export const MIN_TITLE_LENGTH = 30;

/** Detect stored title that is wrong: document metadata, or a fragment (e.g. "name identifier"). */
export function isBadTitle(title: string | null): boolean {
  if (!title || !title.trim()) return true;
  const t = title.trim();
  if (t.length < MIN_TITLE_LENGTH) return true;
  if (/CMMC Assessment Guide/i.test(t)) return true;
  if (/Version\s+[\d.]+(\s+\d+)?$/i.test(t)) return true;
  if (/^\d+$/.test(t) || /[\s|]\d{2,}$/.test(t)) return true;
  return false;
}

/** Derive a short display title from NIST requirement text (first substantive sentence). Skips leading metadata lines. */
export function titleFromNistExactText(text: string | null): string | null {
  if (!text || !text.trim()) return null;
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  let firstLine = lines[0];
  for (const line of lines) {
    if (line.length >= MIN_TITLE_LENGTH && !isBadTitle(line)) {
      firstLine = line;
      break;
    }
  }
  if (!firstLine) return null;
  const firstSentence = firstLine.split(/[.;](?=\s|$)/)[0].trim() || firstLine;
  const candidate = firstSentence.slice(0, TITLE_MAX_LEN) || null;
  return candidate && !isBadTitle(candidate) ? candidate : null;
}

/** Return the control display title: prefer stored title unless it's bad, then use nistExactText; never return metadata. */
export function getControlDisplayTitle(
  row: { title: string | null; nistExactText: string | null },
  fallbackId: string
): string {
  if (!isBadTitle(row.title)) return row.title!.trim();
  let fromNist = titleFromNistExactText(row.nistExactText);
  if (fromNist && isBadTitle(fromNist)) fromNist = null;
  if (fromNist) return fromNist;
  return fallbackId;
}
