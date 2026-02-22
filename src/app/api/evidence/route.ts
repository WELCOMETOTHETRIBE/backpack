import { NextResponse } from "next/server";
import { db } from "@/db";
import { evidenceMetadata, evidenceControlLinks } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { searchParams } = new URL(req.url);
    const controlImplementationId = searchParams.get("controlImplementationId");
    const expiring = searchParams.get("expiring") === "true";

    let rows = await db
      .select()
      .from(evidenceMetadata)
      .where(eq(evidenceMetadata.organizationId, orgId));

    if (expiring) {
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);
      rows = rows.filter(
        (r) => r.retentionUntil && new Date(r.retentionUntil) <= in30Days
      );
    }

    if (controlImplementationId) {
      const links = await db
        .select({ evidenceMetadataId: evidenceControlLinks.evidenceMetadataId })
        .from(evidenceControlLinks)
        .where(eq(evidenceControlLinks.controlImplementationId, controlImplementationId));
      const ids = new Set(links.map((l) => l.evidenceMetadataId));
      rows = rows.filter((r) => ids.has(r.id));
    }

    return NextResponse.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "File upload is not allowed. Evidence is metadata only (RunId, path, hash)." },
        { status: 400 }
      );
    }
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const body = await req.json();
    const {
      evidenceId,
      runId,
      artifactFilename,
      storageLocation,
      sha256Hash,
      generatedDate,
      retentionUntil,
      regenerationInstructions,
      controlImplementationIds,
      evidenceType,
    } = body;

    if (!evidenceId || !runId || !artifactFilename || !storageLocation || !generatedDate || !retentionUntil) {
      return NextResponse.json(
        { error: "evidenceId, runId, artifactFilename, storageLocation, generatedDate, retentionUntil required" },
        { status: 400 }
      );
    }
    if (evidenceType === "enclave" && !sha256Hash) {
      return NextResponse.json(
        { error: "SHA-256 hash required for enclave evidence" },
        { status: 400 }
      );
    }

    const [row] = await db
      .insert(evidenceMetadata)
      .values({
        organizationId: orgId,
        evidenceId,
        runId,
        artifactFilename,
        storageLocation,
        sha256Hash: sha256Hash ?? null,
        generatedDate: new Date(generatedDate),
        generatedById: user.id ?? null,
        retentionUntil: new Date(retentionUntil),
        regenerationInstructions: regenerationInstructions ?? null,
      })
      .returning();

    if (row && Array.isArray(controlImplementationIds) && controlImplementationIds.length > 0) {
      await db.insert(evidenceControlLinks).values(
        controlImplementationIds.map((cid: string) => ({
          evidenceMetadataId: row.id,
          controlImplementationId: cid,
        }))
      );
    }

    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: "evidence.create",
      resourceType: "evidence_metadata",
      resourceId: row?.id,
    });
    return NextResponse.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
