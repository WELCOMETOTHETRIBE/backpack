import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  artifacts,
  controlRecords,
  controls,
  controlFamilies,
} from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { countLinksForArtifacts } from "@/lib/artifacts/artifact-links";
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
    })
    .from(artifacts)
    .innerJoin(controlRecords, eq(artifacts.controlRecordId, controlRecords.id))
    .innerJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(eq(artifacts.organizationId, orgId))
    .orderBy(desc(artifacts.expectedDueDate));

  const linkCounts = await countLinksForArtifacts(
    orgId,
    rows.map((r) => r.artifact.id)
  );

  const tableRows: ArtifactRow[] = rows.map((r) => ({
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
  }));

  const counts = {
    total: tableRows.length,
    awaiting: tableRows.filter((r) => r.status === "awaiting_upload").length,
    uploaded: tableRows.filter((r) => r.status === "uploaded").length,
    approved: tableRows.filter((r) => r.status === "approved").length,
  };

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

      <ArtifactsTable rows={tableRows} />
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
