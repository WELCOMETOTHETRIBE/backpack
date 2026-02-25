import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  controlRecords,
  governanceControlLinks,
  governanceDocuments,
  governanceEvidenceItems,
  governanceRegisterEntries,
  governanceRegisters,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

type LinkType = "document" | "register_entry" | "evidence";

/**
 * POST /api/governance/controls/[controlId]/links
 * Body: { linkType: "document" | "register_entry" | "evidence", linkId: string }
 * Creates a link from this control to the given artifact (if it exists and belongs to org).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ controlId: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { controlId } = await params;
    if (!controlId) return NextResponse.json({ error: "controlId required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const linkType = body.linkType as LinkType | undefined;
    const linkId = body.linkId as string | undefined;
    if (!linkType || !linkId) {
      return NextResponse.json(
        { error: "linkType and linkId required" },
        { status: 400 }
      );
    }
    const validTypes: LinkType[] = ["document", "register_entry", "evidence"];
    if (!validTypes.includes(linkType)) {
      return NextResponse.json({ error: "Invalid linkType" }, { status: 400 });
    }

    const [record] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      );
    if (!record) return NextResponse.json({ error: "Control not found" }, { status: 404 });

    // Validate that linkId exists and belongs to org
    if (linkType === "document") {
      const [doc] = await db
        .select({ id: governanceDocuments.id })
        .from(governanceDocuments)
        .where(
          and(
            eq(governanceDocuments.organizationId, orgId),
            eq(governanceDocuments.id, linkId)
          )
        );
      if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    } else if (linkType === "evidence") {
      const [ev] = await db
        .select({ id: governanceEvidenceItems.id })
        .from(governanceEvidenceItems)
        .where(
          and(
            eq(governanceEvidenceItems.organizationId, orgId),
            eq(governanceEvidenceItems.id, linkId)
          )
        );
      if (!ev) return NextResponse.json({ error: "Evidence item not found" }, { status: 404 });
    } else if (linkType === "register_entry") {
      const [entry] = await db
        .select({ id: governanceRegisterEntries.id })
        .from(governanceRegisterEntries)
        .innerJoin(governanceRegisters, eq(governanceRegisterEntries.registerId, governanceRegisters.id))
        .where(
          and(
            eq(governanceRegisters.organizationId, orgId),
            eq(governanceRegisterEntries.id, linkId)
          )
        );
      if (!entry) return NextResponse.json({ error: "Register entry not found" }, { status: 404 });
    }

    // Avoid duplicate link
    const [existing] = await db
      .select()
      .from(governanceControlLinks)
      .where(
        and(
          eq(governanceControlLinks.controlRecordId, record.id),
          eq(governanceControlLinks.linkType, linkType),
          eq(governanceControlLinks.linkId, linkId)
        )
      );
    if (existing) {
      return NextResponse.json({ ok: true, id: existing.id });
    }

    const [link] = await db
      .insert(governanceControlLinks)
      .values({
        controlRecordId: record.id,
        linkType,
        linkId,
      })
      .returning();

    return NextResponse.json(link);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create link";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

/**
 * DELETE /api/governance/controls/[controlId]/links
 * Body: { linkId: string } — id of the governance_control_links row to remove
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ controlId: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { controlId } = await params;
    if (!controlId) return NextResponse.json({ error: "controlId required" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const linkRowId = body.linkId as string | undefined;
    if (!linkRowId) {
      return NextResponse.json({ error: "linkId (link row id) required" }, { status: 400 });
    }

    const [record] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      );
    if (!record) return NextResponse.json({ error: "Control not found" }, { status: 404 });

    await db
      .delete(governanceControlLinks)
      .where(
        and(
          eq(governanceControlLinks.id, linkRowId),
          eq(governanceControlLinks.controlRecordId, record.id)
        )
      );

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete link";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
