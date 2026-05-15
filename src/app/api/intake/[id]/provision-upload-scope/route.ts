import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeAccessGrants, intakeRequests } from "@/db/schema";
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

    const [request] = await db
      .select()
      .from(intakeRequests)
      .where(and(eq(intakeRequests.id, id), eq(intakeRequests.organizationId, orgId)))
      .limit(1);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const accessMethod = String(body.accessMethod ?? "ENTRA_B2B");
    if (!["ENTRA_B2B", "USER_DELEGATION_SAS"].includes(accessMethod)) {
      return NextResponse.json({ error: "Invalid accessMethod" }, { status: 400 });
    }
    const accessScope = String(body.accessScope ?? "").trim();
    if (!accessScope) {
      return NextResponse.json({ error: "accessScope is required" }, { status: 400 });
    }

    const accessExpiresAt = body.accessExpiresAt
      ? new Date(String(body.accessExpiresAt))
      : null;
    if (accessExpiresAt && Number.isNaN(accessExpiresAt.getTime())) {
      return NextResponse.json({ error: "Invalid accessExpiresAt" }, { status: 400 });
    }
    if (accessMethod === "USER_DELEGATION_SAS" && accessExpiresAt) {
      const hours = (accessExpiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hours <= 0 || hours > 24) {
        return NextResponse.json(
          { error: "SAS fallback must expire within 24 hours" },
          { status: 400 },
        );
      }
    }

    const rawToken = typeof body.ephemeralToken === "string" ? body.ephemeralToken : null;
    const tokenReferenceHash = rawToken ? sha256Hex(rawToken) : null;

    const [grant] = await db
      .insert(intakeAccessGrants)
      .values({
        intakeRequestId: request.id,
        accessMethod: accessMethod as never,
        accessScope,
        authorizationBasis:
          (body.authorizationBasis as string | undefined) ?? request.authorizationBasis,
        accessGrantedAt: new Date(),
        accessExpiresAt,
        tokenReferenceHash,
        notes: (body.notes as string | undefined) ?? null,
      })
      .returning();

    await db
      .update(intakeRequests)
      .set({
        uploadMethod: accessMethod as never,
        updatedAt: new Date(),
      })
      .where(eq(intakeRequests.id, request.id));

    if (request.status === "Draft") {
      await transitionIntakeStatus({
        intakeRequestId: request.id,
        orgId,
        actorUserId: user.id ?? null,
        nextStatus: "Pending Authorization",
      });
    }

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Upload Scope Provisioned",
      details: { accessMethod, accessScope },
    });

    await transitionIntakeStatus({
      intakeRequestId: request.id,
      orgId,
      actorUserId: user.id ?? null,
      nextStatus: "Awaiting Upload",
      details: { accessMethod, accessScope },
    });

    return NextResponse.json({
      accessGrant: grant,
      senderInstructions: {
        intakeTransactionId: request.intakeTransactionId,
        uploadMethod: accessMethod,
        uploadScope: accessScope,
        expiresAt: grant.accessExpiresAt,
        senderGuidance:
          "Do not email CUI. Use only this upload path. Upload only authorized project files. Preserve markings and notify MacTech after upload.",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
