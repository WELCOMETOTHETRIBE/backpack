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
import { audit_log_reviewHandler } from "./handlers/audit-log-review";
import { maintenance_logHandler } from "./handlers/maintenance-log";
import { previous_period_acknowledgments_reviewHandler } from "./handlers/ack-review";
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
  incident_log: noopHandler("incident_log"),
  access_authorizations: noopHandler("access_authorizations"),
  vuln_remediation: noopHandler("vuln_remediation"),
  training_completion: noopHandler("training_completion"),
  policy_review: noopHandler("policy_review"),
  assessment_findings: noopHandler("assessment_findings"),
  // Sprint 3 swaps in the freshness handler that bumps last_evaluated_at.
  control_freshness: noopHandler("control_freshness"),
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

  return responsePayload;
}
