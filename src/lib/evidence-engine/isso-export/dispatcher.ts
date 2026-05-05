/**
 * ISSO Export Manifest v1.1 dispatcher.
 *
 * Single ingest path for the multi-register signed weekly export. Routes
 * each top-level section to a registered handler, rolls up telemetry,
 * dedupes by manifest_id, and triggers downstream control_records
 * recomputation for whatever controls were touched.
 *
 * Per the contract in docs/specs/isso-export-manifest-v1.1.md §9.
 *
 * Sprint 1 ships the skeleton + the audit_log_review handler migrated. All
 * other section handlers are no-op stubs (return zero-impact HandlerResult)
 * so the dispatcher accepts every documented section name without error
 * even before Sprints 2/3/5 land their concrete implementations. A no-op
 * handler is a deliberate "feature off" signal — Sprints 2/3/5 swap them
 * out without touching any caller.
 */

import { db } from "@/db";
import { issoExportManifests, controlRecords } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { calculateControlStatus } from "@/lib/control-status";
import { writeAuditLog } from "@/lib/audit";
import { audit_log_reviewHandler } from "./handlers/audit-log-review";
import { maintenance_logHandler } from "./handlers/maintenance-log";
import { previous_period_acknowledgments_reviewHandler } from "./handlers/ack-review";
import { control_freshnessHandler } from "./handlers/control-freshness";
import { incident_logHandler } from "./handlers/incident-log";
import { vuln_remediationHandler } from "./handlers/vuln-remediation";
import { access_authorizationsHandler } from "./handlers/access-authorizations";
import { policy_reviewHandler } from "./handlers/policy-review";
import { assessment_findingsHandler } from "./handlers/assessment-findings";
import { training_completionHandler } from "./handlers/training-completion";
import { media_handling_logHandler } from "./handlers/media-handling-log";
import { personnel_screeningHandler } from "./handlers/personnel-screening";
import { noopHandler } from "./handlers/noop";
import type {
  DispatcherResult,
  HandlerResult,
  IngestContext,
  IssoExportManifest,
  RegisterHandler,
} from "./types";

/**
 * Section name → handler. Sprints 2/3/5 register additional handlers here.
 *
 * Naming convention:
 *  - register sections use the schemaId (singular) — `audit_log_review`,
 *    `maintenance_log`, `incident_log`, etc. The handler decides how to
 *    interpret the inner sub-section keys (e.g. `break_glass_signins[]`).
 *  - cross-cutting sections use their canonical key —
 *    `control_freshness`, `previous_period_acknowledgments_review`.
 */
const SECTION_HANDLERS: Record<string, RegisterHandler> = {
  audit_log_review: audit_log_reviewHandler,
  // Sprint 2: ships break_glass_signins[]. scheduled_maintenance[] +
  // remote_maintenance[] still warn-and-no-op until Sprint 5.
  maintenance_log: maintenance_logHandler,
  // Sprint 5 batch 1:
  incident_log: incident_logHandler,
  access_authorizations: access_authorizationsHandler,
  vuln_remediation: vuln_remediationHandler,
  // Sprint 5 batch 3:
  training_completion: training_completionHandler,
  media_handling_log: media_handling_logHandler,
  personnel_screening: personnel_screeningHandler,
  // Sprint 5 batch 2:
  policy_review: policy_reviewHandler,
  assessment_findings: assessment_findingsHandler,
  // Sprint 3: bumps control_records.updated_at for each freshly_observed
  // control + emits per-control audit events. needing_attention[] currently
  // logs only; Sprint 6 wires it into the dashboard.
  control_freshness: control_freshnessHandler,
  // Sprint 2: closes the loop by applying ISSO outcomes to the entries
  // created by the maintenance_log handler.
  previous_period_acknowledgments_review:
    previous_period_acknowledgments_reviewHandler,
};

