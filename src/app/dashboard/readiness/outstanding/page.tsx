import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

// Force dynamic rendering so router.refresh() (called from AttestationModal
// after a successful sign) always re-fetches DB state. Without this, Next.js
// can serve a cached server-render and the just-signed card stays "Open".
export const dynamic = "force-dynamic";
export const revalidate = 0;
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
  evidenceRuns,
  boundaries,
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
import { AZURE_ENTRA_12_CONTROL_IDS } from "@/lib/compliance/azure-entra-controls";
import { OutstandingWizard } from "./OutstandingWizard";

/**
 * /dashboard/readiness/outstanding
 *
 * The Outstanding Controls Wizard. Surfaces the controls that aren't yet
 * adjudicated for a CUI Vault customer (sourced from
 * OUTSTANDING_36_CONTROL_IDS), grouped by close-path bucket, with
 * one-click actions per control.
 *
 * Server-side this page:
 *   1. Loads the org's control_records for every outstanding control ID
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

  // 1) control_records for every outstanding control + the customer-attested-inherited set
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

    // Bucket E: closed ONLY when a customer-signed attestation exists for the
    // template. Architecture-level disposition=not_applicable from
    // CONTROL_INTELLIGENCE is necessary but NOT sufficient — a C3PAO will
    // ask for the customer's signed attestation that the conditions hold,
    // not just trust the platform default. So we never fall back to
    // implementationStatus alone.
    if (entry.bucket === "E" && entry.attestationTemplateId) {
      const cs = completionsByRecordId.get(record.id) ?? [];
      const has = cs.some(
        (c) => c.artifactType === "ATTESTATION" && c.artifactLabel === entry.attestationTemplateId
      );
      return has ? "closed" : "not_started";
    }

    // Bucket C: same C3PAO-strict policy — only the signed attestation flips
    // the card to closed. The disposition='implemented' default doesn't carry
    // the per-condition affirmation a C3PAO needs.
    if (entry.bucket === "C" && entry.attestationTemplateId) {
      const cs = completionsByRecordId.get(record.id) ?? [];
      const has = cs.some(
        (c) => c.artifactType === "ATTESTATION" && c.artifactLabel === entry.attestationTemplateId
      );
      return has ? "closed" : "not_started";
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

  // ─── Azure-collector run check ──────────────────────────────────────────
  // Has an Azure/Entra evidence run been ingested for this org? Drives the
  // wizard's "Run the Azure collector" hint banner. We look for any
  // evidence_run with source='azure_entra' in the last 12 months.
  const TWELVE_MONTHS_MS_AZURE = 365 * 24 * 60 * 60 * 1000;
  const azureCutoff = new Date(Date.now() - TWELVE_MONTHS_MS_AZURE);
  const orgBoundaryIds = (
    await db
      .select({ id: boundaries.id })
      .from(boundaries)
      .where(eq(boundaries.organizationId, orgId))
  ).map((b) => b.id);
  const recentAzureRuns =
    orgBoundaryIds.length > 0
      ? await db
          .select({ id: evidenceRuns.id, collectedAt: evidenceRuns.collectedAt })
          .from(evidenceRuns)
          .where(
            and(
              eq(evidenceRuns.organizationId, orgId),
              eq(evidenceRuns.source, "azure_entra")
            )
          )
          .orderBy(desc(evidenceRuns.collectedAt))
          .limit(5)
      : [];
  const azureRunRecent = recentAzureRuns.some(
    (r) => r.collectedAt && new Date(r.collectedAt) >= azureCutoff
  );
  const azureRunEverPresent = recentAzureRuns.length > 0;

  // Of the 15 Azure-validated controls, count how many have technical_status
  // != satisfied (i.e. would benefit from an Azure run). The hint banner is
  // only shown when there are ≥1 such controls AND no recent Azure run.
  const azureControlsNeedingEvidence = AZURE_ENTRA_12_CONTROL_IDS.filter((cid) => {
    const r = recordByControlId.get(cid);
    return !r || r.technicalStatus !== "satisfied";
  }).length;

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
            {totalEffortMinutes < 60
              ? `~${totalEffortMinutes} min of work left`
              : `~${Math.round(totalEffortMinutes / 60)} hours of work left`}
          </span>
        </div>
      </header>

      {totalRemaining === 0 ? (
        <AllClosedCelebration totalClosed={totalClosed} />
      ) : records.length === 0 ? (
        <NoRecordsGuidance />
      ) : (
        <>
          <AzureRunHintBanner
            azureRunRecent={azureRunRecent}
            azureRunEverPresent={azureRunEverPresent}
            azureControlsNeedingEvidence={azureControlsNeedingEvidence}
            boundaryId={orgBoundaryIds[0] ?? null}
          />
          <OutstandingWizard
            cards={cards}
            customerAttestedCards={customerAttestedCards}
            signatoryName={user?.name ?? user?.email ?? ""}
          />
        </>
      )}
    </main>
  );
}

function AzureRunHintBanner({
  azureRunRecent,
  azureRunEverPresent,
  azureControlsNeedingEvidence,
  boundaryId,
}: {
  azureRunRecent: boolean;
  azureRunEverPresent: boolean;
  azureControlsNeedingEvidence: number;
  boundaryId: string | null;
}) {
  // Don't surface if there's nothing to fix or the customer is already covered.
  if (azureRunRecent || azureControlsNeedingEvidence === 0) return null;

  const isStale = azureRunEverPresent && !azureRunRecent;

  return (
    <section className="mb-6 rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-blue-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-blue-900">
            {isStale
              ? "Your Azure validator run is older than 12 months"
              : `Run the Azure validator to satisfy ${azureControlsNeedingEvidence} cloud-side control${
                  azureControlsNeedingEvidence === 1 ? "" : "s"
                }`}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-blue-800">
            {isStale ? (
              <>
                We have an Azure evidence run on file but it&apos;s gone stale.
                Re-run the Azure collector and upload the fresh report so a C3PAO
                sees current evidence for 3.1.13/14, 3.3.1/2, 3.5.3-6, 3.7.5,
                3.13.5/8/10.
              </>
            ) : (
              <>
                The 15 Azure-touching controls{" "}
                <span className="font-mono text-xs">
                  (3.1.13, 3.1.14, 3.1.18, 3.1.19, 3.3.1, 3.3.2, 3.5.3-6, 3.7.5, 3.8.9, 3.13.5, 3.13.8, 3.13.10)
                </span>{" "}
                claim Azure-side technical evidence, but no Azure validator
                report has been uploaded yet. Until you run the collector
                (validate_azure_entra v1.5+), those claims are unverified --
                a C3PAO will ask for the report.
              </>
            )}
          </p>
          <div className="mt-3 grid gap-3 text-xs text-blue-900 sm:grid-cols-2">
            <div className="rounded-md border border-blue-200 bg-white p-3">
              <div className="font-semibold">macOS / Linux</div>
              <code className="mt-1 block whitespace-pre rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-100">
{`AZURE_RG=<your-rg> \\
  bash TRUST_CODEX/tools/export_azure_evidence.sh
python3 TRUST_CODEX/tools/validate_azure_entra.py`}
              </code>
            </div>
            <div className="rounded-md border border-blue-200 bg-white p-3">
              <div className="font-semibold">Windows / VM</div>
              <code className="mt-1 block whitespace-pre rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-100">
{`.\\Run-AzureEntraCollectAndValidate.ps1 \`
  -ResourceGroup <your-rg>`}
              </code>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/dashboard/boundary"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
            >
              Upload validator report
            </Link>
            <Link
              href="/dashboard/evidence-engine/about-collectors"
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm font-semibold text-blue-900 transition hover:bg-blue-100"
            >
              Two collectors, one workflow
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Empty / celebration states ──────────────────────────────────────────

function AllClosedCelebration({ totalClosed }: { totalClosed: number }) {
  return (
    <section className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-blue-50 p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
        <svg
          className="h-8 w-8 text-emerald-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="mt-4 text-2xl font-semibold text-slate-900">
        All {totalClosed} outstanding controls are closed
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
        You&apos;re at <strong>110 / 110 adjudicated</strong>. The Outstanding Controls Wizard has
        nothing left to surface — every NIST 800-171 Rev 2 control for the MacTech CUI Vault has
        either been signed, attested, registered, or inherited.
      </p>
      <p className="mx-auto mt-4 max-w-2xl text-xs leading-relaxed text-slate-500">
        Keep your registers current on cadence (training annual, audit log review monthly, etc.) and
        re-run the IR tabletop within 12 months to keep 3.6.x current. Re-attest any sign-offs
        annually so the SHA-256 binding stays fresh for a C3PAO audit.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/dashboard/readiness"
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          See readiness checklist
        </Link>
        <Link
          href="/dashboard/reporting"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          Generate C3PAO assessment package
        </Link>
      </div>
    </section>
  );
}

function NoRecordsGuidance() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-8">
      <div className="flex items-start gap-3">
        <svg
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 0 0-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
          />
        </svg>
        <div className="flex-1">
          <h2 className="text-base font-semibold text-amber-900">
            Complete onboarding to see your outstanding controls
          </h2>
          <p className="mt-1.5 text-sm text-amber-800">
            We can&apos;t show your outstanding-controls wizard until you&apos;ve finished
            onboarding. Specifically: define your system boundary, accept the Trust Codex, and
            let the platform initialize your 110 NIST 800-171 control records. Then come back here
            and you&apos;ll see your outstanding cards bucketed by close-path.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/welcome"
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-800"
            >
              Resume onboarding
            </Link>
            <Link
              href="/dashboard/boundary"
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Define system boundary
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
