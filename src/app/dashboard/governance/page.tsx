import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  controlRecords,
  governanceDocuments,
  governanceEvidenceItems,
  governanceRegisters,
  governanceRegisterEntries,
} from "@/db/schema";
import { eq, and, desc, sql, lt } from "drizzle-orm";
import {
  PURE_GOVERNANCE_IDS,
  HYBRID_GOVERNANCE_IDS,
} from "@/lib/compliance/control-bins";
import {
  BookMarked,
  FileText,
  ClipboardList,
  FolderOpen,
  Download,
  Upload,
  PlusCircle,
} from "lucide-react";

const PURE_TOTAL = PURE_GOVERNANCE_IDS.length;
const HYBRID_GOVERNANCE_TOTAL = HYBRID_GOVERNANCE_IDS.length;
const IMPLEMENTED_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;

export default async function GovernanceDashboardPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const records = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  const pureGovSet = new Set(PURE_GOVERNANCE_IDS);
  const hybridGovSet = new Set(HYBRID_GOVERNANCE_IDS);
  let pureDone = 0;
  let hybridGovernanceDone = 0;
  for (const r of records) {
    const status = r.implementationStatus as string;
    if (!IMPLEMENTED_STATUSES.includes(status as (typeof IMPLEMENTED_STATUSES)[number])) continue;
    if (pureGovSet.has(r.controlId)) pureDone++;
    else if (hybridGovSet.has(r.controlId)) hybridGovernanceDone++;
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdueDocs = await db
    .select({ id: governanceDocuments.id })
    .from(governanceDocuments)
    .where(
      and(
        eq(governanceDocuments.organizationId, orgId),
        eq(governanceDocuments.status, "APPROVED"),
        lt(governanceDocuments.nextReviewDate, today)
      )
    );
  const overdueCount = overdueDocs.length;

  const evidenceItems = await db
    .select({
      id: governanceEvidenceItems.id,
      collectedAt: governanceEvidenceItems.collectedAt,
      validityPeriodDays: governanceEvidenceItems.validityPeriodDays,
    })
    .from(governanceEvidenceItems)
    .where(eq(governanceEvidenceItems.organizationId, orgId));
  const now = new Date();
  const staleEvidenceCount = evidenceItems.filter((i) => {
    if (!i.validityPeriodDays) return false;
    const end = new Date(i.collectedAt);
    end.setDate(end.getDate() + i.validityPeriodDays);
    return end < now;
  }).length;

  const orgRegisters = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  let registersMissingRecent = 0;
  for (const reg of orgRegisters) {
    const [latest] = await db
      .select({ createdAt: governanceRegisterEntries.createdAt })
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.registerId, reg.id))
      .orderBy(desc(governanceRegisterEntries.createdAt))
      .limit(1);
    if (!latest || new Date(latest.createdAt) < thirtyDaysAgo) registersMissingRecent++;
  }

  const approvedCount = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(governanceDocuments)
    .where(and(eq(governanceDocuments.organizationId, orgId), eq(governanceDocuments.status, "APPROVED")));

  const cardClass =
    "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">
        <section className={cardClass}>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
            Governance overview
          </h2>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Pure governance controls ({PURE_TOTAL}), hybrid governance controls ({HYBRID_GOVERNANCE_TOTAL}), document control, registers, and evidence library.
          </p>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className={cardClass}>
            <div className="flex items-center gap-2 text-[var(--color-gray-600)]">
              <BookMarked className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">Pure Gov controls</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--color-navy-primary)]">
              {pureDone} <span className="font-normal text-[var(--color-gray-600)]">/ {PURE_TOTAL}</span>
            </p>
            <Link
              href="/dashboard/governance/controls?classification=PURE_GOV"
              className="mt-2 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              View controls →
            </Link>
          </div>
          <div className={cardClass}>
            <div className="flex items-center gap-2 text-[var(--color-gray-600)]">
              <BookMarked className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">Hybrid Governance controls</span>
            </div>
            <p className="mt-2 text-2xl font-bold text-[var(--color-navy-primary)]">
              {hybridGovernanceDone} <span className="font-normal text-[var(--color-gray-600)]">/ {HYBRID_GOVERNANCE_TOTAL}</span>
            </p>
            <Link
              href="/dashboard/governance/controls?classification=HYBRID_GOVERNANCE"
              className="mt-2 inline-block text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
            >
              View controls →
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Approved documents</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">
              {approvedCount[0]?.count ?? 0}
            </p>
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Overdue reviews</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-status-amber)]">{overdueCount}</p>
            {overdueCount > 0 && (
              <Link
                href="/dashboard/governance/documents?status=APPROVED"
                className="mt-1 inline-block text-sm text-[var(--color-blue-accent)] hover:underline"
              >
                Review documents →
              </Link>
            )}
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Stale evidence</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-status-red)]">{staleEvidenceCount}</p>
            {staleEvidenceCount > 0 && (
              <Link
                href="/dashboard/governance/evidence?stale=1"
                className="mt-1 inline-block text-sm text-[var(--color-blue-accent)] hover:underline"
              >
                View evidence →
              </Link>
            )}
          </div>
          <div className={cardClass}>
            <p className="text-sm font-medium text-[var(--color-gray-600)]">Registers (no entry in 30d)</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-navy-primary)]">
              {registersMissingRecent} <span className="text-sm font-normal text-[var(--color-gray-600)]">/ {orgRegisters.length}</span>
            </p>
          </div>
        </div>

        <section className={cardClass}>
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Quick actions</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/dashboard/governance/documents"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <Upload className="h-4 w-4" aria-hidden />
              Upload document
            </Link>
            <Link
              href="/dashboard/governance/registers"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <PlusCircle className="h-4 w-4" aria-hidden />
              Create register entry
            </Link>
            <Link
              href="/dashboard/governance/export"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <Download className="h-4 w-4" aria-hidden />
              Export assessor package
            </Link>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/dashboard/governance/controls"
            className={`${cardClass} block transition-colors hover:bg-[var(--color-gray-50)]`}
          >
            <div className="flex items-center gap-2 text-[var(--color-navy-primary)]">
              <BookMarked className="h-5 w-5" aria-hidden />
              <span className="font-semibold">Controls</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Adjudicate pure and hybrid governance controls; link documents, registers, and evidence.
            </p>
          </Link>
          <Link
            href="/dashboard/governance/documents"
            className={`${cardClass} block transition-colors hover:bg-[var(--color-gray-50)]`}
          >
            <div className="flex items-center gap-2 text-[var(--color-navy-primary)]">
              <FileText className="h-5 w-5" aria-hidden />
              <span className="font-semibold">Document control</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Policies, SOPs, and plans; versioning, approval workflow, and review dates.
            </p>
          </Link>
          <Link
            href="/dashboard/governance/registers"
            className={`${cardClass} block transition-colors hover:bg-[var(--color-gray-50)]`}
          >
            <div className="flex items-center gap-2 text-[var(--color-navy-primary)]">
              <ClipboardList className="h-5 w-5" aria-hidden />
              <span className="font-semibold">Registers</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Access authorizations, training completion, incident log, and other registers.
            </p>
          </Link>
          <Link
            href="/dashboard/governance/evidence"
            className={`${cardClass} block transition-colors hover:bg-[var(--color-gray-50)]`}
          >
            <div className="flex items-center gap-2 text-[var(--color-navy-primary)]">
              <FolderOpen className="h-5 w-5" aria-hidden />
              <span className="font-semibold">Evidence library</span>
            </div>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Hybrid control evidence; link to controls and track validity.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}
