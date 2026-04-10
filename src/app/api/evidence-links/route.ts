import { NextResponse } from "next/server";
import { db } from "@/db";
import { controlEvidenceLinks, controlRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/evidence-links?controlRecordId=<uuid>
 * Returns all evidence metadata links for a control record.
 */
export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const { searchParams } = new URL(req.url);
    const controlRecordId = searchParams.get("controlRecordId");
    if (!controlRecordId) {
      return NextResponse.json({ error: "controlRecordId required" }, { status: 400 });
    }

    const links = await db
      .select()
      .from(controlEvidenceLinks)
      .where(
        and(
          eq(controlEvidenceLinks.organizationId, orgId),
          eq(controlEvidenceLinks.controlRecordId, controlRecordId)
        )
      )
      .orderBy(controlEvidenceLinks.linkedAt);

    return NextResponse.json(links);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}

/**
 * POST /api/evidence-links
 * Creates a new enclave evidence metadata link.
 *
 * ARCHITECTURAL ENFORCEMENT: This route explicitly rejects multipart/form-data.
 * CUI evidence artifacts never transit through this control plane.
 * Only RunId + file path + SHA-256 metadata is accepted.
 */
export async function POST(req: Request) {
  // Hard reject any attempt to upload file data
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      {
        error:
          "File uploads are not permitted on this endpoint. " +
          "This control plane stores only evidence metadata (RunId, file path, SHA-256). " +
          "CUI artifacts must remain in the enclave.",
      },
      { status: 415 }
    );
  }

  try {
    const orgId = await requireOrg();
    // Assessors cannot link evidence
    const user = await requireRole(["Admin", "Compliance"]);

    const body = await req.json();
    const { controlRecordId, runId, filePath, sha256Hash, description, source, expiresAt } = body;

    if (!controlRecordId || !runId || !filePath || !sha256Hash) {
      return NextResponse.json(
        { error: "controlRecordId, runId, filePath, sha256Hash are required" },
        { status: 400 }
      );
    }

    // Verify the control record belongs to this org
    const [record] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.id, controlRecordId),
          eq(controlRecords.organizationId, orgId)
        )
      )
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "Control record not found" }, { status: 404 });
    }

    const [link] = await db
      .insert(controlEvidenceLinks)
      .values({
        organizationId: orgId,
        controlRecordId,
        runId: String(runId),
        filePath: String(filePath),
        sha256Hash: String(sha256Hash),
        description: description ? String(description) : null,
        source: source ? String(source) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        linkedBy: user.id ?? null,
      })
      .returning();

    return NextResponse.json(link, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Server error";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
