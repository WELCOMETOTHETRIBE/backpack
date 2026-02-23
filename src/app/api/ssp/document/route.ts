import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlRecords, controls } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

/**
 * GET /api/ssp/document — live SSP built from all 110 control records (control ID, title, governance + technical narrative).
 * Returns Markdown. Single source for the current SSP.
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const records = await db
      .select({
        controlId: controlRecords.controlId,
        title: controls.title,
        governanceNarrative: controlRecords.governanceNarrative,
        technicalNarrative: controlRecords.technicalNarrative,
        implementationStatus: controlRecords.implementationStatus,
      })
      .from(controlRecords)
      .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
      .where(eq(controlRecords.organizationId, orgId));

    const byId: Record<string, (typeof records)[0]> = {};
    for (const r of records) byId[r.controlId] = r;

    const lines: string[] = [
      "# System Security Plan",
      "",
      "Generated from control records. One section per NIST SP 800-171 Rev 2 control.",
      "",
      "---",
      "",
    ];

    for (const controlId of ALL_CONTROL_IDS) {
      const r = byId[controlId];
      const title = r?.title ?? controlId;
      const gov = r?.governanceNarrative?.trim() ?? "";
      const tech = r?.technicalNarrative?.trim() ?? "";
      const status = r?.implementationStatus ?? "not_started";

      lines.push(`## ${controlId} — ${title}`);
      lines.push("");
      lines.push(`**Status:** ${status}`);
      lines.push("");
      if (gov) {
        lines.push("### Governance narrative");
        lines.push("");
        lines.push(gov);
        lines.push("");
      }
      if (tech) {
        lines.push("### Technical narrative");
        lines.push("");
        lines.push(tech);
        lines.push("");
      }
      if (!gov && !tech) lines.push("*No narrative yet.*");
      lines.push("");
      lines.push("---");
      lines.push("");
    }

    const markdown = lines.join("\n");
    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": 'inline; filename="SSP_Document.md"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
