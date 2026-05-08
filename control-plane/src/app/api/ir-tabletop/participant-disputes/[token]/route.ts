/**
 * Public participant-dispute endpoint (Codex migration 0065).
 *
 * Magic-link confirm/dispute flow for IR tabletop attendance attestations.
 * One row in `ir_participant_disputes` per facilitator-attested participant
 * per bundle, each with a unique opaque `dispute_token`. The token is the
 * authentication — no Clerk session, no email re-verification. Anyone with
 * the token can act on the row, which is the design (the magic-link email
 * is sent only to the participant's email).
 *
 * Flow:
 *   1. Bundle archive creates the row (state='pending') and sends an email
 *      with this URL: /api/ir-tabletop/participant-disputes/[token]
 *   2. Participant clicks → GET → HTML page with their attestation details
 *      + two buttons (Confirm / Dispute)
 *   3. POST with { action: "confirm" | "dispute", reason?: string } →
 *      transitions state, returns confirmation page
 *
 * Idempotency: re-submitting after the first response is rejected with
 * 409 (already responded). Re-clicks of the magic link from the email
 * after a response just show the read-only state.
 *
 * Token expiry: dispute_token_expires_at = bundle.attendance_seal_at
 * (default 7 days from archive). Past that, GET shows expired state and
 * POST returns 410 gone.
 */
