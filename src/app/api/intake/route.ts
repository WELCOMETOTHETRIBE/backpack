import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { intakeRequests } from "@/db/schema";
import { requireOrg, requireRole } from "@/lib/auth";
import { nextIntakeTransactionId, validateIntakeForeignKeys } from "@/lib/intake/service";
import { INTAKE_CLASSIFICATIONS } from "@/lib/intake/status";

export async function GET(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    const rows = await db
      .select()
      .from(intakeRequests)
      .where(
        status
          ? and(
              eq(intakeRequests.organizationId, orgId),
              eq(intakeRequests.status, status as never),
            )
          : eq(intakeRequests.organizationId, orgId),
      )
      .orderBy(desc(intakeRequests.createdAt))
      .limit(200);

    return NextResponse.json({ items: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

    const clientCode = String(body.clientCode ?? body.client_code ?? "CLIENT").trim();
    const projectCode = String(body.projectCode ?? body.project_code ?? "PROJECT").trim();
    const expectedClassification = String(
      body.expectedClassification ?? "UNKNOWN",
    ).toUpperCase();
    if (!INTAKE_CLASSIFICATIONS.includes(expectedClassification as never)) {
      return NextResponse.json(
        { error: "expectedClassification invalid" },
        { status: 400 },
      );
    }

    const uploadMethod = (body.uploadMethod as "ENTRA_B2B" | "USER_DELEGATION_SAS" | undefined) ?? null;
    if (uploadMethod && !["ENTRA_B2B", "USER_DELEGATION_SAS"].includes(uploadMethod)) {
      return NextResponse.json({ error: "uploadMethod invalid" }, { status: 400 });
    }

    await validateIntakeForeignKeys({
      orgId,
      clientId: (body.clientId as string | undefined) ?? null,
      projectId: (body.projectId as string | undefined) ?? null,
      contractId: (body.contractId as string | undefined) ?? null,
      assignedReviewerUserId: (body.assignedReviewerUserId as string | undefined) ?? null,
    });

    const intakeTransactionId = await nextIntakeTransactionId({
      organizationId: orgId,
      clientCode,
      projectCode,
    });

    const [created] = await db
      .insert(intakeRequests)
      .values({
        intakeTransactionId,
        organizationId: orgId,
        clientId: (body.clientId as string | undefined) ?? null,
        projectId: (body.projectId as string | undefined) ?? null,
        contractId: (body.contractId as string | undefined) ?? null,
        opportunityId: (body.opportunityId as string | undefined) ?? null,
        title,
        description: (body.description as string | undefined) ?? null,
        expectedClassification: expectedClassification as never,
        cuiCategory: (body.cuiCategory as string | undefined) ?? null,
        fciFlag: Boolean(body.fciFlag ?? false),
        exportControlFlag: Boolean(body.exportControlFlag ?? false),
        authorizationBasis: String(body.authorizationBasis ?? "Project-authorized intake"),
        requestedByUserId: user.id ?? null,
        assignedReviewerUserId:
          (body.assignedReviewerUserId as string | undefined) ?? null,
        senderName: (body.senderName as string | undefined) ?? null,
        senderEmail: (body.senderEmail as string | undefined) ?? null,
        senderOrganization: (body.senderOrganization as string | undefined) ?? null,
        senderDomain: (body.senderDomain as string | undefined) ?? null,
        identityVerificationMethod:
          (body.identityVerificationMethod as string | undefined) ?? null,
        uploadMethod,
        status: "Draft",
      })
      .returning();

    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const status = /invalid|authorized|not authorized|uploadMethod/i.test(message) ? 400 : 401;
    return NextResponse.json({ error: message }, { status });
  }
}
