import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeFiles, intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
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
    if (!["Uploaded", "Scan Pending", "Scan Clean", "Scan Failed", "Quarantined"].includes(request.status)) {
      return NextResponse.json(
        { error: "Scan status cannot be updated in the current status" },
        { status: 409 },
      );
    }

    const scanStatus = String(body.scanStatus ?? "pending").toLowerCase();
    if (!["pending", "clean", "failed", "quarantined", "unknown"].includes(scanStatus)) {
      return NextResponse.json({ error: "Invalid scanStatus" }, { status: 400 });
    }

    const [file] = await db
      .update(intakeFiles)
      .set({
        malwareScanStatus: scanStatus as never,
        malwareScanTimestamp: new Date(),
        malwareScanResultReference:
          (body.scanReference as string | undefined) ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(eq(intakeFiles.id, fileId), eq(intakeFiles.intakeRequestId, request.id)),
      )
      .returning();
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

    const statusMap: Record<string, "Scan Pending" | "Scan Clean" | "Scan Failed" | "Quarantined"> = {
      pending: "Scan Pending",
      clean: "Scan Clean",
      failed: "Scan Failed",
      quarantined: "Quarantined",
      unknown: "Scan Pending",
    };

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: statusMap[scanStatus],
      details: {
        fileId: file.id,
        malwareScanStatus: scanStatus,
      },
    });

    return NextResponse.json({ file });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
