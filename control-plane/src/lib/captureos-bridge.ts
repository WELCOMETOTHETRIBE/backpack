/**
 * CaptureOS bridge — push SPRS-changed events into CaptureOS so its
 * eligibility chips refresh in real time instead of waiting for its
 * daily 0610 ET pull.
 *
 * Identity: both apps share Clerk for auth, so CaptureOS keys tenants
 * by clerk_org_id. We send that as the join key.
 *
 * Auth: shared bearer secret. Lives in two places:
 *   - Codex env: CAPTUREOS_WEBHOOK_SECRET   (sent in Authorization)
 *   - CaptureOS env: CODEX_WEBHOOK_SECRET   (validated on receipt)
 *
 * Failure is non-fatal: we log + return. CaptureOS has a safety-net
 * beat that pulls daily, so a missed push is reconciled within 24h.
 */

const DEFAULT_CAPTUREOS_BASE_URL =
  process.env.CAPTUREOS_BASE_URL ?? "https://capture.mactechsolutionsllc.com";

export type SprsChangePayload = {
  clerkOrgId: string;
  score: number;
  max: number;
  /** ISO date string YYYY-MM-DD or null if no controls assessed yet. */
  assessmentDate: string | null;
  /** Free-form trigger reason for log/debug ("governance_wizard_save", etc). */
  reason?: string;
};

export async function notifyCaptureOsOfSprsChange(
  payload: SprsChangePayload,
): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.CAPTUREOS_WEBHOOK_SECRET;
  if (!token) {
    return { ok: false, reason: "no_token" };
  }

  const baseUrl =
    process.env.NEXTAUTH_URL ?? "https://codex.mactechsolutionsllc.com";
  const sourceUrl = `${baseUrl}/dashboard/readiness`;

  const body = {
    clerk_org_id: payload.clerkOrgId,
    score: payload.score,
    max: payload.max,
    assessment_date: payload.assessmentDate,
    source_url: sourceUrl,
    computed_at: new Date().toISOString(),
    reason: payload.reason ?? "sprs_recomputed",
  };

  try {
    const resp = await fetch(
      `${DEFAULT_CAPTUREOS_BASE_URL}/webhooks/codex/sprs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
        // Don't let CaptureOS slowness block the user's "Save" click.
        // 5s ceiling — anything slower we treat as a missed push and
        // fall back to the daily beat.
        signal: AbortSignal.timeout(5_000),
      },
    );

    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.warn(
        `[captureos-bridge] SPRS push HTTP ${resp.status}: ${detail.slice(0, 200)}`,
      );
      return { ok: false, reason: `http_${resp.status}` };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.warn(`[captureos-bridge] SPRS push failed: ${msg}`);
    return { ok: false, reason: msg.slice(0, 80) };
  }
}
