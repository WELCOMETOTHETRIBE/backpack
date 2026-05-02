import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  evidenceRuns,
  evidenceFindings,
  controlRecords,
  boundaries,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { calculateControlStatus } from "@/lib/control-status";
import { createHash } from "crypto";

/**
 * POST /api/enclavewatch/weekly-review/ingest
 *
 * Accepts a signed weekly-review acknowledgement package from MacTech
 * EnclaveWatch (the local audit + drift-validation + ISSO-review service
 * running inside the customer's CUI Vault). The package summarises a
 * completed weekly ISSO review without moving raw enclave logs into the
 * codex -- raw events stay on the vault per the boundary rules.
 *
 * Records:
 *   - One evidenceRuns row (source = "enclavewatch_weekly_review")
 *     containing the acknowledgement metadata (period, signatory, hashes)
 *   - One evidenceFindings row per covered control (status PASS) so
 *     hasOperationalEvidence() recognises the weekly review as the
 *     operational-evidence lane for 3.3.2 / 3.3.3 / 3.12.3 (and any
 *     additional controls EnclaveWatch's check-catalog covers).
 *
 * Rejects packages that include forbidden raw payloads (raw_event_xml,
 * raw_event_body, command_line, etc.) -- the Codex side enforces the
 * "metadata-only" boundary in addition to EnclaveWatch's own validator.
 */

