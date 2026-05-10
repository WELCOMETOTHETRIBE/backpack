/**
 * POST /api/ssp/drift-events/:eventId
 *
 * Adjudicate a single drift event. Body shape:
 *   { action: "acknowledge" | "dismiss" | "resolve",
 *     rationale?: string,    // required for "dismiss"
 *     notes?: string }       // optional for "acknowledge" / "resolve"
 *
 * Auth: Admin or Compliance role; org-scoped — the event must belong
 * to the caller's organization or the mutation is rejected.
 *
 * Per spec, dismissal MUST record a rationale; the service-layer
 * guard (dismissDriftEvent) throws on empty rationale, which we
 * surface as 400 here.
 */
import { NextResponse, type NextRequest } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { requireOrg, requireRole } from "@/lib/auth";
import {
  acknowledgeDriftEvent,
  dismissDriftEvent,
  resolveDriftEvent,
} from "@/lib/ssp/baseline-drift";

export const runtime = "nodejs";

const VALID_ACTIONS = new Set(["acknowledge", "dismiss", "resolve"]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> },
) {
  let orgId: string;
  let user: Awaited<ReturnType<typeof requireRole>>;
  try {
    orgId = await requireOrg();
    user = await requireRole(["Admin", "Compliance"]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
  if (!user.id) {
    return NextResponse.json(
      { error: "Authenticated user has no id" },
      { status: 401 },
    );
  }

  const { eventId } = await params;
  if (!eventId) {
    return NextResponse.json(
      { error: "eventId path param is required" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : null;
  if (!action || !VALID_ACTIONS.has(action)) {
    return NextResponse.json(
      {
        error: `action must be one of: ${[...VALID_ACTIONS].join(", ")}`,
      },
      { status: 400 },
    );
  }

  const rationale =
    typeof body?.rationale === "string" ? body.rationale : null;
  const notes = typeof body?.notes === "string" ? body.notes : null;

  try {
    if (action === "acknowledge") {
      await acknowledgeDriftEvent({
        organizationId: orgId,
        driftEventId: eventId,
        userId: user.id,
        notes,
      });
    } else if (action === "dismiss") {
      // Surface the spec-mandated rationale requirement as a 400
      // rather than letting the service-layer Error become a 500.
      if (!rationale || rationale.trim().length === 0) {
        return NextResponse.json(
          { error: "dismiss requires a non-empty rationale" },
          { status: 400 },
        );
      }
      await dismissDriftEvent({
        organizationId: orgId,
        driftEventId: eventId,
        userId: user.id,
        rationale,
      });
    } else {
      // resolve
      await resolveDriftEvent({
        organizationId: orgId,
        driftEventId: eventId,
        userId: user.id,
        notes,
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "adjudication failed";
    if (msg.toLowerCase().includes("rationale")) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error("[drift-events] adjudication failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Best-effort audit log; failure shouldn't 500 the response.
  try {
    await writeAuditLog({
      organizationId: orgId,
      userId: user.id,
      action: `ssp.baseline_drift.${action}`,
      resourceType: "ssp_baseline_drift_event",
      resourceId: eventId,
      details: {
        rationale: action === "dismiss" ? rationale : undefined,
        notes: action !== "dismiss" ? notes : undefined,
      },
    });
  } catch (err) {
    console.error("[drift-events] audit log write failed:", err);
  }

  return NextResponse.json({ status: "ok", action }, { status: 200 });
}
