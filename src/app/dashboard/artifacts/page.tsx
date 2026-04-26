import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  artifacts,
  controlRecords,
  controls,
  controlFamilies,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
} from "@/db/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { countLinksForArtifacts } from "@/lib/artifacts/artifact-links";
import { MILESTONES_BY_KEY } from "@/data/cmmc/client-required-artifacts";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";
import { resolveRegisterKeyCandidates, schemaIdForRegisterKey } from "@/data/cmmc/register-key-aliases";
import { ArtifactsTable, type ArtifactRow } from "./ArtifactsTable";

export default async function ArtifactsPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const rows = await db
    .select({
      artifact: artifacts,
      controlId: controls.controlId,
      controlTitle: controls.title,
      family: controlFamilies.code,
      implementationStatus: controlRecords.implementationStatus,
    })
    .from(artifacts)
    .innerJoin(controlRecords, eq(artifacts.controlRecordId, controlRecords.id))
    .innerJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(eq(artifacts.organizationId, orgId))
    .orderBy(desc(artifacts.expectedDueDate));

  const NON_APPLICABLE = new Set(["inherited", "not_applicable"]);

  const linkCounts = await countLinksForArtifacts(
    orgId,
    rows.map((r) => r.artifact.id)
  );

  // ── Register coverage for register_pointer artifacts ────────────────────
  // An artifact with closureType="register_pointer" is semantically redundant
  // with the register it points at — it's a pointer, not a document. When the
  // register is satisfied (final entries > 0, OR event-driven empty while
  // provisioned), the pointer is covered and should NOT appear as outstanding
  // work in the Artifacts tab.
  const orgRegisterRows = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));
  const provisionedKeys = new Set(orgRegisterRows.map((r) => r.registerKey));
  const orgBoundaries = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const boundaryIds = orgBoundaries.map((b) => b.id);
  const finalCounts = new Map<string, number>();
  if (orgRegisterRows.length > 0) {
    const finalRows = await db
      .select({
        registerKey: governanceRegisters.registerKey,
        cnt: sql<number>`count(${governanceRegisterEntries.id})::int`,
      })
      .from(governanceRegisters)
      .leftJoin(
        governanceRegisterEntries,
        and(
          eq(governanceRegisterEntries.registerId, governanceRegisters.id),
          eq(governanceRegisterEntries.status, "final"),
          ...(boundaryIds.length > 0
            ? [inArray(governanceRegisterEntries.boundaryId, boundaryIds)]
            : [])
        )
      )
      .where(eq(governanceRegisters.organizationId, orgId))
      .groupBy(governanceRegisters.registerKey);
    for (const r of finalRows) finalCounts.set(r.registerKey, Number(r.cnt) || 0);
  }

  function registerPointerCoverage(milestoneKey: string | null):
    | { coveredBy: string; reason: "populated" | "event_driven_empty" }
    | null {
    if (!milestoneKey) return null;
    const milestone = MILESTONES_BY_KEY.get(milestoneKey);
    if (!milestone || milestone.closureType !== "register_pointer") return null;
    const pointerKey = milestone.registerKey;
    if (!pointerKey) return null;
    const candidates = resolveRegisterKeyCandidates(pointerKey);
    for (const k of candidates) {
      if ((finalCounts.get(k) ?? 0) > 0) return { coveredBy: pointerKey, reason: "populated" };
    }
    const schemaId = schemaIdForRegisterKey(pointerKey);
    const cadence = getCadenceRuleByRegisterId(schemaId);
    const isEventDriven = cadence?.cadence_days === 0;
    const provisioned = candidates.some((k) => provisionedKeys.has(k));
    if (isEventDriven && provisioned) {
      return { coveredBy: pointerKey, reason: "event_driven_empty" };
    }
    return null;
  }

  const tableRows: ArtifactRow[] = rows.map((r) => {
    const coverage = registerPointerCoverage(r.artifact.milestoneKey);
    // N/A cascade: when the artifact's backing control is inherited or
    // not_applicable for this org, the artifact has no active obligation.
    // Keep the row visible (traceability) but mark N/A and exclude from
    // outstanding counts.
    const controlNotApplicable = NON_APPLICABLE.has(r.implementationStatus);
    return {
      id: r.artifact.id,
      label: r.artifact.artifactLabel,
      status: r.artifact.status,
      controlId: r.controlId,
      controlTitle: r.controlTitle ?? r.controlId,
      family: r.family,
      expectedClosureType: r.artifact.expectedClosureType,
      expectedEvidenceType: r.artifact.expectedEvidenceType,
      expectedCadence: r.artifact.expectedCadence,
      expectedDueDate: r.artifact.expectedDueDate,
      fileName: r.artifact.fileName,
      fileSize: r.artifact.fileSize,
      version: r.artifact.version,
      uploadedAt: r.artifact.updatedAt.toISOString(),
      linkCounts: linkCounts.get(r.artifact.id) ?? {
        control: 0,
        register_entry: 0,
        poam_entry: 0,
        poam_milestone: 0,
      },
      coveredByRegister: coverage?.coveredBy ?? null,
      coverageReason: coverage?.reason ?? null,
      controlNotApplicable,
      controlImplementationStatus: r.implementationStatus,
    };
  });

  const visibleRows = tableRows.filter((r) => !r.coveredByRegister);
  const coveredCount = tableRows.length - visibleRows.length;

  // Counters only include rows with active obligation — both
  // register-covered rows and N/A rows are excluded from the
  // "awaiting / uploaded / approved" summary so the numbers reflect
  // actual work, not historical bookkeeping.
  const countable = visibleRows.filter((r) => !r.controlNotApplicable);
  const counts = {
    total: countable.length,
    awaiting: countable.filter((r) => r.status === "awaiting_upload").length,
    uploaded: countable.filter((r) => r.status === "uploaded").length,
    approved: countable.filter((r) => r.status === "approved").length,
  };
  const notApplicableCount = visibleRows.length - countable.length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--color-text)]">Artifacts</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Centralized evidence library. One artifact can satisfy many controls,
          register entries, and POA&M milestones.
        </p>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="Total" value={counts.total} />
        <Stat label="Awaiting upload" value={counts.awaiting} tone="warning" />
        <Stat label="Uploaded" value={counts.uploaded} tone="info" />
        <Stat label="Approved" value={counts.approved} tone="success" />
      </div>

      {coveredCount > 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          {coveredCount} register-pointer artifact{coveredCount === 1 ? "" : "s"} hidden — covered by the
          {" "}
          <a href="/dashboard/registers" className="font-medium text-indigo-600 hover:underline">
            Registers tab
          </a>
          . Those controls are satisfied through register entries (or by an event-driven register that correctly stays empty until a triggering event).
        </p>
      )}

      {notApplicableCount > 0 && (
        <p className="text-xs text-[var(--color-text-muted)]">
          {notApplicableCount} artifact{notApplicableCount === 1 ? "" : "s"} marked <strong>N/A</strong> — the backing control is inherited or not applicable for your organization. Rows remain visible for traceability but are excluded from the active counts above.
        </p>
      )}

      <ArtifactsTable rows={visibleRows} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warning" | "info" | "success";
}) {
  const toneClass =
    tone === "warning"
      ? "text-amber-600"
      : tone === "info"
      ? "text-sky-600"
      : tone === "success"
      ? "text-emerald-600"
      : "text-[var(--color-text)]";
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
