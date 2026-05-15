import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeFiles, intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  buildTokenizedObjectAlias,
  transitionIntakeStatus,
} from "@/lib/intake/service";
import { sha256Hex } from "@/lib/intake/manifest";

function redactBlobUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/\?.*$/, "?REDACTED");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const [request] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["Awaiting Upload", "Upload Scope Provisioned", "Uploaded", "Scan Pending"].includes(request.status)) {
      return NextResponse.json(
        { error: "Upload registration is not allowed in the current status" },
        { status: 409 },
      );
    }

    const originalFilename = String(body.originalFilename ?? "").trim();
    if (!originalFilename) {
      return NextResponse.json({ error: "originalFilename is required" }, { status: 400 });
    }
    const { objectAlias, originalFilenameHash } = buildTokenizedObjectAlias({
      intakeTransactionId: request.intakeTransactionId,
      originalFilename,
    });
    const rawBlobPath = (body.blobPath as string | undefined) ?? null;
    const blobPathHash = rawBlobPath ? sha256Hex(rawBlobPath) : null;

    const [file] = await db
      .insert(intakeFiles)
      .values({
        intakeRequestId: request.id,
        originalFilename: objectAlias,
        originalFilenameHash,
        sensitiveFilenameRetained: false,
        storageAccount: (body.storageAccount as string | undefined) ?? null,
        containerName: (body.containerName as string | undefined) ?? null,
        blobPathHash,
        blobPath: blobPathHash ? `redacted://blob/${blobPathHash.slice(0, 16)}` : null,
        blobUrlRedacted: redactBlobUrl((body.blobUrl as string | undefined) ?? null),
        contentType: (body.contentType as string | undefined) ?? null,
        fileSize: Number(body.fileSize ?? 0) || null,
        uploadTimestamp: body.uploadTimestamp
          ? new Date(String(body.uploadTimestamp))
          : new Date(),
        uploadedByIdentity: (body.uploadedByIdentity as string | undefined) ?? null,
        classificationStatus:
          (body.classificationStatus as string | undefined) ?? "pending_review",
      })
      .returning();

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Uploaded",
      details: { fileId: file.id, intakeObjectAlias: file.originalFilename },
    });
    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Scan Pending",
      details: { fileId: file.id },
    });

    return NextResponse.json({ file }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
