import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { intakeRequests } from "@/db/schema";
import { writeAuditLog } from "@/lib/audit";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { INTAKE_CLASSIFICATIONS } from "@/lib/intake/status";
import { nextIntakeTransactionId, validateIntakeForeignKeys } from "@/lib/intake/service";

const txnIdRegex = /^[a-zA-Z0-9_.:-]+$/;

const bodySchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    /** When set, aligns Codex intake_transaction_id with the vault transaction id (e.g. tx-…). */
    intakeTransactionId: z.string().min(3).max(100).regex(txnIdRegex).optional(),
    clientCode: z.string().min(1).max(40).optional(),
    projectCode: z.string().min(1).max(40).optional(),
    expectedClassification: z.enum(INTAKE_CLASSIFICATIONS).optional(),
    description: z.string().max(8000).optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    contractId: z.string().uuid().optional().nullable(),
    authorizationBasis: z.string().min(1).max(500).optional(),
    fciFlag: z.boolean().optional(),
    exportControlFlag: z.boolean().optional(),
  })
  .strict();

/**
 * Vault-facing bootstrap for CUI intake: creates an intake_requests row with a fresh
 * intake_transaction_id so EnclaveWatch metadata ingest (preflight → started → completed)
 * can resolve the transaction before any browser upload.
 *
 * Auth: same as other /api/enclavewatch/* routes — Clerk session OR
 * Authorization: Bearer organizations.enclavewatch_api_token
 */
export async function POST(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await req.json().catch(() => null)) as unknown | null;
  const parsedBody = bodySchema.safeParse(raw ?? {});
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const b = parsedBody.data;
  const title = (b.title ?? "Vault-managed customer intake").trim();
  const clientCode = (b.clientCode ?? "CLIENT").trim();
  const projectCode = (b.projectCode ?? "INTAKE").trim();
  const expectedClassification = b.expectedClassification ?? "CUI";
  const authorizationBasis = (b.authorizationBasis ?? "Project-authorized intake").trim();

  try {
    await validateIntakeForeignKeys({
      orgId: ctx.orgId,
      clientId: b.clientId ?? null,
      projectId: b.projectId ?? null,
      contractId: b.contractId ?? null,
      assignedReviewerUserId: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Foreign key validation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const vaultTxnId = b.intakeTransactionId?.trim();

  if (vaultTxnId) {
    const [existing] = await db
      .select({
        id: intakeRequests.id,
        intakeTransactionId: intakeRequests.intakeTransactionId,
        organizationId: intakeRequests.organizationId,
        status: intakeRequests.status,
        title: intakeRequests.title,
        createdAt: intakeRequests.createdAt,
      })
      .from(intakeRequests)
      .where(and(eq(intakeRequests.organizationId, ctx.orgId), eq(intakeRequests.intakeTransactionId, vaultTxnId)))
      .limit(1);

    if (existing) {
      return NextResponse.json(
        {
          ok: true,
          already_exists: true,
          intake_request_id: existing.id,
          intake_transaction_id: existing.intakeTransactionId,
          organization_id: existing.organizationId,
          status: existing.status,
          title: existing.title,
          created_at: existing.createdAt,
        },
        { status: 200 },
      );
    }
  }

  const intakeTransactionId =
    vaultTxnId ??
    (await nextIntakeTransactionId({
      organizationId: ctx.orgId,
      clientCode,
      projectCode,
    }));

  /** Vault-aligned bootstrap rows skip Draft so bearer register-upload semantics apply immediately. */
  const insertStatus = vaultTxnId ? "Awaiting Upload" : "Draft";

  const [created] = await db
    .insert(intakeRequests)
    .values({
      intakeTransactionId,
      organizationId: ctx.orgId,
      clientId: b.clientId ?? null,
      projectId: b.projectId ?? null,
      contractId: b.contractId ?? null,
      title,
      description: b.description ?? null,
      expectedClassification,
      cuiCategory: null,
      fciFlag: b.fciFlag ?? false,
      exportControlFlag: b.exportControlFlag ?? false,
      authorizationBasis,
      requestedByUserId: null,
      assignedReviewerUserId: null,
      senderName: null,
      senderEmail: null,
      senderOrganization: null,
      senderDomain: null,
      identityVerificationMethod: null,
      uploadMethod: null,
      status: insertStatus,
    })
    .returning({
      id: intakeRequests.id,
      intakeTransactionId: intakeRequests.intakeTransactionId,
      organizationId: intakeRequests.organizationId,
      status: intakeRequests.status,
      title: intakeRequests.title,
      createdAt: intakeRequests.createdAt,
    });

  if (!created) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  await writeAuditLog({
    organizationId: ctx.orgId,
    userId: null,
    action: "intake.request.created_via_enclavewatch_bootstrap",
    resourceType: "intake_request",
    resourceId: created.id,
    details: {
      intakeTransactionId: created.intakeTransactionId,
      via: ctx.via,
      title,
      expectedClassification,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      intake_request_id: created.id,
      intake_transaction_id: created.intakeTransactionId,
      organization_id: created.organizationId,
      status: created.status,
      title: created.title,
      created_at: created.createdAt,
    },
    { status: 201 },
  );
}
