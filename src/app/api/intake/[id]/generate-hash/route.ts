import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeFiles, intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { sha256Hex } from "@/lib/intake/manifest";
import { transitionIntakeStatus } from "@/lib/intake/service";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const fileId = String(body.fileId ?? "");
    if (!fileId) return NextResponse.json({ error: "fileId is required" }, { status: 400 });

    const [request] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!["Scan Clean", "Hash Generated", "Ready for Vault Import", "Exception"].includes(request.status)) {
      return NextResponse.json(
        { error: "Hash generation is not allowed in the current status" },
        { status: 409 },
      );
    }

    const fileRows = await db
      .select()
      .from(intakeFiles)
      .where(and(eq(intakeFiles.id, fileId), eq(intakeFiles.intakeRequestId, request.id)))
      .limit(1);
    const file = fileRows[0];
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });
    if (file.malwareScanStatus !== "clean") {
      return NextResponse.json(
        { error: "Hash generation requires clean malware scan status" },
        { status: 409 },
      );
    }

    const providedHash = String(body.sha256Hash ?? "").trim().toLowerCase();
    const computedHash = sha256Hex(
      `${request.intakeTransactionId}|${file.originalFilename}|${file.fileSize ?? 0}|${file.uploadTimestamp?.toISOString() ?? ""}`,
    );
    const finalHash =
      providedHash && /^[a-f0-9]{64}$/.test(providedHash) ? providedHash : computedHash;

    const [updated] = await db
      .update(intakeFiles)
      .set({
        sha256Hash: finalHash,
        hashGeneratedBy: (body.hashGeneratedBy as string | undefined) ?? "codex_control_plane",
        hashGeneratedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(intakeFiles.id, file.id))
      .returning();

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Hash Generated",
      details: { fileId: file.id, sha256Hash: finalHash },
    });
    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Ready for Vault Import",
      details: { fileId: file.id },
    });

    return NextResponse.json({ file: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
