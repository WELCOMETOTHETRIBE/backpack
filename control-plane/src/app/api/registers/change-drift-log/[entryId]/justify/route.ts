import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  governanceRegisterEntries,
  governanceRegisters,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

/**
 * POST /api/registers/change-drift-log/[entryId]/justify
 *
 * Admin completes the configuration-drift justification for a detected
 * baseline change with no matching change_log entry. Validates the entry
 * exists, is type=change_drift_acknowledgment, status=draft, and belongs
 * to the caller's org. Merges submitted §1 fields into entryData and flips
 * status=final / lifecycle_state=admin_signed.
 *
 * Required fields: business_justification (≥50 chars), outcome,
 * actions_taken, signed_at.
 *
 * Optional: ticket_url, notes.
 *
 * Auth: session (Admin or Compliance role required).
 *
 * Audit-log chain: enclavewatch.config_drift.detected (handler) →
 * enclavewatch.config_drift.admin_justified (here) →
 * enclavewatch.config_drift.ack_review_applied (next ISSO export).
 */

interface JustifyBody {
  business_justification?: string;
  outcome?: string;
  actions_taken?: string;
  ticket_url?: string | null;
  notes?: string | null;
  signed_at?: string;
}

const REQUIRED_STRING_FIELDS: Array<keyof JustifyBody> = [
  "business_justification",
  "outcome",
  "actions_taken",
  "signed_at",
];

const OUTCOME_ENUM = new Set([
  "intended_change_with_change_log_match",
  "intended_change_no_change_log",
  "false_positive",
  "unauthorized_change_remediated",
  "investigating",
]);

export async function POST(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  const userId = (session?.user as { id?: string })?.id;
  const userRole = (session?.user as { role?: string })?.role;
  const userName =
    (session?.user as { name?: string })?.name ??
    (session?.user as { email?: string })?.email ??
    "(unknown)";
  const userEmail = (session?.user as { email?: string })?.email ?? null;

  if (!orgId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (userRole !== "Admin" && userRole !== "Compliance") {
    return NextResponse.json(
      {
        error:
          "Forbidden — only Admin or Compliance roles may justify configuration-drift entries",
      },
      { status: 403 },
    );
  }

  const { entryId } = await params;

  let body: JustifyBody;
  try {
    body = (await req.json()) as JustifyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const missing: string[] = [];
  for (const f of REQUIRED_STRING_FIELDS) {
    const v = body[f];
    if (typeof v !== "string" || v.trim() === "") missing.push(f);
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required justification fields", fields: missing },
      { status: 400 },
    );
  }

  if ((body.business_justification ?? "").trim().length < 50) {
    return NextResponse.json(
      { error: "business_justification must be at least 50 characters" },
      { status: 400 },
    );
  }

  if (!OUTCOME_ENUM.has(body.outcome as string)) {
    return NextResponse.json(
      {
        error: `outcome must be one of: ${Array.from(OUTCOME_ENUM).join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (body.signed_at && Number.isNaN(new Date(body.signed_at).getTime())) {
    return NextResponse.json(
      { error: "signed_at must be RFC3339" },
      { status: 400 },
    );
  }

  const [row] = await db
    .select({
      entryId: governanceRegisterEntries.id,
      status: governanceRegisterEntries.status,
      entryType: governanceRegisterEntries.entryType,
      entryData: governanceRegisterEntries.entryData,
      registerId: governanceRegisterEntries.registerId,
      orgId: governanceRegisters.organizationId,
    })
    .from(governanceRegisterEntries)
    .innerJoin(
      governanceRegisters,
      eq(governanceRegisterEntries.registerId, governanceRegisters.id),
    )
    .where(eq(governanceRegisterEntries.id, entryId))
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  if (row.orgId !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (row.entryType !== "change_drift_acknowledgment") {
    return NextResponse.json(
      {
        error: `Entry type mismatch — expected "change_drift_acknowledgment", got "${row.entryType}"`,
      },
      { status: 400 },
    );
  }
  if (row.status === "final") {
    return NextResponse.json(
      { error: "Entry already finalized — cannot re-justify" },
      { status: 409 },
    );
  }

  const detectionData = (row.entryData ?? {}) as Record<string, unknown>;

  const existingRefs = Array.isArray(detectionData.evidence_refs)
    ? (detectionData.evidence_refs as Array<Record<string, unknown>>)
    : [];
  const evidenceRefs: Array<Record<string, unknown>> = [
    ...existingRefs,
    {
      type: "admin_signature",
      value: userId,
      label: `Justified by ${userName}${userEmail ? ` (${userEmail})` : ""} at ${
        body.signed_at ?? new Date().toISOString()
      }`,
    },
  ];
  if (body.ticket_url) {
    evidenceRefs.push({
      type: "ticket_url",
      value: body.ticket_url,
      label: "Ticket linked at justification time",
    });
  }

  const merged: Record<string, unknown> = {
    ...detectionData,
    business_justification: body.business_justification,
    outcome: body.outcome,
    actions_taken: body.actions_taken,
    ticket_url: body.ticket_url ?? null,
    notes: body.notes ?? null,
    signed_at: body.signed_at,
    actor_signed_by_user_id: userId,
    actor_signed_by_user_name: userName,
    actor_signed_by_user_email: userEmail,
    admin_justified_at: new Date().toISOString(),
    lifecycle_state: "admin_signed",
    evidence_refs: evidenceRefs,
  };

  const now = new Date();
  await db
    .update(governanceRegisterEntries)
    .set({
      entryData: merged,
      status: "final",
      finalizedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(governanceRegisterEntries.id, entryId),
        eq(governanceRegisterEntries.registerId, row.registerId),
      ),
    );

  console.log(
    JSON.stringify({
      event: "enclavewatch.config_drift.admin_justified",
      orgId,
      entryId,
      alertId: detectionData.alert_id ?? null,
      justifiedBy: userId,
      outcome: body.outcome,
    }),
  );

  try {
    await writeAuditLog({
      organizationId: orgId,
      userId,
      action: "enclavewatch.config_drift.admin_justified",
      resourceType: "config_drift_alert",
      resourceId: (detectionData.alert_id as string | undefined) ?? entryId,
      details: {
        entry_id: entryId,
        related_change_log_entry_id:
          detectionData.related_change_log_entry_id ?? null,
        justified_by: userName,
        outcome: body.outcome,
        ticket_url: body.ticket_url ?? null,
        signed_at: body.signed_at,
        path: detectionData.path ?? null,
        change_type: detectionData.change_type ?? null,
        host: detectionData.host ?? null,
        actor_user: detectionData.actor_user ?? null,
      },
    });
  } catch {
    // No-op
  }

  return NextResponse.json({
    ok: true,
    entry_id: entryId,
    status: "final",
    lifecycle_state: "admin_signed",
    finalized_at: now.toISOString(),
  });
}
