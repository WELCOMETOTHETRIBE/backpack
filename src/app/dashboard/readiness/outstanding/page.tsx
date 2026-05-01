import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/db";
import {
  controlRecords,
  governanceArtifactCompletions,
  governanceRegisterEntries,
  governanceRegisters,
  irExerciseBundles,
  irExerciseControls,
  irExercises,
} from "@/db/schema";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  OUTSTANDING_36_CONTROL_IDS,
  OUTSTANDING_CLOSE_PATHS,
  OUTSTANDING_TOTALS,
  CUSTOMER_ATTESTED_INHERITED,
  type OutstandingControlEntry,
} from "@/lib/compliance/outstanding-controls";
import { getAttestationTemplate } from "@/lib/compliance/attestation-templates";
import { OutstandingWizard } from "./OutstandingWizard";

/**
 * /dashboard/readiness/outstanding
 *
 * The Outstanding Controls Wizard. Surfaces the 36 controls that aren't yet
 * adjudicated for a CUI Vault customer, grouped by close-path bucket, with
 * one-click actions per control.
 *
 * Server-side this page:
 *   1. Loads the org's control_records for all 36 outstanding control IDs
 *   2. Loads governance_artifact_completions (attestation lane evidence)
 *   3. Loads provisioned registers + final-entry counts
 *   4. Computes per-control liveStatus: closed | in_progress | not_started
 *
 * The client-side wizard renders bucket tabs, per-control cards, and the
 * AttestationModal for one-click sign-offs.
 */
