import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries, governanceRegisterEntryFiles } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { errorResponse } from "@/lib/evidence-engine/api-errors";
import { requireBoundaryForOrg } from "@/lib/evidence-engine/validate-boundary";
import { validateRunManifest, validateControlResults, validateEvidenceIndex } from "@/lib/collector/schema-validate";
import { logEntryEvent } from "@/lib/evidence-engine/entry-events";
import { ensureEvidenceEngineRegistersForOrg } from "@/lib/evidence-engine/control-dashboard";

type RunManifest = {
  collector?: { version?: string };
  summary?: { checks_total?: number; pass?: number; fail?: number; warn?: number; error?: number; na?: number; overall_status?: string };
};

type ControlResults = { results?: Record<string, unknown> };

type EvidenceIndex = {
  files?: Array<{
    path: string;
    sha256: string;
    bytes: number;
    exportable?: boolean;
  }>;
};

/**
 * POST /api/evidence-engine/collector-runs/ingest
 * Body: { boundary_id, run_id, vault_outputs_root, run_manifest, control_results, evidence_index }
 * Validates payloads against collector schemas, creates technical_compliance_run entry and attachment metadata.
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const body = await req.json().catch(() => ({}));
    const boundaryId = body.boundary_id as string | undefined;
    const runId = body.run_id as string | undefined;
    const vaultOutputsRoot = body.vault_outputs_root as string | undefined;
    const runManifest = body.run_manifest as unknown;
    const controlResults = body.control_results as unknown;
    const evidenceIndex = body.evidence_index as unknown;

    if (!boundaryId || typeof boundaryId !== "string") {
      return errorResponse("boundary_id required", 400, { code: "VALIDATION_ERROR", fields: { boundary_id: "required" } });
    }

    const boundaryResult = await requireBoundaryForOrg(orgId, boundaryId);
    if (boundaryResult instanceof NextResponse) return boundaryResult;
    const { boundary } = boundaryResult;

    if (!runId || typeof runId !== "string") {
      return errorResponse("run_id required", 400, { code: "VALIDATION_ERROR" });
    }
    if (!vaultOutputsRoot || typeof vaultOutputsRoot !== "string") {
      return errorResponse("vault_outputs_root required", 400, { code: "VALIDATION_ERROR" });
    }

    const r1 = validateRunManifest(runManifest);
    if (!r1.ok) {
      return NextResponse.json({ error: "run_manifest validation failed", code: "SCHEMA_ERROR", errors: r1.errors }, { status: 400 });
    }
    const r2 = validateControlResults(controlResults);
    if (!r2.ok) {
      return NextResponse.json({ error: "control_results validation failed", code: "SCHEMA_ERROR", errors: r2.errors }, { status: 400 });
    }
    const r3 = validateEvidenceIndex(evidenceIndex);
    if (!r3.ok) {
      return NextResponse.json({ error: "evidence_index validation failed", code: "SCHEMA_ERROR", errors: r3.errors }, { status: 400 });
    }

    const manifest = runManifest as RunManifest;
    const summary = manifest.summary ?? {};
    const collectorVersion = manifest.collector?.version ?? "unknown";
    const overallStatus = summary.overall_status ?? "pass";
    const checksTotal = summary.checks_total ?? 0;
    const pass = summary.pass ?? 0;
    const fail = summary.fail ?? 0;
    const warn = summary.warn ?? 0;
    const error = summary.error ?? 0;
    const na = summary.na ?? 0;

    await ensureEvidenceEngineRegistersForOrg(orgId);

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          eq(governanceRegisters.registerKey, "technical_compliance_run")
        )
      );
    if (!register) {
      return errorResponse("Register technical_compliance_run not found for org", 404);
    }

    const finalize = (req.url && new URL(req.url).searchParams.get("finalize") === "1") || false;

    const entryData: Record<string, unknown> = {
      run_id: runId,
      collector_version: collectorVersion,
      checks_total: checksTotal,
      pass,
      fail,
      warn,
      error,
      na,
      overall_status: overallStatus,
      vault_outputs_root: vaultOutputsRoot,
      control_results: (controlResults as ControlResults).results ?? {},
    };

    const [entry] = await db
      .insert(governanceRegisterEntries)
      .values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryType: "collector_run",
        status: finalize ? "final" : "draft",
        entryData,
        finalizedAt: finalize ? new Date() : null,
        hold: 0,
      })
      .returning();

    if (!entry) {
      return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
    }

    const files = (evidenceIndex as EvidenceIndex).files ?? [];
    const normalizedRoot = vaultOutputsRoot.replace(/\\/g, "/").replace(/\/$/, "");

    for (const f of files) {
      const vaultPath = `${normalizedRoot}/${f.path.replace(/\\/g, "/")}`;
      await db.insert(governanceRegisterEntryFiles).values({
        registerEntryId: entry.id,
        boundaryId: boundary.id,
        fileUrl: vaultPath,
        sha256Hash: f.sha256 ?? null,
        fileSize: f.bytes ?? null,
        originalFilename: f.path.split(/[/\\]/).pop() ?? f.path,
        exportable: f.exportable === true,
      });
    }

    await logEntryEvent(orgId, entry.id, boundary.id, "collector_run_ingested", null, { run_id: runId });

    return NextResponse.json({ entryId: entry.id, run_id: runId, boundary_id: boundary.id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg, code: "INTERNAL_ERROR" }, { status: 500 });
  }
}