import { NextResponse, type NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import {
  irExerciseBundles,
  irExercises,
  irParticipantDisputes,
} from "@/db/schema"

type DisputeState = "pending" | "confirmed" | "disputed" | "expired"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function renderPage(args: {
  participantName: string
  bundleName: string
  exerciseName: string
  exerciseDate: string | null
  state: DisputeState
  message?: string
  token: string
  expired: boolean
}): string {
  const { participantName, bundleName, exerciseName, exerciseDate, state, message, token, expired } = args
  if (state === "confirmed" || state === "disputed") {
    return `<!doctype html><html><head><title>Attendance ${state}</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1f2937}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:24px;background:#f9fafb}
.tag-confirmed{display:inline-block;background:#10b981;color:white;padding:4px 10px;border-radius:4px;font-size:13px;font-weight:600}
.tag-disputed{display:inline-block;background:#ef4444;color:white;padding:4px 10px;border-radius:4px;font-size:13px;font-weight:600}
.muted{color:#6b7280;font-size:14px}</style></head>
<body><div class="card">
<h1 style="margin:0 0 12px">Response recorded</h1>
<p>Hi ${escapeHtml(participantName)},</p>
<p>Your response to the attendance attestation for <strong>${escapeHtml(exerciseName)}</strong> has been recorded as <span class="tag-${state}">${state.toUpperCase()}</span>.</p>
<p class="muted">No further action needed. This response is now part of the audit record for the IR tabletop evidence bundle.</p>
${message ? `<p class="muted">${escapeHtml(message)}</p>` : ""}
</div></body></html>`
  }
  if (expired || state === "expired") {
    return `<!doctype html><html><head><title>Dispute window closed</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1f2937}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:24px;background:#f9fafb}
.muted{color:#6b7280;font-size:14px}</style></head>
<body><div class="card">
<h1 style="margin:0 0 12px">Dispute window closed</h1>
<p>The 7-day window for confirming or disputing your attendance at <strong>${escapeHtml(exerciseName)}</strong> has expired.</p>
<p>Per the documented attendance protocol, no action within the dispute window constitutes implicit confirmation. The bundle has been sealed.</p>
<p class="muted">If you need to update the record after the seal, contact your compliance team to attach a correction to the bundle.</p>
</div></body></html>`
  }
  // Pending — show the dispute form.
  return `<!doctype html><html><head><title>Confirm IR tabletop attendance</title>
<style>body{font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:0 20px;color:#1f2937}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:24px;background:#f9fafb}
.muted{color:#6b7280;font-size:14px}
.btn{display:inline-block;padding:10px 20px;border-radius:6px;font-weight:600;text-decoration:none;border:0;cursor:pointer;font-size:14px;margin-right:8px}
.btn-confirm{background:#10b981;color:white}
.btn-dispute{background:#ef4444;color:white}
textarea{width:100%;font-family:inherit;border:1px solid #d1d5db;border-radius:4px;padding:8px;margin-top:8px;box-sizing:border-box}
.detail{margin:6px 0}
.detail strong{color:#4b5563;font-weight:600}
</style></head>
<body><div class="card">
<h1 style="margin:0 0 16px">Confirm your IR tabletop attendance</h1>
<p>Hi ${escapeHtml(participantName)},</p>
<p>The facilitator marked you as attending this incident response tabletop exercise. Confirm you were present, or dispute the record if you were not.</p>
<div class="detail"><strong>Exercise:</strong> ${escapeHtml(exerciseName)}</div>
<div class="detail"><strong>Date:</strong> ${exerciseDate ? escapeHtml(exerciseDate) : "—"}</div>
<div class="detail"><strong>Bundle:</strong> ${escapeHtml(bundleName)}</div>
<form method="POST" action="/api/ir-tabletop/participant-disputes/${escapeHtml(token)}" style="margin-top:20px">
<input type="hidden" name="action" value="confirm" />
<button class="btn btn-confirm" type="submit" formaction="/api/ir-tabletop/participant-disputes/${escapeHtml(token)}?action=confirm">Yes, I attended</button>
</form>
<form method="POST" action="/api/ir-tabletop/participant-disputes/${escapeHtml(token)}?action=dispute" style="margin-top:8px">
<details><summary style="cursor:pointer;color:#ef4444">No — I did not attend</summary>
<p class="muted" style="margin-top:8px">Optionally, tell us what happened. Your dispute will be attached to the bundle record.</p>
<textarea name="reason" rows="3" placeholder="Reason (optional)"></textarea>
<button class="btn btn-dispute" type="submit" style="margin-top:8px">Submit dispute</button>
</details>
</form>
<p class="muted" style="margin-top:24px">If you take no action within 7 days of the bundle archive, your attendance is implicitly confirmed when the bundle seals.</p>
</div></body></html>`
}

async function loadDisputeRow(token: string) {
  const [row] = await db
    .select({
      id: irParticipantDisputes.id,
      bundleId: irParticipantDisputes.bundleId,
      participantName: irParticipantDisputes.participantName,
      participantEmail: irParticipantDisputes.participantEmail,
      tokenExpiresAt: irParticipantDisputes.disputeTokenExpiresAt,
      state: irParticipantDisputes.state,
    })
    .from(irParticipantDisputes)
    .where(eq(irParticipantDisputes.disputeToken, token))
    .limit(1)
  return row
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const row = await loadDisputeRow(token)
  if (!row) {
    return new NextResponse("<!doctype html><h1>Token not found</h1>", {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  }
  const [bundle] = await db
    .select({
      id: irExerciseBundles.id,
      bundleVersion: irExerciseBundles.bundleVersion,
      executedAt: irExerciseBundles.executedAt,
      exerciseId: irExerciseBundles.exerciseId,
    })
    .from(irExerciseBundles)
    .where(eq(irExerciseBundles.id, row.bundleId))
    .limit(1)
  const [exercise] = bundle
    ? await db
        .select({ name: irExercises.name })
        .from(irExercises)
        .where(eq(irExercises.id, bundle.exerciseId))
        .limit(1)
    : []
  const expired = row.tokenExpiresAt < new Date()
  const html = renderPage({
    participantName: row.participantName,
    bundleName: bundle ? `Bundle v${bundle.bundleVersion}` : "Bundle",
    exerciseName: exercise?.name ?? "Exercise",
    exerciseDate: bundle?.executedAt ? bundle.executedAt.toISOString().slice(0, 10) : null,
    state: row.state as DisputeState,
    token,
    expired,
  })
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const url = new URL(req.url)
  // Action can come from query string (form `formaction` link) or form body.
  let action = url.searchParams.get("action") ?? ""
  let reason: string | null = null
  const contentType = req.headers.get("content-type") ?? ""
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await req.formData()
    if (!action) action = String(form.get("action") ?? "")
    const r = form.get("reason")
    if (typeof r === "string" && r.trim()) reason = r.trim()
  } else if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { action?: string; reason?: string }
    if (!action) action = body.action ?? ""
    if (body.reason && body.reason.trim()) reason = body.reason.trim()
  }
  if (action !== "confirm" && action !== "dispute") {
    return NextResponse.json(
      { error: "action must be 'confirm' or 'dispute'" },
      { status: 400 },
    )
  }

  const row = await loadDisputeRow(token)
  if (!row) {
    return NextResponse.json({ error: "token_not_found" }, { status: 404 })
  }
  if (row.state !== "pending") {
    return NextResponse.json(
      { error: "already_responded", state: row.state },
      { status: 409 },
    )
  }
  if (row.tokenExpiresAt < new Date()) {
    return NextResponse.json(
      { error: "token_expired", sealedAt: row.tokenExpiresAt },
      { status: 410 },
    )
  }

  const newState: DisputeState = action === "confirm" ? "confirmed" : "disputed"
  await db
    .update(irParticipantDisputes)
    .set({
      state: newState,
      respondedAt: new Date(),
      disputeReason: action === "dispute" ? reason : null,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent")?.slice(0, 256) ?? null,
    })
    .where(eq(irParticipantDisputes.id, row.id))

  // Re-render the now-final page.
  return GET(req, { params: Promise.resolve({ token }) })
}
