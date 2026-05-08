/**
 * change_drift_log handler — Phase 2 of Register-Automation v1.1.
 *
 * Ingests `registers.change_drift_log.drift_observations[]` from the
 * weekly ISSO manifest. Each observation is a Sysmon-detected
 * configuration change on a baseline-protected resource that the vault's
 * ConfigurationDriftCollector could NOT match against any change_log
 * entry within ±60 minutes.
 *
 * Behavior (Pattern A — Detect → Admin justify → ISSO verify):
 *   - Each observation lands as a draft change_drift_acknowledgment entry.
 *   - lifecycle_state="draft", status="draft" — admin sees it on the
 *     Monitoring tab and has 72h to justify (intended ticketed change /
 *     false positive / unauthorized change remediated / investigating).
 *   - Idempotent on alert_id: re-ingesting the same observation refreshes
 *     detection-side fields without clobbering admin-signed entries.
 *   - Audit log: enclavewatch.config_drift.detected per newly-opened entry.
 *
 * §1 verbosity baked in at insert: actor_user, actor_user_id, event_type,
 * event_classification, all four time anchors, system+scope_arm+vault_id+
 * boundary_id, detection_method, detection_source, lifecycle_state,
 * evidence_refs[], provenance{manifest_id,run_id,ingested_at},
 * plus the drift-specific fields path / change_type / sysmon_event_id.
 *
 * Backs CM 3.4.1 / 3.4.2 / 3.4.3.
 */

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { writeAuditLog } from "@/lib/audit";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

interface DriftObservation {
  alert_id?: string;
  detected_at?: string;
  occurred_at?: string;
  host?: string;
  system?: string;
  scope_arm?: string | null;
  path?: string;
  change_type?: string;
  event_type?: string;
  event_classification?: string;
  actor_user?: string | null;
  actor_user_id?: string | null;
  process_image?: string | null;
  process_id?: number | null;
  sysmon_event_id?: number | null;
  sysmon_event_record_id?: string | null;
  prior_value_hash?: string | null;
  new_value_hash?: string | null;
  detection_source?: string;
  related_change_log_entry_id?: string | null;
}

interface ChangeDriftPayload {
  drift_observations?: DriftObservation[];
}

const COVERED = ["3.4.1", "3.4.2", "3.4.3"] as const;

const VALID_CHANGE_TYPES = new Set([
  "file_create",
  "file_modify",
  "file_delete",
  "registry_set_value",
  "registry_delete_value",
  "service_modify",
  "binary_replaced",
]);

const VALID_EVENT_TYPES = new Set([
  "file_create",
  "file_modify",
  "file_delete",
  "registry_set_value",
  "registry_delete_value",
  "service_change",
  "binary_replaced",
]);

const VALID_EVENT_CLASSIFICATIONS = new Set([
  "baseline_drift",
  "self_protection_breach",
  "service_change",
  "config_change",
]);

