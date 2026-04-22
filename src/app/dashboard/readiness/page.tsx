import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { FileText, Calculator } from "lucide-react";
import { db } from "@/db";
import {
  getSprsScore,
  sprsScoringData,
  SPRS_MIN,
  SPRS_MAX,
  SPRS_RANGE,
} from "@/lib/sprs";
import { controlRecords, governanceRegisters, governanceRegisterEntries, boundaries } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import {
  isRegisterLaneSatisfied,
  finalCountForSchemaId,
  isProvisionedForSchemaId,
} from "@/lib/registers/compliance-health";
import { buildReadinessChecklist } from "@/lib/readiness/checklist";
import { ReadinessChecklist } from "./ReadinessChecklist";
import { RecalculateControlsButton } from "./RecalculateControlsButton";

const cardClass = "rounded-xl border border-slate-200 bg-white p-6 shadow-sm";

const TOTAL_CONTROLS = ALL_CONTROL_IDS.length;
const ADJUDICATED_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;

const sprs5 = sprsScoringData.filter((c) => c.value === 5).length;
const sprs3 = sprsScoringData.filter((c) => c.value === 3).length;
const sprs1 = sprsScoringData.filter((c) => c.value === 1).length;

function ProgressBar({
  pct,
  className = "bg-[#3B82F6]",
}: {
  pct: number;
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full transition-all duration-500 ${className}`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export default async function ReadinessPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const sprsScore = await getSprsScore(orgId);
  const checklist = await buildReadinessChecklist(orgId);

  const records = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyDocRequired: controlRecords.policyDocRequired,
      policyStatus: controlRecords.policyStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  // ── Register satisfaction ──
  const intelMap = new Map(CONTROL_INTELLIGENCE.map((c) => [c.controlId, c]));
  const orgRegisters = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));
  const orgBoundaries = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const boundaryIds = orgBoundaries.map((b) => b.id);

  const registerFinalCounts = new Map<string, number>();
  if (boundaryIds.length > 0) {
    for (const reg of orgRegisters) {
      const [row] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(governanceRegisterEntries)
        .where(
          and(
            eq(governanceRegisterEntries.registerId, reg.id),
            eq(governanceRegisterEntries.status, "final"),
            sql`${governanceRegisterEntries.boundaryId} IN (${sql.join(
              boundaryIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          )
        );
      registerFinalCounts.set(reg.registerKey, row?.cnt ?? 0);
    }
  }

  const orgProvisionedRegisterKeys = new Set(orgRegisters.map((r) => r.registerKey));
  const registerSatisfiedMap = new Map<string, boolean>();
  for (const [controlId, intel] of intelMap) {
    if (!intel.registerRequired || !intel.registerSchemaId) {
      registerSatisfiedMap.set(controlId, true);
      continue;
    }
    registerSatisfiedMap.set(
      controlId,
      isRegisterLaneSatisfied({
        registerSchemaId: intel.registerSchemaId,
        finalEntryCount: finalCountForSchemaId(registerFinalCounts, intel.registerSchemaId),
        orgProvisioned: isProvisionedForSchemaId(orgProvisionedRegisterKeys, intel.registerSchemaId),
      })
    );
  }

  const implemented = records.filter((r) => {
    const registerOk = registerSatisfiedMap.get(r.controlId) !== false;
    if (r.policyDocRequired) {
      return r.technicalStatus === "satisfied" && r.policyStatus === "satisfied" && registerOk;
    }
    return ADJUDICATED_STATUSES.includes(r.implementationStatus as (typeof ADJUDICATED_STATUSES)[number]) && registerOk;
  }).length;
  const total = records.length || TOTAL_CONTROLS;
  const compliancePct = total > 0 ? Math.round((implemented / total) * 100) : 0;
  const controlsImplementedPct =
    TOTAL_CONTROLS > 0 ? Math.round((implemented / TOTAL_CONTROLS) * 100) : 0;

  // Map SPRS score from [SPRS_MIN, SPRS_MAX] to 0–100% for progress bar
  const sprsPct =
    SPRS_RANGE > 0
      ? Math.round(((sprsScore - SPRS_MIN) / SPRS_RANGE) * 100)
      : 0;

  return (
    <div>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#0F172A]">Readiness & Audit</h1>
          <p className="mt-2 text-gray-600">
            Prepare for C3PAO assessment with mock assessments and readiness tools.
          </p>
        </div>
        <RecalculateControlsButton />
      </div>

      <div className="mb-6">
        <ReadinessChecklist data={checklist} />
      </div>

      {/* SPRS scoring: progress bar + score + range + priority distribution */}
      <div className={`mb-6 ${cardClass}`}>
        <h2 className="mb-4 text-sm font-semibold text-slate-800">SPRS Score</h2>
        <p className="mb-4 text-sm text-gray-600">
          Supplier Performance Risk System score from NIST SP 800-171 DoD Assessment Methodology. Each unimplemented control deducts its point value (1, 3, or 5).
        </p>
        <p className="mb-3 text-xs font-medium text-slate-500">
          SPRS range (CMMC 800-171, 110 controls): <span className="tabular-nums text-slate-700">{SPRS_MIN} to {SPRS_MAX}</span>
        </p>
        <div className="mb-4">
          <ProgressBar pct={sprsPct} />
          <div className="mt-2 flex justify-between text-sm">
            <span className="font-semibold text-[#0F172A]">{sprsPct}% of range</span>
            <span className="tabular-nums text-gray-600">
              {sprsScore} of 110 (range {SPRS_MIN}–{SPRS_MAX})
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1.5 text-sm font-medium text-red-800">
            <span className="tabular-nums font-bold">{sprs5}</span> High (5)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800">
            <span className="tabular-nums font-bold">{sprs3}</span> Medium (3)
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-800">
            <span className="tabular-nums font-bold">{sprs1}</span> Basic (1)
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">

        <div className={`lg:col-span-6 ${cardClass}`}>
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Readiness Summary</h2>
          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <p className="text-sm text-gray-600">Compliance Score</p>
              <p className="mt-1 text-2xl font-bold text-[#0F172A]">{compliancePct}%</p>
              <div className="mt-2">
                <ProgressBar pct={compliancePct} />
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600">SPRS Score</p>
              <p className="mt-1 text-2xl font-bold text-[#3B82F6]">{sprsScore}</p>
              <div className="mt-2">
                <ProgressBar pct={sprsPct} className="bg-[#3B82F6]" />
              </div>
              <p className="mt-1 text-xs text-gray-500">Range: {SPRS_MIN} to {SPRS_MAX}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Controls Implemented</p>
              <p className="mt-1 text-2xl font-bold text-[#0F172A]">
                {implemented} / {TOTAL_CONTROLS}
              </p>
              <div className="mt-2">
                <ProgressBar pct={controlsImplementedPct} className="bg-emerald-600" />
              </div>
              <p className="mt-1 text-xs text-gray-500">{TOTAL_CONTROLS} total (CMMC 800-171)</p>
            </div>
          </div>
        </div>

        <div className={`lg:col-span-6 ${cardClass}`}>
          <Link
            href="/dashboard/readiness/mock-assessment"
            className="group block"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#3B82F6]/10">
              <FileText className="h-6 w-6 text-[#3B82F6]" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-[#0F172A] group-hover:text-[#3B82F6]">
              Mock Assessment Simulator
            </h3>
            <p className="text-sm text-gray-600">
              Practice the C3PAO audit process with a guided workflow. Test your readiness with Examine, Test, and Interview scenarios.
            </p>
          </Link>
        </div>

        <div className={`lg:col-span-6 ${cardClass}`}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#10B981]/10">
            <Calculator className="h-6 w-6 text-[#10B981]" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[#0F172A]">SPRS Score Modeler</h3>
          <p className="mb-4 text-sm text-gray-600">
            Model the impact of control status changes on your SPRS score. See how closing POA&Ms affects your score.
          </p>
          <p className="text-xs text-gray-500 italic">Coming soon</p>
        </div>
      </div>
    </div>
  );
}