// Fields whose presence anywhere in the package indicates a raw-log leak;
// matches the EnclaveWatch ICodexExportContentValidator policy.
const FORBIDDEN_RAW_KEYS = [
  "raw_event_xml",
  "raw_event_body",
  "raw_powershell",
  "command_line",
  "raw_command_line",
  "event_xml",
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

// EnclaveWatch's check catalog ties checks to controls via control_refs in
// CMMC L2 long form ("AU.L2-3.3.2"). We need NIST short form ("3.3.2") for
// our control_records table.
function toNistShort(controlRef: string): string | null {
  const m = controlRef.match(/(\d+\.\d+\.\d+)$/);
  return m ? m[1] : null;
}

const DEFAULT_COVERED_CONTROLS = ["3.3.2", "3.3.3", "3.3.5", "3.12.3"];

type AckPackage = {
  acknowledgement: {
    export_type: string;
    schema_version?: string;
    vault_id: string;
    customer_id?: string;
    review_period_start: string;
    review_period_end: string;
    review_result: string;
    raw_logs_retained_on_vault: boolean;
    event_count?: number;
    evidence_bundle_hash?: string;
    weekly_manifest_hash?: string;
    export_signature?: string;
  };
  control_mapping_summary?: {
    controls?: Array<{ control_ref: string; status?: string }>;
  };
  finding_summary?: {
    findings?: Array<{ id: string; severity?: string; status?: string }>;
  };
  manifest_hashes?: {
    daily_manifest_hashes?: string[];
    weekly_manifest_hash?: string;
  };
};

export async function POST(req: Request) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AckPackage;
  try {
    body = (await req.json()) as AckPackage;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ack = body.acknowledgement;
  if (!ack) {
    return NextResponse.json(
      { error: "Missing acknowledgement object" },
      { status: 400 },
    );
  }
  if (ack.export_type !== "enclavewatch_weekly_audit_acknowledgement") {
    return NextResponse.json(
      {
        error: `export_type must be "enclavewatch_weekly_audit_acknowledgement", got "${ack.export_type}"`,
        code: "SCHEMA_MISMATCH",
      },
      { status: 400 },
    );
  }
  if (!ack.vault_id || !ack.review_period_start || !ack.review_period_end) {
    return NextResponse.json(
      { error: "vault_id, review_period_start, review_period_end are required" },
      { status: 400 },
    );
  }
  if (ack.raw_logs_retained_on_vault !== true) {
    return NextResponse.json(
      {
        error:
          "raw_logs_retained_on_vault must be true -- the codex stays outside the CUI boundary",
        code: "BOUNDARY_VIOLATION",
      },
      { status: 400 },
    );
  }

  // Defense-in-depth: reject packages containing any forbidden raw payload.
  // EnclaveWatch's own validator should catch this, but the codex re-enforces
  // because we sit outside the CUI boundary.
  const forbiddenPath = findForbiddenKey(body);
  if (forbiddenPath) {
    return NextResponse.json(
      {
        error: `Package contains forbidden raw-log key at "${forbiddenPath}". Raw audit content must stay inside the vault.`,
        code: "RAW_LOG_LEAK_REJECTED",
      },
      { status: 400 },
    );
  }

  // Resolve the org's primary boundary -- weekly review runs are scoped
  // to the boundary EnclaveWatch is monitoring.
  const [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!boundary) {
    return NextResponse.json(
      { error: "No system boundary found for org" },
      { status: 400 },
    );
  }

  // Idempotency: same weekly review (same evidence_bundle_hash +
  // weekly_manifest_hash) cannot be ingested twice. Re-uploads of the
  // same review overwrite the prior evidenceRuns row.
  const fingerprint = createHash("sha256")
    .update(
      [
        "enclavewatch_weekly_review",
        ack.vault_id,
        ack.evidence_bundle_hash ?? "",
        ack.weekly_manifest_hash ?? "",
        ack.review_period_start,
        ack.review_period_end,
      ].join("|"),
    )
    .digest("hex");

  await db
    .delete(evidenceRuns)
    .where(
      and(
        eq(evidenceRuns.organizationId, orgId),
        eq(evidenceRuns.runFingerprint, fingerprint),
      ),
    );

  const runId = `EW-${ack.review_period_end.slice(0, 10)}-${ack.vault_id.slice(0, 8)}`;
  const [run] = await db
    .insert(evidenceRuns)
    .values({
      organizationId: orgId,
      systemId: boundary.id,
      runId,
      collectedAt: new Date(ack.review_period_end),
      collectorName: "enclavewatch",
      collectorVersion: ack.schema_version ?? "1",
      bundleRoot: `enclavewatch://${ack.vault_id}`,
      manifest: body as unknown as Record<string, unknown>,
      hashAlgorithm: "sha256",
      source: "enclavewatch_weekly_review",
      boundaryId: boundary.id,
      runFingerprint: fingerprint,
    })
    .returning();
  if (!run) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  // Determine which controls this review covers. Prefer the explicit
  // control_mapping_summary (EnclaveWatch's own assertion) and fall back
  // to the default audit family the program covers by design.
  const mappedControlsRaw =
    body.control_mapping_summary?.controls?.map((c) => c.control_ref) ?? [];
  const mappedNistIds = mappedControlsRaw
    .map(toNistShort)
    .filter((x): x is string => Boolean(x));
  const coveredControls =
    mappedNistIds.length > 0 ? mappedNistIds : DEFAULT_COVERED_CONTROLS;

  // Write a PASS finding per covered control. The weekly review confirms
  // the audit program is operational; per-check pass/fail nuance lives in
  // EnclaveWatch's own UI -- the codex side just records "the program ran
  // and the ISSO signed off."
  const findings = coveredControls.map((controlId) => ({
    evidenceRunId: run.id,
    controlId,
    pass: true,
    observed: `Weekly review ${ack.review_period_start.slice(0, 10)} -> ${ack.review_period_end.slice(0, 10)} completed by ISSO. Result: ${ack.review_result}. Events covered: ${ack.event_count ?? "n/a"}.`,
    expected: "Weekly ISSO review completed within the 7-day cadence per EnclaveWatch program.",
    evidenceHint: `enclavewatch://${ack.vault_id}/weekly-review/${runId}`,
    evidenceFilesUsed: [],
    providerOrCustomer: "customer",
    layer: "Audit/Continuous Monitoring",
    details: {
      review_result: ack.review_result,
      event_count: ack.event_count ?? null,
      evidence_bundle_hash: ack.evidence_bundle_hash ?? null,
      weekly_manifest_hash: ack.weekly_manifest_hash ?? null,
      finding_count: body.finding_summary?.findings?.length ?? 0,
    },
    partial: false,
  }));
  if (findings.length > 0) {
    await db.insert(evidenceFindings).values(findings);
  }

  // Recompute affected control statuses so the dashboard reflects the
  // new operational evidence. Best-effort -- failure here doesn't roll
  // back the ingest.
  let recomputed = 0;
  for (const controlId of coveredControls) {
    const [rec] = await db
      .select({ id: controlRecords.id })
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId),
        ),
      )
      .limit(1);
    if (rec) {
      await calculateControlStatus(rec.id).catch(() => null);
      recomputed++;
    }
  }

  console.log(
    JSON.stringify({
      event: "enclavewatch_weekly_review_ingested",
      orgId,
      runId,
      vaultId: ack.vault_id,
      reviewPeriodEnd: ack.review_period_end,
      eventCount: ack.event_count ?? null,
      coveredControls,
      findingCount: body.finding_summary?.findings?.length ?? 0,
    }),
  );

  return NextResponse.json({
    ok: true,
    evidence_run_id: run.id,
    run_id: runId,
    covered_controls: coveredControls,
    recomputed_controls: recomputed,
    review_period: {
      start: ack.review_period_start,
      end: ack.review_period_end,
    },
    review_result: ack.review_result,
  });
}
