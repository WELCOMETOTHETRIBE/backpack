import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  boundaries,
  evidenceRuns,
  evidenceFindings,
  controlRecords,
  poamEntries,
  poamEntryMilestones,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { isValidatorReport } from "@/lib/evidence/validator-report";
import {
  computeRunFingerprint,
  computeInputsManifestSha256,
} from "@/lib/evidence/ingest";
import { controlIdToNist } from "@/lib/compliance/controlId";

const MFA_ATTESTATION_MILESTONE_TITLE =
  "Submit MFA-in-path attestation (move from draft to submitted) to close out; or implement MFA in enclave access path. If access is local RDP without MFA, remove draft file or treat run as aspirational.";
const MFA_ATTESTATION_WEAKNESS =
  "Control satisfied only by MFA-in-path attestation (draft) or check failed. Submit attestation (draft to submitted) or implement MFA in enclave access path; if access remains local RDP without MFA, remove draft file and treat run as aspirational.";
const MFA_ATTESTATION_REMEDIATION =
  "Submit MFA-in-path attestation (draft to submitted) or implement MFA in enclave access path; if access remains local RDP without MFA, remove draft file and treat run as aspirational.";

type ReportBody = {
  run_id: string;
  collected_at: string; // ISO
  report: unknown;
};

/**
 * POST /api/os-baselines/boundaries/[id]/evidence-runs/import-report
 * Bulk import Azure/Entra validation report (validator + checks). Creates one evidence run and findings.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: boundaryId } = await params;
  const [boundary] = await db
    .select()
    .from(boundaries)
    .where(and(eq(boundaries.id, boundaryId), eq(boundaries.organizationId, orgId)));
  if (!boundary) return NextResponse.json({ error: "Boundary not found" }, { status: 404 });

  let body: ReportBody;
  try {
    body = (await req.json()) as ReportBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.run_id?.trim() || !body.collected_at?.trim() || body.report == null) {
    return NextResponse.json(
      { error: "run_id, collected_at, and report are required" },
      { status: 400 }
    );
  }
  if (!isValidatorReport(body.report)) {
    return NextResponse.json(
      { error: "report must have validator (name, version) and checks array" },
      { status: 400 }
    );
  }

  const report = body.report;
  const validatorSha = (report.validator as { sha256?: string }).sha256 ?? "";
  const inputs = Array.isArray(report.inputs) ? report.inputs : [];
  const inputsSha = computeInputsManifestSha256(
    inputs.map((i) => ({
      filename: (i as { filename?: string }).filename ?? "",
      sha256: (i as { sha256?: string }).sha256,
      size: (i as { size?: number }).size,
    }))
  );
  const runFingerprint = computeRunFingerprint({
    source: "azure_entra",
    validator_sha256: validatorSha,
    inputs_manifest_sha256: inputsSha,
  });

  const [run] = await db
    .insert(evidenceRuns)
    .values({
      organizationId: orgId,
      systemId: boundaryId,
      runId: body.run_id.trim(),
      collectedAt: new Date(body.collected_at.trim()),
      collectorName: "azure_entra",
      collectorVersion: (report.validator as { version?: string }).version ?? "1",
      bundleRoot: "",
      manifest: report as unknown as Record<string, unknown>,
      hashAlgorithm: "sha256",
      source: "azure_entra",
      boundaryId,
      runFingerprint,
    })
    .returning();

  if (!run) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

  const checks = report.checks as Array<{
    control: string;
    pass: boolean;
    partial?: boolean;
    observed: string;
    expected: string;
    evidence_hint: string;
    evidence_files_used: string[];
    provider_or_customer: string;
    layer: string | null;
    details?: Record<string, unknown>;
    mfa_in_path_source?: string;
  }>;

  if (checks.length > 0) {
    await db.insert(evidenceFindings).values(
      checks.map((c) => ({
        evidenceRunId: run.id,
        controlId: controlIdToNist(c.control),
        pass: c.pass,
        observed: c.observed ?? "",
        expected: c.expected ?? "",
        evidenceHint: c.evidence_hint ?? "",
        evidenceFilesUsed: Array.isArray(c.evidence_files_used) ? c.evidence_files_used : [],
        providerOrCustomer:
          c.provider_or_customer === "provider" ||
          c.provider_or_customer === "customer" ||
          c.provider_or_customer === "shared"
            ? c.provider_or_customer
            : "shared",
        layer: c.layer ?? null,
        details: c.details ?? null,
        partial: Boolean(c.partial),
      }))
    );
  }

  const passedCount = checks.filter((c) => c.pass).length;
  const failedCount = checks.filter((c) => !c.pass).length;

  const controlIdsNeedingPoam = new Set<string>();
  for (const c of checks) {
    const nistId = controlIdToNist(c.control);
    if (!nistId) continue;
    const failed = !c.pass;
    const attestationOnly =
      c.pass && (c.mfa_in_path_source === "attestation");
    if (failed || attestationOnly) controlIdsNeedingPoam.add(nistId);
  }

  let poamCreated = 0;
  for (const controlId of controlIdsNeedingPoam) {
    let [record] = await db
      .select()
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.organizationId, orgId),
          eq(controlRecords.controlId, controlId)
        )
      )
      .limit(1);

    if (!record) {
      await db.insert(controlRecords).values({
        organizationId: orgId,
        controlId,
      });
      [record] = await db
        .select()
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            eq(controlRecords.controlId, controlId)
          )
        )
        .limit(1);
    }
    if (!record) continue;

    let [entry] = await db
      .select()
      .from(poamEntries)
      .where(
        and(
          eq(poamEntries.organizationId, orgId),
          eq(poamEntries.controlRecordId, record.id)
        )
      )
      .limit(1);

    if (!entry) {
      const [inserted] = await db
        .insert(poamEntries)
        .values({
          organizationId: orgId,
          controlRecordId: record.id,
          weaknessDescription: MFA_ATTESTATION_WEAKNESS,
          remediationPlan: MFA_ATTESTATION_REMEDIATION,
          scheduledCompletionDate: null,
          responsibleRoleId: null,
        })
        .returning();
      if (inserted) {
        entry = inserted;
        poamCreated++;
      }
    }

    if (entry) {
      const existingMilestones = await db
        .select()
        .from(poamEntryMilestones)
        .where(eq(poamEntryMilestones.poamEntryId, entry.id));
      const hasMfaMilestone = existingMilestones.some(
        (m) => m.title === MFA_ATTESTATION_MILESTONE_TITLE
      );
      if (!hasMfaMilestone) {
        await db.insert(poamEntryMilestones).values({
          poamEntryId: entry.id,
          title: MFA_ATTESTATION_MILESTONE_TITLE,
          dueDate: null,
          orderIndex: existingMilestones.length,
        });
      }
    }

    await db
      .update(controlRecords)
      .set({ implementationStatus: "in_progress", updatedAt: new Date() })
      .where(eq(controlRecords.id, record.id));
  }

  return NextResponse.json({
    ok: true,
    evidence_run_id: run.id,
    run_id: body.run_id,
    findings_count: checks.length,
    passed_count: passedCount,
    failed_count: failedCount,
    poam_entries_created: poamCreated,
    controls_marked_partial: controlIdsNeedingPoam.size,
  });
}
