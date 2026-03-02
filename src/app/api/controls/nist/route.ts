import { NextResponse } from "next/server";
import { db } from "@/db";
import { controls } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

const TITLE_MAX_LEN = 120;

/** Detect stored title that is document/source metadata rather than the control requirement (e.g. "CMMC Assessment Guide - Level 2 | Version 2.13 92"). */
function isDocumentMetadataTitle(title: string | null): boolean {
  if (!title || !title.trim()) return true;
  const t = title.trim();
  if (/CMMC Assessment Guide/i.test(t)) return true;
  if (/Version\s+[\d.]+(\s+\d+)?$/i.test(t)) return true;
  if (/^\d+$/.test(t) || /[\s|]\d{2,}$/.test(t)) return true;
  return false;
}

/** Derive a short display title from NIST requirement text (first sentence). */
function titleFromNistExactText(text: string | null): string | null {
  if (!text || !text.trim()) return null;
  const firstLine = text.split("\n")[0].trim();
  if (!firstLine) return text.trim().slice(0, TITLE_MAX_LEN) || null;
  const firstSentence = firstLine.split(/[.;](?=\s|$)/)[0].trim() || firstLine;
  return firstSentence.slice(0, TITLE_MAX_LEN) || null;
}

/** Return the control display title: prefer stored title unless it looks like wrong field (document metadata), then use nistExactText. */
function getControlDisplayTitle(row: { title: string | null; nistExactText: string | null }, fallbackId: string): string {
  if (!isDocumentMetadataTitle(row.title)) return row.title!.trim();
  const fromNist = titleFromNistExactText(row.nistExactText);
  return fromNist ?? row.title?.trim() ?? fallbackId;
}

/**
 * GET /api/controls/nist — returns control ID, title, nistExactText, nistDiscussionGuidance for all 110 controls (Wizard).
 * Title is normalized: when the stored title is document/source metadata (e.g. "CMMC Assessment Guide - Level 2 | Version 2.13 92"),
 * the API derives the display title from nistExactText (first sentence) so UIs show the actual control requirement.
 */
export async function GET() {
  try {
    await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const rows = await db
      .select({
        controlId: controls.controlId,
        title: controls.title,
        nistExactText: controls.nistExactText,
        nistDiscussionGuidance: controls.nistDiscussionGuidance,
      })
      .from(controls)
      .where(inArray(controls.controlId, ALL_CONTROL_IDS));

    const byId = Object.fromEntries(rows.map((r) => [r.controlId, r]));
    const result = ALL_CONTROL_IDS.map((id) => {
      const row = byId[id];
      if (!row) return { controlId: id, title: id, nistExactText: null, nistDiscussionGuidance: null };
      const title = getControlDisplayTitle(row, id);
      return { controlId: row.controlId, title, nistExactText: row.nistExactText, nistDiscussionGuidance: row.nistDiscussionGuidance };
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
