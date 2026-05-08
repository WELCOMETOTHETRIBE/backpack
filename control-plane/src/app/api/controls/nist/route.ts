import { NextResponse } from "next/server";
import { db } from "@/db";
import { controls } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { getControlDisplayTitle } from "@/lib/controls/display-title";

/**
 * GET /api/controls/nist — returns control ID, title, nistExactText, nistDiscussionGuidance for all 110 controls (Wizard).
 * Title is normalized: when the stored title is wrong (document metadata, or a short fragment like "name identifier"),
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
