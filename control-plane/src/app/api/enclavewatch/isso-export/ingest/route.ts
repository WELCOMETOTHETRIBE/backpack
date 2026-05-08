import { NextResponse } from "next/server";
import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { dispatchIssoExport } from "@/lib/evidence-engine/isso-export/dispatcher";
import type {
  IssoExportManifest,
  IngestContext,
  ManifestVersion,
} from "@/lib/evidence-engine/isso-export/types";

/**
 * POST /api/enclavewatch/isso-export/ingest
 *
 * Ingests an ISSO Export Manifest (v1.1). Each top-level register section is
 * dispatched to its handler. Idempotent on `manifest_id` — replaying the same
 * manifest is a no-op that returns the cached response payload.
 *
 * Per the contract in docs/specs/isso-export-manifest-v1.1.md §9.
 *
 * Auth: bearer token (organizations.enclavewatch_api_token) OR session.
 *
 * Sprint 1 ships:
 *   - dispatcher skeleton + manifest_id dedupe
 *   - audit_log_review handler migrated from /weekly-review/ingest
 *   - all other section handlers as no-ops (Sprints 2/3/5 swap them in)
 */

const FORBIDDEN_RAW_KEYS = [
  "raw_event_xml",
  "raw_event_body",
  "command_line",
  "raw_command_line",
  "password",
  "secret",
  "private_key",
];

function findForbiddenKey(value: unknown, path: string[] = []): string | null {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findForbiddenKey(value[i], [...path, `[${i}]`]);
      if (found) return found;
    }
    return null;
  }
  const obj = value as Record<string, unknown>;
  for (const k of Object.keys(obj)) {
    if (FORBIDDEN_RAW_KEYS.includes(k.toLowerCase())) {
      return [...path, k].join(".");
    }
    const found = findForbiddenKey(obj[k], [...path, k]);
    if (found) return found;
  }
  return null;
}

export async function POST(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = ctx.orgId;

  let body: IssoExportManifest;
  try {
    body = (await req.json()) as IssoExportManifest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ── Forbidden keys ──
  const forbidden = findForbiddenKey(body);
  if (forbidden) {
    return NextResponse.json(
      {
        error: `Payload contains forbidden key at "${forbidden}"`,
        code: "FORBIDDEN_KEY_REJECTED",
      },
      { status: 400 },
    );
  }

  // ── Required top-level fields ──
  if (!body.manifest_id || typeof body.manifest_id !== "string") {
    return NextResponse.json(
      { error: "manifest_id is required (sha256 hex of canonical body + vault + period)" },
      { status: 400 },
    );
  }
  if (!body.acknowledgement?.vault_id) {
    return NextResponse.json(
      { error: "acknowledgement.vault_id is required" },
      { status: 400 },
    );
  }
  if (!body.acknowledgement?.review_period_end) {
    return NextResponse.json(
      { error: "acknowledgement.review_period_end is required" },
      { status: 400 },
    );
  }

  const manifestVersion: ManifestVersion =
    body.manifest_version === "1.0" || body.manifest_version === "1.1"
      ? body.manifest_version
      : "1.1";

  let reviewPeriodEnd: Date;
  let reviewPeriodStart: Date | null;
  try {
    reviewPeriodEnd = new Date(body.acknowledgement.review_period_end);
    if (Number.isNaN(reviewPeriodEnd.getTime())) {
      throw new Error("invalid review_period_end");
    }
    reviewPeriodStart = body.acknowledgement.review_period_start
      ? new Date(body.acknowledgement.review_period_start)
      : null;
    if (reviewPeriodStart && Number.isNaN(reviewPeriodStart.getTime())) {
      reviewPeriodStart = null;
    }
  } catch {
    return NextResponse.json(
      { error: "review_period_start/end must be RFC3339 timestamps" },
      { status: 400 },
    );
  }

  const ingestCtx: IngestContext = {
    orgId,
    vaultId: body.acknowledgement.vault_id,
    manifestId: body.manifest_id,
    manifestVersion,
    reviewPeriodStart,
    reviewPeriodEnd,
    receivedAt: new Date(),
  };

  let result;
  try {
    result = await dispatchIssoExport(ingestCtx, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "dispatch failed";
    console.error(
      JSON.stringify({
        event: "isso_export_ingest_failed",
        orgId,
        manifestId: body.manifest_id,
        error: msg,
      }),
    );
    return NextResponse.json(
      { error: "Dispatch failed", message: msg, code: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  console.log(
    JSON.stringify({
      event: "isso_export_ingested",
      orgId,
      vaultId: body.acknowledgement.vault_id,
      manifestId: body.manifest_id,
      replayed: result.replayed,
      sectionsProcessed: result.sections_processed,
      controlsTouched: result.controls_touched,
      warnings: result.warnings.length,
    }),
  );

  return NextResponse.json(result);
}
