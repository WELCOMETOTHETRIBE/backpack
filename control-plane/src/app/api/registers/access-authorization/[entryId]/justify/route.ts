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
 * POST /api/registers/access-authorization/[entryId]/justify
 *
 * Admin completes the privileged-grant justification for a detected
 * privileged role assignment. Validates the entry exists, is type=
 * privileged_grant_acknowledgment, status=draft, and belongs to the
 * caller's org. Merges submitted §1 fields into entryData and flips
 * status=final / lifecycle_state=admin_signed.
 *
 * Required fields (per §1 of the Register-Automation v1.1 brief):
 *   business_justification (≥ 50 chars), outcome, actions_taken, signed_at
 *
 * Optional: expected_duration_days, sunset_plan, ticket_url, notes
 *
 * Auth: session (Admin or Compliance role required).
 *
 * Mirrors the break-glass acknowledge route. The audit-log event chain is
 * `enclavewatch.privileged_grant.detected` (from bulk-upsert) →
 * `enclavewatch.privileged_grant.admin_justified` (here) →
 * `enclavewatch.privileged_grant.ack_review_applied` (next ISSO export).
 */

interface JustifyBody {
  business_justification?: string;
  outcome?: string;
  actions_taken?: string;
  sunset_plan?: string | null;
  expected_duration_days?: number | null;
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
  "approved",
  "approved_with_conditions",
  "rolled_back",
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
          "Forbidden — only Admin or Compliance roles may justify privileged grant entries",
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

  // Validate required string fields
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

  // Length floor on business_justification (matches the form's client
  // validation; defensive here in case a script POSTs directly).
  if ((body.business_justification ?? "").trim().length < 50) {
    return NextResponse.json(
      { error: "business_justification must be at least 50 characters" },
      { status: 400 },
    );
  }

  // Validate outcome enum
  if (!OUTCOME_ENUM.has(body.outcome as string)) {
    return NextResponse.json(
      {
        error: `outcome must be one of: ${Array.from(OUTCOME_ENUM).join(", ")}`,
      },
      { status: 400 },
    );
  }

  // Validate signed_at is RFC3339
  if (body.signed_at && Number.isNaN(new Date(body.signed_at).getTime())) {
    return NextResponse.json(
      { error: "signed_at must be RFC3339" },
      { status: 400 },
    );
  }

  // Validate expected_duration_days if provided
  if (
    body.expected_duration_days !== null &&
    body.expected_duration_days !== undefined
  ) {
    const n = Number(body.expected_duration_days);
    if (Number.isNaN(n) || n < 0 || n > 3650) {
      return NextResponse.json(
        { error: "expected_duration_days must be a number between 0 and 3650" },
        { status: 400 },
      );
    }
  }

  // Look up entry, scoped to the caller's org via the register row.
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
  if (row.entryType !== "privileged_grant_acknowledgment") {
    return NextResponse.json(
      {
        error: `Entry type mismatch — expected "privileged_grant_acknowledgment", got "${row.entryType}"`,
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

  // Append a justification evidence_ref so the chain reflects who signed.
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
    sunset_plan: body.sunset_plan ?? null,
    expected_duration_days: body.expected_duration_days ?? null,
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
      event: "enclavewatch.privileged_grant.admin_justified",
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
      action: "enclavewatch.privileged_grant.admin_justified",
      resourceType: "privileged_grant_alert",
      resourceId: (detectionData.alert_id as string | undefined) ?? entryId,
      details: {
        entry_id: entryId,
        related_grant_entry_id: detectionData.related_grant_entry_id ?? null,
        justified_by: userName,
        outcome: body.outcome,
        expected_duration_days: body.expected_duration_days ?? null,
        sunset_plan_provided: Boolean(body.sunset_plan),
        ticket_url: body.ticket_url ?? null,
        signed_at: body.signed_at,
        azure_role_name: detectionData.azure_role_name ?? null,
        scope_arm: detectionData.scope_arm ?? null,
        actor_user: detectionData.actor_user ?? null,
      },
    });
  } catch {
    // No-op — audit-log write is best-effort.
  }

  return NextResponse.json({
    ok: true,
    entry_id: entryId,
    status: "final",
    lifecycle_state: "admin_signed",
    finalized_at: now.toISOString(),
  });
}
