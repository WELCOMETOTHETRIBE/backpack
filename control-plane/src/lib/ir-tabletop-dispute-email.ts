/**
 * Send participant dispute notification emails (Codex migration 0065).
 *
 * Called after a bundle archive transaction commits. Walks every
 * ir_participant_disputes row for the bundle where notification_sent_at
 * is null, sends a magic-link confirm/dispute email via Resend (already
 * wired in this codebase — see src/app/api/invitations/route.ts), and
 * stamps notification_sent_at on success.
 *
 * Best-effort: a Resend failure logs and continues; the row is left
 * un-stamped so a future seal job (or operator-triggered retry) can
 * re-attempt.
 *
 * No CUI in the email — names + exercise name + magic link only.
 */
import "server-only"
import { Resend } from "resend"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import {
  irExerciseBundles,
  irExercises,
  irParticipantDisputes,
} from "@/db/schema"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export type DisputeEmailResult = {
  total: number
  sent: number
  skipped: number
  failed: number
}

export async function sendIrParticipantDisputeNotifications(
  bundleId: string,
): Promise<DisputeEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ir-dispute-email] RESEND_API_KEY not set — skipping notifications for bundle ${bundleId}`,
    )
    return { total: 0, sent: 0, skipped: 0, failed: 0 }
  }

  const [bundle] = await db
    .select({
      id: irExerciseBundles.id,
      bundleVersion: irExerciseBundles.bundleVersion,
      executedAt: irExerciseBundles.executedAt,
      exerciseId: irExerciseBundles.exerciseId,
      attendanceSealAt: irExerciseBundles.attendanceSealAt,
    })
    .from(irExerciseBundles)
    .where(eq(irExerciseBundles.id, bundleId))
    .limit(1)
  if (!bundle) return { total: 0, sent: 0, skipped: 0, failed: 0 }

  const [exercise] = await db
    .select({ name: irExercises.name, customerName: irExercises.customerName })
    .from(irExercises)
    .where(eq(irExercises.id, bundle.exerciseId))
    .limit(1)
  if (!exercise) return { total: 0, sent: 0, skipped: 0, failed: 0 }

  const pending = await db
    .select({
      id: irParticipantDisputes.id,
      participantName: irParticipantDisputes.participantName,
      participantEmail: irParticipantDisputes.participantEmail,
      disputeToken: irParticipantDisputes.disputeToken,
    })
    .from(irParticipantDisputes)
    .where(
      and(
        eq(irParticipantDisputes.bundleId, bundleId),
        isNull(irParticipantDisputes.notificationSentAt),
      ),
    )

  if (pending.length === 0) {
    return { total: 0, sent: 0, skipped: 0, failed: 0 }
  }

  const resend = new Resend(apiKey)
  const from =
    process.env.RESEND_FROM ?? "Trust Codex <no-reply@mactechsolutionsllc.com>"
  const baseUrl =
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://codex.mactechsolutionsllc.com"

  const exerciseDate = bundle.executedAt
    ? bundle.executedAt.toISOString().slice(0, 10)
    : "—"
  const sealDate = bundle.attendanceSealAt
    ? bundle.attendanceSealAt.toISOString().slice(0, 10)
    : "—"

  let sent = 0
  let skipped = 0
  let failed = 0
  for (const row of pending) {
    if (!row.participantEmail) {
      skipped++
      continue
    }
    const link = `${baseUrl.replace(/\/$/, "")}/api/ir-tabletop/participant-disputes/${row.disputeToken}`
    try {
      await resend.emails.send({
        from,
        to: row.participantEmail,
        subject: `Confirm your IR tabletop attendance — ${exercise.name}`,
        html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;color:#1f2937;max-width:560px;margin:auto;padding:24px">
<h1 style="font-size:18px;margin:0 0 16px">Confirm your IR tabletop attendance</h1>
<p>Hi ${escapeHtml(row.participantName)},</p>
<p>The facilitator marked you as attending this incident response tabletop exercise:</p>
<table style="font-size:14px;border-collapse:collapse;margin:12px 0">
<tr><td style="color:#6b7280;padding:4px 12px 4px 0">Exercise</td><td><strong>${escapeHtml(exercise.name)}</strong></td></tr>
<tr><td style="color:#6b7280;padding:4px 12px 4px 0">Customer</td><td>${escapeHtml(exercise.customerName)}</td></tr>
<tr><td style="color:#6b7280;padding:4px 12px 4px 0">Date</td><td>${escapeHtml(exerciseDate)}</td></tr>
</table>
<p>Click the link below to confirm or dispute your attendance:</p>
<p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#3B82F6;color:white;text-decoration:none;border-radius:6px;font-weight:600">Open dispute page</a></p>
<p style="color:#6b7280;font-size:13px;word-break:break-all">Or copy this link: <br/>${link}</p>
<hr style="border:0;border-top:1px solid #e5e7eb;margin:20px 0" />
<p style="color:#6b7280;font-size:13px">If you take no action by <strong>${escapeHtml(sealDate)}</strong> (7 days), your attendance is implicitly confirmed when the bundle seals. This is part of the C3PAO-defensible audit record for AT.L2-3.6.3 (incident response testing).</p>
</body></html>`,
      })
      await db
        .update(irParticipantDisputes)
        .set({ notificationSentAt: new Date() })
        .where(eq(irParticipantDisputes.id, row.id))
      sent++
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[ir-dispute-email] Resend failed for ${row.participantEmail}:`,
        err,
      )
      failed++
    }
  }

  return { total: pending.length, sent, skipped, failed }
}