export async function dispatchIssoExport(
  ctx: IngestContext,
  body: IssoExportManifest,
): Promise<DispatcherResult> {
  // ── Replay check ────────────────────────────────────────────────────────
  const [existing] = await db
    .select({
      manifestId: issoExportManifests.manifestId,
      responsePayload: issoExportManifests.responsePayload,
    })
    .from(issoExportManifests)
    .where(eq(issoExportManifests.manifestId, ctx.manifestId))
    .limit(1);

  if (existing) {
    const cached = (existing.responsePayload ?? {}) as Partial<DispatcherResult>;
    return {
      ok: true,
      replayed: true,
      manifest_id: ctx.manifestId,
      sections_processed: cached.sections_processed ?? [],
      controls_touched: cached.controls_touched ?? [],
      warnings: cached.warnings ?? [],
    };
  }

  // ── Run handlers ────────────────────────────────────────────────────────
  const perSection: HandlerResult[] = [];
  const sectionsProcessed: string[] = [];
  const controlsTouchedSet = new Set<string>();
  const warnings: string[] = [];

  // Per-register sections
  for (const [section, payload] of Object.entries(body.registers ?? {})) {
    if (payload === undefined || payload === null) continue;
    const handler = SECTION_HANDLERS[section];
    if (!handler) {
      warnings.push(`unknown register section "${section}" — payload ignored`);
      continue;
    }
    const result = await handler(ctx, payload);
    perSection.push(result);
    sectionsProcessed.push(section);
    for (const c of result.controls_touched) controlsTouchedSet.add(c);
    warnings.push(...result.warnings);
  }

  // Cross-cutting sections
  const crossCutting: Array<[string, unknown]> = [
    ["control_freshness", body.control_freshness],
    [
      "previous_period_acknowledgments_review",
      body.previous_period_acknowledgments_review,
    ],
  ];
  for (const [section, payload] of crossCutting) {
    if (payload === undefined || payload === null) continue;
    const handler = SECTION_HANDLERS[section];
    if (!handler) continue;
    const result = await handler(ctx, payload);
    perSection.push(result);
    sectionsProcessed.push(section);
    for (const c of result.controls_touched) controlsTouchedSet.add(c);
    warnings.push(...result.warnings);
  }

  const controlsTouched = [...controlsTouchedSet];

  // ── Recompute affected control records ─────────────────────────────────
  // Best-effort: per-control failure shouldn't roll back the whole ingest.
  if (controlsTouched.length > 0) {
    const recs = await db
      .select({ id: controlRecords.id, controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, ctx.orgId),
          inArray(controlRecords.controlId, controlsTouched),
        ),
      );
    await Promise.all(
      recs.map((r) => calculateControlStatus(r.id).catch(() => null)),
    );
  }

  // ── Persist for replay safety ──────────────────────────────────────────
  const responsePayload: DispatcherResult = {
    ok: true,
    replayed: false,
    manifest_id: ctx.manifestId,
    sections_processed: sectionsProcessed,
    controls_touched: controlsTouched,
    warnings,
    per_section: perSection,
  };

  await db.insert(issoExportManifests).values({
    manifestId: ctx.manifestId,
    organizationId: ctx.orgId,
    vaultId: ctx.vaultId,
    manifestVersion: ctx.manifestVersion,
    reviewPeriodStart: ctx.reviewPeriodStart,
    reviewPeriodEnd: ctx.reviewPeriodEnd,
    receivedAt: ctx.receivedAt,
    responsePayload: responsePayload as unknown as Record<string, unknown>,
    controlsTouched: controlsTouched as unknown as Record<string, unknown>,
    sectionsProcessed: sectionsProcessed as unknown as Record<string, unknown>,
  });

  // Audit-log the ingest so /admin/audit-logs surfaces it for assessors.
  // Best-effort — don't roll back ingest if the audit write fails.
  try {
    await writeAuditLog({
      organizationId: ctx.orgId,
      action: "enclavewatch.isso_export.ingested",
      resourceType: "isso_export_manifest",
      resourceId: ctx.manifestId,
      details: {
        manifest_version: ctx.manifestVersion,
        vault_id: ctx.vaultId,
        review_period_end: ctx.reviewPeriodEnd.toISOString(),
        sections_processed: sectionsProcessed,
        controls_touched: controlsTouched,
        warnings_count: warnings.length,
      },
    });
  } catch {
    // No-op; stdout already captured the event.
  }

  return responsePayload;
}
