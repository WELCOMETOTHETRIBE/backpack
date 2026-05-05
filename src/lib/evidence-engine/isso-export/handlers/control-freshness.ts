/**
 * control_freshness handler — v1.1 ISSO export.
 *
 * The ISSO ticks a checklist of controls during weekly review (one entry
 * per box checked goes into `freshly_observed_implemented[]`). The signed
 * export is the authoritative attestation that those controls were
 * observed operating during the period. This handler:
 *
 *   1. For each control_id in freshly_observed_implemented[], bumps
 *      `control_records.last_evaluated_at` to the manifest's
 *      review_period_end. Does NOT change implementation_status — the
 *      timestamp is the freshness signal; status stays whatever the
 *      adjudication helper computed from technical/policy/register lanes.
 *
 *   2. Logs a per-control audit event so /admin/audit-logs shows a
 *      defensible "ISSO observed control 3.1.7 implemented during
 *      [period]" record per check-box per cycle.
 *
 *   3. needing_attention[] currently logs warnings only. Sprint 6 wires
 *      these into the dashboard's "what needs attention" feed so admins
 *      see ISSO-flagged staleness items as actionable rows.
 *
 * Why this matters for the assessor: instead of 25 cadenced per-control
 * attestations going stale on individual schedules, the codex sees 52
 * weekly signed exports per year, each one a list of controls the ISSO
 * just affirmed. The C3PAO question "how do you know your continuous
 * monitoring is happening?" gets answered with an audit trail that's
 * naturally indexed by ISSO signature, not by attestation expiry.
 *
 * Per spec §6 + §12.
 */

import { db } from "@/db";
import { controlRecords, controlAttentionItems } from "@/db/schema";
import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

interface NeedingAttentionItem {
  control_id?: string;
  reason?: string;
  severity?: "info" | "warning" | "critical" | string;
}

interface ControlFreshnessPayload {
  freshly_observed_implemented?: string[];
  needing_attention?: NeedingAttentionItem[];
}

export const control_freshnessHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "control_freshness",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const section = (payload ?? {}) as ControlFreshnessPayload;

  // ── freshly_observed_implemented[] ─────────────────────────────────────
  const observed = (section.freshly_observed_implemented ?? []).filter(
    (c): c is string => typeof c === "string" && c.length > 0,
  );

  if (observed.length > 0) {
    // Validate the org actually has control_records for every claimed
    // control_id; ISSO can't observe a control the org doesn't have.
    const recs = await db
      .select({ id: controlRecords.id, controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, ctx.orgId),
          inArray(controlRecords.controlId, observed),
        ),
      );

    const knownByControlId = new Map(recs.map((r) => [r.controlId, r.id]));
    const unknown = observed.filter((c) => !knownByControlId.has(c));
    if (unknown.length > 0) {
      result.warnings.push(
        `freshly_observed_implemented[] referenced unknown control_id(s) for org: ${unknown.join(", ")} — skipped`,
      );
    }

    // Bulk update last_evaluated_at via updatedAt (the field that backs
    // "days since last evaluation" everywhere else in the codex). We're
    // explicitly NOT touching implementation_status here — the adjudication
    // helper owns that. Touching updated_at is the signal that this control
    // was observed operating during the manifest's review_period_end window.
    if (recs.length > 0) {
      await db
        .update(controlRecords)
        .set({ updatedAt: ctx.reviewPeriodEnd })
        .where(
          and(
            eq(controlRecords.organizationId, ctx.orgId),
            inArray(
              controlRecords.controlId,
              recs.map((r) => r.controlId),
            ),
          ),
        );
      result.entries_updated = recs.length;
      result.controls_touched = recs.map((r) => r.controlId);

      // Per-control audit event so /admin/audit-logs has a defensible
      // record. Single-line JSON so log-parsing infra picks it up.
      for (const r of recs) {
        console.log(
          JSON.stringify({
            event: "enclavewatch.control.freshly_observed",
            orgId: ctx.orgId,
            controlId: r.controlId,
            reviewPeriodEnd: ctx.reviewPeriodEnd.toISOString(),
            manifestId: ctx.manifestId,
            vaultId: ctx.vaultId,
          }),
        );
      }
    }
  }

  // ── needing_attention[] ─────────────────────────────────────────────────
  // Sprint 6.5: persist to control_attention_items so the Monitoring tab
  // can render open items and admins can mark them resolved. Idempotent
  // on (organization_id, control_id, flagged_by_manifest_id) — re-ingest
  // of the same manifest doesn't duplicate.
  const needing = (section.needing_attention ?? []).filter(
    (n): n is NeedingAttentionItem =>
      typeof n === "object" && n !== null && typeof n.control_id === "string",
  );
  if (needing.length > 0) {
    for (const n of needing) {
      console.log(
        JSON.stringify({
          event: "enclavewatch.control.needing_attention",
          orgId: ctx.orgId,
          controlId: n.control_id,
          reason: n.reason ?? "(no reason given)",
          severity: n.severity ?? "warning",
          manifestId: ctx.manifestId,
        }),
      );

      // Don't insert if a row for this manifest+control already exists.
      const [existing] = await db
        .select({ id: controlAttentionItems.id })
        .from(controlAttentionItems)
        .where(
          and(
            eq(controlAttentionItems.organizationId, ctx.orgId),
            eq(controlAttentionItems.controlId, n.control_id ?? ""),
            n.control_id
              ? sql`${controlAttentionItems.flaggedByManifestId} = ${ctx.manifestId}`
              : sql`false`,
          ),
        )
        .limit(1);
      if (existing) continue;

      // Don't insert if there's already an OPEN row for this control —
      // ISSO re-flagging on a different manifest is the same item, not a
      // new one. Update reason/severity in place instead.
      const [existingOpen] = await db
        .select({ id: controlAttentionItems.id })
        .from(controlAttentionItems)
        .where(
          and(
            eq(controlAttentionItems.organizationId, ctx.orgId),
            eq(controlAttentionItems.controlId, n.control_id ?? ""),
            isNull(controlAttentionItems.resolvedAt),
          ),
        )
        .limit(1);

      if (existingOpen) {
        await db
          .update(controlAttentionItems)
          .set({
            reason: n.reason ?? "(no reason given)",
            severity: n.severity ?? "warning",
            flaggedByManifestId: ctx.manifestId,
            vaultId: ctx.vaultId,
          })
          .where(eq(controlAttentionItems.id, existingOpen.id));
      } else {
        await db.insert(controlAttentionItems).values({
          organizationId: ctx.orgId,
          controlId: n.control_id ?? "",
          reason: n.reason ?? "(no reason given)",
          severity: n.severity ?? "warning",
          flaggedByManifestId: ctx.manifestId,
          vaultId: ctx.vaultId,
          flaggedAt: ctx.reviewPeriodEnd,
        });
      }
    }
    result.warnings.push(
      `${needing.length} control(s) flagged needing_attention by ISSO — surfaced in /dashboard/monitoring`,
    );
  }

  return result;
};
