import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeFiles, intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  buildAndPersistManifest,
  createIntakeAuditArtifact,
} from "@/lib/intake/service";

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

    const files = await db
      .select()
      .from(intakeFiles)
      .where(eq(intakeFiles.intakeRequestId, request.id));
    if (!files.length && request.status !== "Rejected") {
      return NextResponse.json(
        { error: "Manifest generation requires at least one uploaded file or rejected request" },
        { status: 409 },
      );
    }
    const missingPrereq = files.some(
      (f) => f.malwareScanStatus === "unknown" || !f.sha256Hash,
    );
    if (missingPrereq && request.status !== "Exception" && request.status !== "Rejected") {
      return NextResponse.json(
        { error: "Manifest generation requires scan status and SHA-256 hash for all files" },
        { status: 409 },
      );
    }

    const manifest = await buildAndPersistManifest({
      actor: { orgId, userId: user.id ?? null },
      intakeRequestId: request.id,
      storageLocation:
        (body.storageLocation as string | undefined) ??
        `vault://evidence/intake/${request.intakeTransactionId}/manifest.json`,
      sourceOfTruth:
        (body.sourceOfTruth as string | undefined) ?? "codex_metadata_registry",
    });

    const artifact = await createIntakeAuditArtifact({
      actor: { orgId, userId: user.id ?? null },
      intakeRequestId: request.id,
      artifactType: "manifest",
      artifactName: "Intake Manifest",
      artifactPath: manifest.storageLocation,
      retentionRequirement: "retain_per_contract_and_record_schedule",
      controlFamily: "AU",
      controlId: "3.3.1",
      boundaryLocation: "codex_metadata_only",
      immutableFlag: true,
    });

    return NextResponse.json({ manifest, artifact });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
