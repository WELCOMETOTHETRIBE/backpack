import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import {
  intakeAccessGrants,
  intakeControlMappings,
  intakeEvidenceArtifacts,
  intakeExceptions,
  intakeFiles,
  intakeManifests,
  intakeRequests,
  intakeReviewActions,
} from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { transitionIntakeStatus } from "@/lib/intake/service";
import { INTAKE_STATUSES } from "@/lib/intake/status";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { id } = await params;

    const [request] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [files, grants, reviews, manifests, artifacts, exceptions, mappings] =
      await Promise.all([
        db.select().from(intakeFiles).where(eq(intakeFiles.intakeRequestId, id)),
        db.select().from(intakeAccessGrants).where(eq(intakeAccessGrants.intakeRequestId, id)),
        db.select().from(intakeReviewActions).where(eq(intakeReviewActions.intakeRequestId, id)),
        db.select().from(intakeManifests).where(eq(intakeManifests.intakeRequestId, id)),
        db
          .select()
          .from(intakeEvidenceArtifacts)
          .where(eq(intakeEvidenceArtifacts.intakeRequestId, id)),
        db.select().from(intakeExceptions).where(eq(intakeExceptions.intakeRequestId, id)),
        db.select().from(intakeControlMappings).where(eq(intakeControlMappings.intakeRequestId, id)),
      ]);

    return NextResponse.json({
      item: request,
      files,
      accessGrants: grants,
      reviewActions: reviews,
      manifests,
      evidenceArtifacts: artifacts,
      exceptions,
      controlMappings: mappings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const nextStatus = String(body.status ?? "").trim();
    if (!INTAKE_STATUSES.includes(nextStatus as never)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    const restrictedStatuses = new Set([
      "Uploaded",
      "Scan Pending",
      "Scan Clean",
      "Scan Failed",
      "Quarantined",
      "Hash Generated",
      "Ready for Vault Import",
      "Imported to Vault",
      "Reviewer Approved",
      "Access Revoked",
      "Evidence Package Generated",
      "Closed",
    ]);
    if (restrictedStatuses.has(nextStatus)) {
      return NextResponse.json(
        {
          error:
            "This status must be changed via its dedicated workflow endpoint",
        },
        { status: 400 },
      );
    }

    await transitionIntakeStatus({
      intakeRequestId: id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: nextStatus as never,
      details: {
        reason: (body.reason as string | undefined) ?? null,
      },
    });

    const [updated] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    return NextResponse.json({ item: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = message.startsWith("Invalid status transition") ? 400 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