export default async function OutstandingPage() {
  const session = await auth();
  const user = session?.user as
    | { organizationId?: string; name?: string | null; email?: string | null }
    | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const outstandingIds = [...OUTSTANDING_36_CONTROL_IDS];
  const customerAttestedIds = new Set(CUSTOMER_ATTESTED_INHERITED.map((c) => c.controlId));

  // 1) control_records for all 36 + the 2 customer-attested-inherited
  const allRelevantIds = Array.from(new Set([...outstandingIds, ...customerAttestedIds]));
  const records = await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyStatus: controlRecords.policyStatus,
      lastValidationDate: controlRecords.lastValidationDate,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        inArray(controlRecords.controlId, allRelevantIds)
      )
    );

  const recordByControlId = new Map(records.map((r) => [r.controlId, r]));

  // 2) governance_artifact_completions for those control records (attestations)
  const recordIds = records.map((r) => r.id);
  const completions =
    recordIds.length > 0
      ? await db
          .select({
            controlRecordId: governanceArtifactCompletions.controlRecordId,
            artifactLabel: governanceArtifactCompletions.artifactLabel,
            artifactType: governanceArtifactCompletions.artifactType,
            attestedAt: governanceArtifactCompletions.attestedAt,
          })
          .from(governanceArtifactCompletions)
          .where(
            and(
              eq(governanceArtifactCompletions.organizationId, orgId),
              inArray(governanceArtifactCompletions.controlRecordId, recordIds)
            )
          )
      : [];

  const completionsByRecordId = new Map<string, typeof completions>();
  for (const c of completions) {
    const arr = completionsByRecordId.get(c.controlRecordId) ?? [];
    arr.push(c);
    completionsByRecordId.set(c.controlRecordId, arr);
  }

  // 3) IR tabletop bundles within the last 12 months for this org. The
  //    presence of any archived bundle covering 3.6.x is the authoritative
  //    "tabletop ran" signal — closes Bucket A 3.6.1/3.6.2/3.6.3 cards.
  const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - TWELVE_MONTHS_MS);
  const irBundleControlsRecent = await db
    .select({
      controlId: irExerciseControls.controlId,
      bundleId: irExerciseBundles.id,
      timestampedAt: irExerciseBundles.timestampedAt,
    })
    .from(irExerciseBundles)
    .innerJoin(
      irExercises,
      and(
        eq(irExerciseBundles.exerciseId, irExercises.id),
        eq(irExercises.organizationId, orgId)
      )
    )
    .innerJoin(
      irExerciseControls,
      eq(irExerciseControls.exerciseId, irExercises.id)
    );

  const recentBundleControls = new Set<string>();
  for (const row of irBundleControlsRecent) {
    if (row.timestampedAt && new Date(row.timestampedAt) >= cutoff) {
      recentBundleControls.add(row.controlId);
    }
  }

  // 4) provisioned registers + final-entry counts (for Bucket B controls)
  const orgRegisters = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  const registerIdByKey = new Map(orgRegisters.map((r) => [r.registerKey, r.id]));

  const finalCounts = new Map<string, number>();
  if (orgRegisters.length > 0) {
    const entries = await db
      .select({
        registerId: governanceRegisterEntries.registerId,
        status: governanceRegisterEntries.status,
      })
      .from(governanceRegisterEntries)
      .where(
        inArray(
          governanceRegisterEntries.registerId,
          orgRegisters.map((r) => r.id)
        )
      );
    for (const e of entries) {
      if (e.status !== "final") continue;
      const key = orgRegisters.find((r) => r.id === e.registerId)?.registerKey;
      if (!key) continue;
      finalCounts.set(key, (finalCounts.get(key) ?? 0) + 1);
    }
  }

  // 4) Compose per-control wizard data
  type LiveStatus = "closed" | "in_progress" | "not_started";

  function liveStatusFor(entry: OutstandingControlEntry): LiveStatus {
    const record = recordByControlId.get(entry.controlId);
    if (!record) return "not_started";

    // Bucket E: closed if attestation completion exists with the template label
    if (entry.bucket === "E" && entry.attestationTemplateId) {
      const cs = completionsByRecordId.get(record.id) ?? [];
      const has = cs.some(
        (c) => c.artifactType === "ATTESTATION" && c.artifactLabel === entry.attestationTemplateId
      );
      if (has || record.implementationStatus === "not_applicable") return "closed";
      return "not_started";
    }

    // Bucket C: closed if attestation completion exists OR implementation marked
    if (entry.bucket === "C" && entry.attestationTemplateId) {
      const cs = completionsByRecordId.get(record.id) ?? [];
      const has = cs.some(
        (c) => c.artifactType === "ATTESTATION" && c.artifactLabel === entry.attestationTemplateId
      );
      if (has || record.implementationStatus === "implemented") return "closed";
      return "not_started";
    }

    // Bucket B: closed if any final register entry exists for the targeted register
    if (entry.bucket === "B" && entry.registerSchemaId) {
      const candidates = [entry.registerSchemaId];
      const count = candidates.reduce((acc, k) => acc + (finalCounts.get(k) ?? 0), 0);
      if (count > 0) return "closed";
      // Provisioned register with no final entries → in_progress; not provisioned → not_started
      if (registerIdByKey.has(entry.registerSchemaId)) return "in_progress";
      return "not_started";
    }

    // Bucket A: closed when the upstream system delivers evidence
    if (entry.bucket === "A") {
      // 3.6.x: an archived IR tabletop bundle in the last 12 months covering
      // this control is the authoritative signal. Bundle archive auto-writes
      // governance_artifact_completions for linked controls (see
      // /api/ir-tabletop/exercises/[id]/bundle), so the completion lane will
      // also be flipped — but we check the bundle directly to be explicit.
      if (entry.controlId.startsWith("3.6.")) {
        if (recentBundleControls.has(entry.controlId)) return "closed";
        // Any bundle ever (even older than 12 months) → in_progress (overdue)
        const everBundled = irBundleControlsRecent.some(
          (b) => b.controlId === entry.controlId
        );
        return everBundled ? "in_progress" : "not_started";
      }
      // 3.2.x: training_completion register has any final entry
      if (entry.controlId.startsWith("3.2.")) {
        const count = finalCounts.get("training_completion") ?? 0;
        if (count > 0) return "closed";
        if (registerIdByKey.has("training_completion")) return "in_progress";
        return "not_started";
      }
      return "not_started";
    }

    return "not_started";
  }

  const cards = OUTSTANDING_36_CONTROL_IDS.map((cid) => {
    const entry = OUTSTANDING_CLOSE_PATHS.get(cid);
    if (!entry) return null;
    const record = recordByControlId.get(cid);
    return {
      ...entry,
      liveStatus: liveStatusFor(entry),
      controlRecordId: record?.id ?? null,
      template: entry.attestationTemplateId
        ? getAttestationTemplate(entry.attestationTemplateId)
        : undefined,
    };
  }).filter(Boolean) as Array<
    OutstandingControlEntry & {
      liveStatus: LiveStatus;
      controlRecordId: string | null;
      template?: ReturnType<typeof getAttestationTemplate>;
    }
  >;

  // Compute bucket-level progress
  const totalClosed = cards.filter((c) => c.liveStatus === "closed").length;
  const totalRemaining = OUTSTANDING_36_CONTROL_IDS.length - totalClosed;
  const totalEffortMinutes = cards
    .filter((c) => c.liveStatus !== "closed")
    .reduce((acc, c) => acc + c.effortMinutes, 0);

  // Customer-attested-inherited (3.10.3, 3.10.6) — surfaced separately
  const customerAttestedCards = CUSTOMER_ATTESTED_INHERITED.map((c) => {
    const record = recordByControlId.get(c.controlId);
    const template = getAttestationTemplate(c.attestationTemplateId);
    const hasCompletion =
      record &&
      (completionsByRecordId.get(record.id) ?? []).some(
        (gc) =>
          gc.artifactType === "ATTESTATION" &&
          gc.artifactLabel === c.attestationTemplateId
      );
    return {
      ...c,
      liveStatus: (hasCompletion ? "closed" : "not_started") as LiveStatus,
      controlRecordId: record?.id ?? null,
      template,
    };
  });

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Link
        href="/dashboard"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Dashboard
      </Link>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Outstanding Controls
        </h1>
        <p className="mt-1.5 max-w-3xl text-sm text-slate-600">
          {OUTSTANDING_TOTALS.outstanding} controls remain to reach 110/110 adjudicated. Each one has
          a defined close-path with a C3PAO-defensible attestation, register entry, or evidence
          ingest. Most are 5-minute one-time actions.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
            {totalClosed} closed
          </span>
          <span className="rounded-full bg-blue-100 px-2.5 py-1 font-medium text-blue-800">
            {totalRemaining} remaining
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
            ~{Math.round(totalEffortMinutes / 60)} hours of work left
          </span>
        </div>
      </header>

      <OutstandingWizard
        cards={cards}
        customerAttestedCards={customerAttestedCards}
        signatoryName={user?.name ?? user?.email ?? ""}
      />
    </main>
  );
}
