/**
 * incident_log handler — v1.1 ISSO export §4.5.
 *
 * Handles two payload sub-sections on the incident_log register:
 *   1. incidents_during_period[] — ISSO-observed incidents, written as
 *      `incident_opened` entries (Pattern B; auto-final), idempotent on
 *      `incident_id`. Backs §3.6.1 / §3.6.2.
 *   2. defender_alerts[] — auto-detected high/critical Microsoft Defender
 *      for Endpoint alerts from the vault's DefenderCriticalAlertCollector.
 *      Each lands as a draft `defender_alert_acknowledgment` entry
 *      (Pattern A) awaiting admin investigation outcome within 24h, or
 *      it escalates to ISSO. Idempotent on alert_id. Backs §3.14.2 /
 *      §3.14.6. Phase 3 of Register-Automation v1.1.
 *
 * The two surfaces share the same target register but write distinct
 * entryType values so list views, monitoring counts, and ISSO closure
 * semantics can fan out cleanly.
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
import { applyAutoRecordedV1Fields } from "./_verbosity";
import type { HandlerResult, IngestContext, RegisterHandler } from "../types";

const COVERED = ["3.6.1", "3.6.2", "3.14.2", "3.14.6"] as const;

interface IncidentItem {
  incident_id?: string;
  opened_at?: string;
  severity?: "critical" | "high" | "medium" | "low" | string;
  summary?: string;
  response_actions?: string;
  closed_at?: string | null;
  ticket?: string | null;
  scope?: string;
  detected_by?: string;
}

interface DefenderAlertItem {
  alert_id?: string;
  raw_alert_id?: string | null;
  alert_title?: string;
  severity?: "high" | "critical" | string;
  category?: string | null;
  event_type?: string;
  event_classification?: string;
  detected_at?: string;
  occurred_at?: string;
  system?: string | null;
  affected_assets?: string[] | null;
  actor_user?: string | null;
  actor_user_id?: string | null;
  scope_arm?: string | null;
  mitre_techniques?: string[] | null;
  graph_alert_url?: string | null;
  detection_source?: string;
  summary?: string | null;
}

interface IncidentLogPayload {
  incidents_during_period?: IncidentItem[];
  defender_alerts?: DefenderAlertItem[];
}

const VALID_DEFENDER_EVENT_TYPES = new Set([
  "malware_detected",
  "credential_theft_attempt",
  "privilege_escalation_attempt",
  "lateral_movement_attempt",
  "data_exfiltration_attempt",
  "suspicious_process",
  "other",
]);

const VALID_DEFENDER_SEVERITIES = new Set(["high", "critical"]);

export const incident_logHandler: RegisterHandler = async (
  ctx: IngestContext,
  payload: unknown,
): Promise<HandlerResult> => {
  const result: HandlerResult = {
    section: "incident_log",
    entries_inserted: 0,
    entries_updated: 0,
    controls_touched: [],
    warnings: [],
  };

  const section = (payload ?? {}) as IncidentLogPayload;
  const incidents = Array.isArray(section.incidents_during_period)
    ? section.incidents_during_period
    : [];
  const defenderAlerts = Array.isArray(section.defender_alerts)
    ? section.defender_alerts
    : [];

  if (incidents.length === 0 && defenderAlerts.length === 0) return result;

  const [primaryBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, ctx.orgId))
    .limit(1);
  if (!primaryBoundary) {
    result.warnings.push("no primary boundary for org — incidents not written");
    return result;
  }

  const candidates = resolveRegisterKeyCandidates("incident_log");
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
    result.warnings.push("incident_log register not provisioned for org");
    return result;
  }

  // Pick the row with the most entries when duplicates exist (defensive).
  let targetRegisterId = matchingRegisters[0].id;
  if (matchingRegisters.length > 1) {
    const counts = await Promise.all(
      matchingRegisters.map(async (r) => {
        const [c] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, r.id));
        return { id: r.id, n: c?.n ?? 0 };
      }),
    );
    counts.sort((a, b) => b.n - a.n);
    targetRegisterId = counts[0].id;
  }
  const registerIds = matchingRegisters.map((r) => r.id);

  const now = new Date();

  // ── 1. incidents_during_period (Pattern B — auto-final) ───────────────
  for (const inc of incidents) {
    if (!inc.incident_id || !inc.opened_at || !inc.severity || !inc.summary) {
      result.warnings.push(
        `incident missing required fields (incident_id/opened_at/severity/summary) — skipped`,
      );
      continue;
    }

    const entryData: Record<string, unknown> = applyAutoRecordedV1Fields(
      {
        incident_id: inc.incident_id,
        detected_at: inc.opened_at,
        detected_by: inc.detected_by ?? "siem",
        severity: inc.severity,
        summary: inc.summary,
        scope: inc.scope ?? "(unspecified)",
        initial_actions: inc.response_actions ?? null,
        closed_at: inc.closed_at ?? null,
        ticket: inc.ticket ?? null,
        // §1 actor_* — detector identity (e.g. "siem", "edr") rather than a
        // user. The user who triages lives on follow-up incident_update entries.
        actor_user: inc.detected_by ?? "siem",
        actor_user_id: null,
        // §1 event_type / event_classification.
        event_type: "incident_opened",
        event_classification: `incident_severity_${inc.severity}`,
        // §1 time anchors.
        occurred_at: inc.opened_at,
        signed_at: null,
        // §1 location.
        system: inc.scope ?? null,
        scope_arm: null,
        // §1 outcome / actions_taken — outcome stays null until the incident
        // is closed; actions_taken carries initial response.
        outcome: inc.closed_at ? "closed" : "open",
        actions_taken: inc.response_actions ?? null,
      },
      {
        ctx,
        boundaryId: primaryBoundary.id,
        detectionMethod: "siem_or_edr",
        detectionSource: inc.detected_by ?? "siem",
      },
    );

    const [existing] = await db
      .select({ id: governanceRegisterEntries.id })
      .from(governanceRegisterEntries)
      .where(
        and(
          eq(governanceRegisterEntries.registerId, targetRegisterId),
          eq(governanceRegisterEntries.entryType, "incident_opened"),
          sql`${governanceRegisterEntries.entryData} ->> 'incident_id' = ${inc.incident_id}`,
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData,
          status: "final",
          finalizedAt: now,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, existing.id));
      result.entries_updated++;
    } else {
      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData,
        entryType: "incident_opened",
        status: "final",
        finalizedAt: now,
      });
      result.entries_inserted++;
    }
  }

  // ── 2. defender_alerts (Pattern A — draft, admin acks, ISSO closes) ───
  if (defenderAlerts.length > 0) {
    // Index existing draft entries by alert_id to make ingest idempotent.
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
          eq(
            governanceRegisterEntries.entryType,
            "defender_alert_acknowledgment",
          ),
        ),
      );
    const existingByAlertId = new Map<string, (typeof existingRows)[number]>();
    for (const r of existingRows) {
      const d = (r.entryData ?? {}) as Record<string, unknown>;
      if (typeof d.alert_id === "string" && d.alert_id) {
        existingByAlertId.set(d.alert_id, r);
      }
    }

    for (const ev of defenderAlerts) {
      if (!ev.alert_id) {
        result.warnings.push("defender_alert missing alert_id — skipped");
        continue;
      }
      if (!ev.detected_at || !ev.occurred_at) {
        result.warnings.push(
          `defender_alert alert_id=${ev.alert_id} missing detected_at/occurred_at — skipped`,
        );
        continue;
      }
      if (!ev.alert_title) {
        result.warnings.push(
          `defender_alert alert_id=${ev.alert_id} missing alert_title — skipped`,
        );
        continue;
      }
      const severity = (ev.severity ?? "high") as string;
      if (!VALID_DEFENDER_SEVERITIES.has(severity)) {
        result.warnings.push(
          `defender_alert alert_id=${ev.alert_id} severity=${severity} not in {high,critical} — skipped`,
        );
        continue;
      }

      const evType =
        ev.event_type && VALID_DEFENDER_EVENT_TYPES.has(ev.event_type)
          ? ev.event_type
          : "other";
      const evClassification =
        severity === "critical"
          ? "endpoint_threat_critical"
          : "endpoint_threat_high";

      const evidenceRefs: Array<Record<string, unknown>> = [
        {
          type: "manifest_id",
          value: ctx.manifestId,
          label: "Source manifest carrying this Defender alert",
        },
      ];
      if (ev.graph_alert_url) {
        evidenceRefs.push({
          type: "ticket_url",
          value: ev.graph_alert_url,
          label: "Microsoft 365 Defender portal — alert detail",
        });
      }
      if (ev.raw_alert_id) {
        evidenceRefs.push({
          type: "external_id",
          value: ev.raw_alert_id,
          label: "Microsoft Graph security/alerts_v2 ID",
        });
      }

      const baseEntryData: Record<string, unknown> = {
        // §1 actor_* (Defender alerts identify by alert id, not user — but
        // we surface user context when present)
        actor_alert_id: ev.alert_id,
        actor_alert_title: ev.alert_title,
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
        system: ev.system ?? null,
        scope_arm: ev.scope_arm ?? null,
        vault_id: ctx.vaultId,
        boundary_id: primaryBoundary.id,
        // §1 detection
        detection_method: "defender_for_endpoint",
        detection_source: ev.detection_source ?? "DefenderCriticalAlertCollector",
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
        // Defender-specific context
        alert_id: ev.alert_id,
        raw_alert_id: ev.raw_alert_id ?? null,
        severity,
        category: ev.category ?? null,
        affected_assets: ev.affected_assets ?? null,
        mitre_techniques: ev.mitre_techniques ?? null,
        graph_alert_url: ev.graph_alert_url ?? null,
        manifest_id: ctx.manifestId,
      };

      const existing = existingByAlertId.get(ev.alert_id);
      if (existing) {
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
          const merged = {
            ...existingData,
            ...baseEntryData,
            evidence_refs: mergedRefs,
          };
          await db
            .update(governanceRegisterEntries)
            .set({ entryData: merged, updatedAt: now })
            .where(eq(governanceRegisterEntries.id, existing.id));
          result.entries_updated++;
        }
        continue;
      }

      await db.insert(governanceRegisterEntries).values({
        registerId: targetRegisterId,
        boundaryId: primaryBoundary.id,
        entryData: baseEntryData,
        entryType: "defender_alert_acknowledgment",
        status: "draft",
      });
      result.entries_inserted++;

      try {
        await writeAuditLog({
          organizationId: ctx.orgId,
          userId: null,
          action: "enclavewatch.defender_alert.detected",
          resourceType: "defender_alert",
          resourceId: ev.alert_id,
          details: {
            alert_title: ev.alert_title,
            severity,
            event_type: evType,
            system: ev.system ?? null,
            actor_user: ev.actor_user ?? null,
            occurred_at: ev.occurred_at,
            graph_alert_url: ev.graph_alert_url ?? null,
            manifest_id: ctx.manifestId,
          },
        });
      } catch {
        // No-op
      }
    }
  }

  result.controls_touched = [...COVERED];
  return result;
};