export const change_drift_logHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "change_drift_log",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const section = (payload ?? {}) as ChangeDriftPayload;
  const items = Array.isArray(section.drift_observations)
    ? section.drift_observations
    : [];
  if (items.length === 0) return result;

  // Resolve org's primary boundary — required for entry creation.
  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push(
      "no primary boundary for org — change_drift_log observations not written",
    );
    return result;
  }

  // Resolve the change_drift_log register row (alias-aware).
  const candidates = resolveRegisterKeyCandidates("change_drift_log");
  const matchingRegisters = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, ctx.orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    );

  if (matchingRegisters.length === 0) {
    result.warnings.push(
      "change_drift_log register not provisioned for org — visit /dashboard/evidence-engine/registers to auto-provision, or apply migration 0056_change_drift_log_register.sql",
    );
    return result;
  }

  const targetRegisterId = matchingRegisters[0]!.id;
  const registerIds = matchingRegisters.map((r) => r.id);
  const now = new Date();

  // Index existing draft entries by alert_id to make ingest idempotent
  // across collector retries and weekly manifest re-deliveries.
  const existingRows = await db
    .select({
      id: governanceRegisterEntries.id,
      status: governanceRegisterEntries.status,
      entryData: governanceRegisterEntries.entryData,
    })
    .from(governanceRegisterEntries)
    .where(
      and(
        sql`${governanceRegisterEntries.registerId} IN (${sql.join(
          registerIds.map((id) => sql`${id}`),
          sql`, `,
        )})`,
        eq(governanceRegisterEntries.entryType, "change_drift_acknowledgment"),
      ),
    );
  const existingByAlertId = new Map<string, (typeof existingRows)[number]>();
  for (const r of existingRows) {
    const d = (r.entryData ?? {}) as Record<string, unknown>;
    if (typeof d.alert_id === "string" && d.alert_id) {
      existingByAlertId.set(d.alert_id, r);
    }
  }

  for (const ev of items) {
    if (!ev.alert_id) {
      result.warnings.push("drift_observation missing alert_id — skipped");
      continue;
    }
    if (!ev.detected_at || !ev.occurred_at) {
      result.warnings.push(
        `drift_observation alert_id=${ev.alert_id} missing detected_at/occurred_at — skipped`,
      );
      continue;
    }
    if (!ev.path) {
      result.warnings.push(
        `drift_observation alert_id=${ev.alert_id} missing path — skipped`,
      );
      continue;
    }
    if (!ev.change_type || !VALID_CHANGE_TYPES.has(ev.change_type)) {
      result.warnings.push(
        `drift_observation alert_id=${ev.alert_id} change_type=${ev.change_type ?? "(missing)"} not in enum — skipped`,
      );
      continue;
    }

    const evType =
      ev.event_type && VALID_EVENT_TYPES.has(ev.event_type)
        ? ev.event_type
        : (ev.change_type === "service_modify"
            ? "service_change"
            : ev.change_type);
    const evClassification =
      ev.event_classification &&
      VALID_EVENT_CLASSIFICATIONS.has(ev.event_classification)
        ? ev.event_classification
        : "baseline_drift";

    const evidenceRefs: Array<Record<string, unknown>> = [
      {
        type: "manifest_id",
        value: ctx.manifestId,
        label: "Source manifest carrying this drift observation",
      },
    ];
    if (ev.related_change_log_entry_id) {
      // The collector said it found a NEAR-match in change_log but outside
      // the ±60min window. Surface as a navigable reference for the auditor.
      evidenceRefs.push({
        type: "related_entry_id",
        value: ev.related_change_log_entry_id,
        label: "Nearest change_log entry (matched outside ±60min window)",
      });
    }

    const baseEntryData: Record<string, unknown> = {
      // §1 actor_*
      actor_user: ev.actor_user ?? null,
      actor_user_id: ev.actor_user_id ?? null,
      // §1 event_type + event_classification
      event_type: evType,
      event_classification: evClassification,
      // §1 time anchors
      detected_at: ev.detected_at,
      occurred_at: ev.occurred_at,
      signed_at: null,
      verified_at: null,
      // §1 location
      system: ev.system ?? ev.host ?? null,
      scope_arm: ev.scope_arm ?? null,
      vault_id: ctx.vaultId,
      boundary_id: primaryBoundary.id,
      // §1 detection_method + detection_source
      detection_method: "sysmon",
      detection_source: ev.detection_source ?? "ConfigurationDriftCollector",
      // §1 lifecycle_state
      lifecycle_state: "draft",
      // §1 evidence_refs
      evidence_refs: evidenceRefs,
      // §1 provenance
      provenance: {
        manifest_id: ctx.manifestId,
        run_id: null,
        ingested_at: now.toISOString(),
      },
      // To-be-filled-by-admin
      business_justification: null,
      outcome: null,
      actions_taken: null,
      // ISSO-verify-time
      verified_by: null,
      verification_note: null,
      // Drift-specific context
      alert_id: ev.alert_id,
      path: ev.path,
      change_type: ev.change_type,
      host: ev.host ?? null,
      sysmon_event_id: ev.sysmon_event_id ?? null,
      sysmon_event_record_id: ev.sysmon_event_record_id ?? null,
      process_image: ev.process_image ?? null,
      process_id: ev.process_id ?? null,
      prior_value_hash: ev.prior_value_hash ?? null,
      new_value_hash: ev.new_value_hash ?? null,
      related_change_log_entry_id: ev.related_change_log_entry_id ?? null,
      manifest_id: ctx.manifestId,
    };

    const existing = existingByAlertId.get(ev.alert_id);
    if (existing) {
      // Refresh detection-side fields when the entry is still draft so a
      // later collector pass can carry richer context. Once the entry is
      // admin_signed/final we leave it alone.
      if (existing.status === "draft") {
        const existingData = (existing.entryData ?? {}) as Record<
          string,
          unknown
        >;
        const mergedRefs = Array.isArray(existingData.evidence_refs)
          ? (existingData.evidence_refs as Array<Record<string, unknown>>)
          : [];
        const dedupKey = (r: Record<string, unknown>) =>
          `${r.type}|${r.value}`;
        const seen = new Set(mergedRefs.map(dedupKey));
        for (const r of evidenceRefs) {
          if (!seen.has(dedupKey(r))) mergedRefs.push(r);
        }
        const merged = { ...existingData, ...baseEntryData, evidence_refs: mergedRefs };
        await db
          .update(governanceRegisterEntries)
          .set({ entryData: merged, updatedAt: now })
          .where(eq(governanceRegisterEntries.id, existing.id));
        result.entries_updated++;
      }
      // status === "final": no-op (entry already admin-signed; leave it)
      continue;
    }

    await db.insert(governanceRegisterEntries).values({
      registerId: targetRegisterId,
      boundaryId: primaryBoundary.id,
      entryData: baseEntryData,
      entryType: "change_drift_acknowledgment",
      status: "draft",
    });
    result.entries_inserted++;

    // Detection-side audit log per newly-opened ack loop.
    try {
      await writeAuditLog({
        organizationId: ctx.orgId,
        userId: null,
        action: "enclavewatch.config_drift.detected",
        resourceType: "config_drift_alert",
        resourceId: ev.alert_id,
        details: {
          path: ev.path,
          change_type: ev.change_type,
          host: ev.host ?? null,
          actor_user: ev.actor_user ?? null,
          occurred_at: ev.occurred_at,
          manifest_id: ctx.manifestId,
        },
      });
    } catch {
      // No-op
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
