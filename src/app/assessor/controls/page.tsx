import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  controlRecords,
  controls,
  controlEvidenceLinks,
  poamEntries,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { AssessorControlsClient, type AssessorControl } from "./AssessorControlsClient";

/** Derive NIST family code ("3.1", "3.2", etc.) from a control ID like "3.1.1". */
function familyOf(controlId: string): string {
  const parts = controlId.split(".");
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : controlId;
}

export default async function AssessorControlsPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId || user?.role !== "Assessor") redirect("/auth/signin");

  // ── Fetch all control records ──
  const records = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      governanceNarrative: controlRecords.governanceNarrative,
      title: controls.title,
    })
    .from(controlRecords)
    .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .where(eq(controlRecords.organizationId, orgId));

  const recordMap = new Map<string, (typeof records)[0]>();
  for (const r of records) recordMap.set(r.controlId, r);

  // ── Evidence counts (by controlRecordId) ──
  const evidenceLinks = await db
    .select({ controlRecordId: controlEvidenceLinks.controlRecordId })
    .from(controlEvidenceLinks)
    .where(eq(controlEvidenceLinks.organizationId, orgId));

  const evidenceCountMap = new Map<string, number>();
  for (const e of evidenceLinks) {
    evidenceCountMap.set(e.controlRecordId, (evidenceCountMap.get(e.controlRecordId) ?? 0) + 1);
  }

  // ── Open POA&M set (by controlRecordId) ──
  const openPoams = await db
    .select({ controlRecordId: poamEntries.controlRecordId })
    .from(poamEntries)
    .where(and(eq(poamEntries.organizationId, orgId), eq(poamEntries.status, "open")));

  const openPoamSet = new Set(openPoams.map((p) => p.controlRecordId));

  // ── Build the 110-control list ──
  const controlList: AssessorControl[] = ALL_CONTROL_IDS.map((controlId) => {
    const r = recordMap.get(controlId);
    const govNarrative = r?.governanceNarrative ?? "";
    return {
      controlId,
      title: r?.title ?? null,
      implementationStatus: r?.implementationStatus ?? "not_started",
      narrativePreview: govNarrative.slice(0, 120) + (govNarrative.length > 120 ? "…" : ""),
      evidenceCount: r ? (evidenceCountMap.get(r.id) ?? 0) : 0,
      hasOpenPoam: r ? openPoamSet.has(r.id) : false,
      family: familyOf(controlId),
    };
  });

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">Security Controls</h1>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Read-only view of all 110 NIST SP 800-171 Rev 2 controls and their current implementation status.
          </p>
        </div>
        <AssessorControlsClient controls={controlList} />
      </div>
    </div>
  );
}
