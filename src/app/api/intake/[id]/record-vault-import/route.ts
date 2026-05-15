import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeFiles, intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { transitionIntakeStatus } from "@/lib/intake/service";
import { sha256Hex } from "@/lib/intake/manifest";

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
    if (!["Ready for Vault Import", "Imported to Vault", "Exception"].includes(request.status)) {
      return NextResponse.json(
        { error: "Vault import cannot be recorded in the current status" },
        { status: 409 },
      );
    }

    const existingFiles = await db
      .select()
      .from(intakeFiles)
      .where(and(eq(intakeFiles.id, fileId), eq(intakeFiles.intakeRequestId, request.id)))
      .limit(1);
    const fileToImport = existingFiles[0];
    if (!fileToImport) return NextResponse.json({ error: "File not found" }, { status: 404 });

    if (fileToImport.malwareScanStatus !== "clean") {
      return NextResponse.json(
        { error: "Vault import requires malware scan status clean" },
        { status: 409 },
      );
    }
    if (!fileToImport.sha256Hash) {
      return NextResponse.json(
        { error: "Vault import requires SHA-256 hash to be recorded" },
        { status: 409 },
      );
    }

    const [file] = await db
      .update(intakeFiles)
      .set({
        vaultImportStatus: "imported",
        vaultDestinationPathHash: body.vaultDestinationPath
          ? sha256Hex(String(body.vaultDestinationPath))
          : null,
        vaultDestinationPath: body.vaultDestinationPath
          ? `redacted://vault/${sha256Hex(String(body.vaultDestinationPath)).slice(0, 16)}`
          : "redacted://vault/path",
        vaultImportTimestamp: new Date(),
        importedByIdentity:
          (body.importedByIdentity as string | undefined) ?? user.email ?? "unknown",
        updatedAt: new Date(),
      })
      .where(and(eq(intakeFiles.id, fileId), eq(intakeFiles.intakeRequestId, request.id)))
      .returning();
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Imported to Vault",
      details: {
        fileId: file.id,
        vaultImportTimestamp: file.vaultImportTimestamp,
      },
    });

    return NextResponse.json({ file });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
