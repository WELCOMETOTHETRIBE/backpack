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
 * POST /api/registers/maintenance-log/break-glass/[entryId]/acknowledge
 *
 * Admin completes the acknowledgment for a detected break-glass sign-in.
 * Validates the entry exists, is type=break_glass_acknowledgment, status=draft,
 * and belongs to the calling user's org. Merges submitted fields into
 * entryData and flips status to final.
 *
 * Required fields per the schema (register_entry_schemas.v1.json):
 *   acknowledged_by, purpose_of_session, actions_taken, affected_systems,
 *   before_state, after_state, signed_at
 *
 * Optional: ticket, notes
 *
 * Auth: session (Admin or Compliance role required).
 */

interface AckBody {
  acknowledged_by?: string;
  purpose_of_session?: string;
  actions_taken?: string;
  affected_systems?: string;
  before_state?: string;
  after_state?: string;
  signed_at?: string;
  ticket?: string | null;
  notes?: string | null;
}

const REQUIRED_FIELDS: (keyof AckBody)[] = [
  "acknowledged_by",
  "purpose_of_session",
  "actions_taken",
  "affected_systems",
  "before_state",
  "after_state",
  "signed_at",
];

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

  if (!orgId || !userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (userRole !== "Admin" && userRole !== "Compliance") {
    return NextResponse.json(
      { error: "Forbidden — only Admin or Compliance roles may acknowledge break-glass entries" },
      { status: 403 },
    );
  }

  const { entryId } = await params;

  let body: AckBody;
  try {
    body = (await req.json()) as AckBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  const missing: string[] = [];
  for (const f of REQUIRED_FIELDS) {
    const v = body[f];
    if (typeof v !== "string" || v.trim() === "") missing.push(f);
  }
  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Missing required acknowledgment fields", fields: missing },
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
  if (row.entryType !== "break_glass_acknowledgment") {
    return NextResponse.json(
      {
        error: `Entry type mismatch — expected "break_glass_acknowledgment", got "${row.entryType}"`,
      },
      { status: 400 },
    );
  }
  if (row.status === "final") {
    return NextResponse.json(
      { error: "Entry already finalized — cannot re-acknowledge" },
      { status: 409 },
    );
  }

  const detectionData = (row.entryData ?? {}) as Record<string, unknown>;
  const merged: Record<string, unknown> = {
    ...detectionData,
    acknowledged_by: body.acknowledged_by,
    purpose_of_session: body.purpose_of_session,
    actions_taken: body.actions_taken,
    affected_systems: body.affected_systems,
    before_state: body.before_state,
    after_state: body.after_state,
    signed_at: body.signed_at,
    ticket: body.ticket ?? null,
    notes: body.notes ?? null,
    acknowledged_by_user_id: userId,
    acknowledged_by_user_name: userName,
    acknowledged_at: new Date().toISOString(),
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
      event: "enclavewatch.break_glass.admin_acknowledged",
      orgId,
      entryId,
      alertId: detectionData.alert_id ?? null,
      acknowledgedBy: userId,
    }),
  );

  try {
    await writeAuditLog({
      organizationId: orgId,
      userId,
      action: "enclavewatch.break_glass.admin_acknowledged",
      resourceType: "break_glass_alert",
      resourceId: (detectionData.alert_id as string | undefined) ?? entryId,
      details: {
        entry_id: entryId,
        acknowledged_by: body.acknowledged_by,
        purpose_of_session: body.purpose_of_session,
        affected_systems: body.affected_systems,
        signed_at: body.signed_at,
        ticket: body.ticket ?? null,
      },
    });
  } catch {
    // No-op
  }

  return NextResponse.json({
    ok: true,
    entry_id: entryId,
    status: "final",
    finalized_at: now.toISOString(),
  });
}
