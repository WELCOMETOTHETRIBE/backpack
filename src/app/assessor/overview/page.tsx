import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  organizations,
  controlRecords,
  poamEntries,
  poamEntryMilestones,
  controlEvidenceLinks,
  sspSections,
} from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import {
  Shield,
  FileText,
  AlertTriangle,
  Clock,
  ChevronRight,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";

const IMPLEMENTED_STATUSES = ["implemented", "assessed", "inherited"] as const;
const TOTAL = ALL_CONTROL_IDS.length;

function ReadinessRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const filled = (score / 100) * circumference;
  const color =
    score >= 70 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex h-36 w-36 items-center justify-center">
      <svg width="144" height="144" viewBox="0 0 144 144" className="-rotate-90">
        <circle cx="72" cy="72" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="72"
          cy="72"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-[var(--color-gray-900)]">{score}</span>
        <span className="text-xs font-medium text-[var(--color-gray-500)]">/ 100</span>
      </div>
    </div>
  );
}

export default async function AssessorOverviewPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // ── Org identity ──
  const [org] = await db
    .select({
      name: organizations.name,
      systemName: organizations.systemName,
      systemDescription: organizations.systemDescription,
      systemOwnerName: organizations.systemOwnerName,
      systemOwnerEmail: organizations.systemOwnerEmail,
      issoName: organizations.issoName,
      issoEmail: organizations.issoEmail,
      authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
      boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // ── Control records ──
  const records = await db
    .select({ controlId: controlRecords.controlId, implementationStatus: controlRecords.implementationStatus })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  const implemented = records.filter((r) =>
    IMPLEMENTED_STATUSES.includes(r.implementationStatus as (typeof IMPLEMENTED_STATUSES)[number])
  ).length;
  const pct = TOTAL ? Math.round((implemented / TOTAL) * 100) : 0;

  // ── POA&M entries ──
  const openPoamList = await db
    .select({ id: poamEntries.id, status: poamEntries.status })
    .from(poamEntries)
    .where(and(eq(poamEntries.organizationId, orgId), eq(poamEntries.status, "open")));

  const openPoamCount = openPoamList.length;

  // ── POA&M milestones — check which open entries have ≥1 milestone ──
  let poamWithMilestones = 0;
  if (openPoamList.length > 0) {
    for (const entry of openPoamList) {
      const [milestone] = await db
        .select({ id: poamEntryMilestones.id })
        .from(poamEntryMilestones)
        .where(eq(poamEntryMilestones.poamEntryId, entry.id))
        .limit(1);
      if (milestone) poamWithMilestones++;
    }
  }
  const poamMissingMilestones = openPoamCount - poamWithMilestones;

  // ── Evidence expiring soon (<30 days) ──
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const expiringSoon = await db
    .select({ id: controlEvidenceLinks.id })
    .from(controlEvidenceLinks)
    .where(
      and(
        eq(controlEvidenceLinks.organizationId, orgId),
        lt(controlEvidenceLinks.expiresAt, in30Days)
      )
    );
  const expiringSoonCount = expiringSoon.length;

  // ── SSP sections — how many have authored content ──
  const sspSectionList = await db
    .select({ content: sspSections.content })
    .from(sspSections)
    .where(eq(sspSections.organizationId, orgId));
  const authoredSections = sspSectionList.filter(
    (s) => s.content && s.content.trim().length > 0
  ).length;

  // ── Readiness score ──
  const scopingComplete = !!org?.boundaryScopingCompletedAt;
  const sspHasContent = authoredSections >= 3; // at least 3 authored sections
  const controlsAt80pct = pct >= 80;
  const poamHasMilestones = openPoamCount === 0 || poamMissingMilestones === 0;
  const noExpiredEvidence = expiringSoonCount === 0;

  const readinessScore =
    (scopingComplete ? 20 : 0) +
    (sspHasContent ? 20 : 0) +
    (controlsAt80pct ? 30 : 0) +
    (poamHasMilestones ? 15 : 0) +
    (noExpiredEvidence ? 15 : 0);

  const readinessColor =
    readinessScore >= 70 ? "text-emerald-600" : readinessScore >= 40 ? "text-amber-600" : "text-red-600";

  const readinessBreakdown = [
    { label: "Boundary scoping complete", points: 20, earned: scopingComplete },
    { label: "SSP has authored sections", points: 20, earned: sspHasContent },
    { label: "≥80% controls implemented or inherited", points: 30, earned: controlsAt80pct },
    { label: "All open POA&M items have milestones", points: 15, earned: poamHasMilestones },
    { label: "No evidence expiring within 30 days", points: 15, earned: noExpiredEvidence },
  ];

  const cardClass =
    "rounded-xl border border-[var(--color-border)] bg-white p-6 shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ── System identity ── */}
        <section className={cardClass}>
          {org?.systemName ? (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">Organization</p>
                  <h1 className="mt-0.5 text-2xl font-bold text-[var(--color-navy-primary)]">{org.name}</h1>
                  <p className="mt-1 text-base font-medium text-[var(--color-gray-700)]">{org.systemName}</p>
                  {org.systemDescription && (
                    <p className="mt-1 text-sm text-[var(--color-gray-600)] max-w-2xl">{org.systemDescription}</p>
                  )}
                </div>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2 mb-4">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">System Owner</dt>
                  <dd className="mt-1 text-sm text-[var(--color-gray-800)]">
                    {org.systemOwnerName ?? <span className="italic text-[var(--color-gray-400)]">Not designated</span>}
                    {org.systemOwnerEmail && (
                      <span className="ml-2 text-[var(--color-gray-500)]">· {org.systemOwnerEmail}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">ISSO</dt>
                  <dd className="mt-1 text-sm text-[var(--color-gray-800)]">
                    {org.issoName ?? <span className="italic text-[var(--color-gray-400)]">Not designated</span>}
                    {org.issoEmail && (
                      <span className="ml-2 text-[var(--color-gray-500)]">· {org.issoEmail}</span>
                    )}
                  </dd>
                </div>
              </dl>

              {org.authorizationBoundaryStatement && (
                <div className="rounded-lg border-l-4 border-[var(--color-navy-primary)]/40 bg-[var(--color-gray-50)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-2">
                    Authorization Boundary Statement
                  </p>
                  <p className="text-sm leading-relaxed text-[var(--color-gray-700)]">
                    {org.authorizationBoundaryStatement}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--color-gray-900)]">{org?.name ?? "Organization"}</p>
                <p className="mt-0.5 text-sm text-amber-700">
                  System boundary scoping has not been completed by the organization admin. Key SSP fields are missing.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* ── Compliance stat cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Controls Implemented</p>
            <p className="mt-2 text-2xl font-bold text-[var(--color-navy-primary)]">
              {implemented}
              <span className="text-base font-normal text-[var(--color-gray-500)]"> / {TOTAL}</span>
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-gray-500)]">{pct}% complete</p>
          </div>

          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Open POA&Ms</p>
            <p className={`mt-2 text-2xl font-bold ${
              openPoamCount === 0 ? "text-emerald-600" :
              openPoamCount <= 5 ? "text-amber-600" : "text-red-600"
            }`}>
              {openPoamCount}
            </p>
            {openPoamCount > 0 && poamMissingMilestones > 0 && (
              <p className="mt-0.5 text-xs text-amber-600">{poamMissingMilestones} missing milestones</p>
            )}
          </div>

          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">High/Critical Risk</p>
            <p className={`mt-2 text-2xl font-bold ${openPoamCount > 0 ? "text-red-600" : "text-emerald-600"}`}>
              0
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-gray-400)]">
              Risk severity data from POA&M
            </p>
          </div>

          <div className={cardClass}>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">Evidence Expiring</p>
            <p className={`mt-2 text-2xl font-bold ${
              expiringSoonCount === 0 ? "text-emerald-600" : "text-amber-600"
            }`}>
              {expiringSoonCount}
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-gray-400)]">within 30 days</p>
          </div>
        </div>

        {/* ── Assessment readiness score + quick nav ── */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Readiness score */}
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Assessment Readiness Score</h2>
            <div className="mt-4 flex items-center gap-6">
              <ReadinessRing score={readinessScore} />
              <div className="flex-1 space-y-2">
                {readinessBreakdown.map((item) => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div className={`h-4 w-4 shrink-0 rounded-full flex items-center justify-center ${
                      item.earned ? "bg-emerald-100" : "bg-[var(--color-gray-100)]"
                    }`}>
                      {item.earned ? (
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      ) : (
                        <span className="h-2 w-2 rounded-full bg-[var(--color-gray-300)]" />
                      )}
                    </div>
                    <span className="flex-1 text-xs text-[var(--color-gray-600)]">{item.label}</span>
                    <span className={`text-xs font-semibold ${item.earned ? readinessColor : "text-[var(--color-gray-400)]"}`}>
                      {item.earned ? `+${item.points}` : `+0`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Quick navigation */}
          <section className={cardClass}>
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">Quick Navigation</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: "All Controls", desc: `${implemented}/${TOTAL} implemented`, href: "/assessor/controls", icon: Shield },
                { label: "POA&M", desc: `${openPoamCount} open items`, href: "/assessor/poam", icon: AlertTriangle },
                { label: "Evidence", desc: "Enclave evidence index", href: "/assessor/evidence", icon: FileText },
                { label: "SSP", desc: "System Security Plan", href: "/assessor/ssp", icon: Clock },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col gap-1 rounded-lg border border-[var(--color-border)] p-4 transition-colors hover:bg-[var(--color-gray-50)] hover:border-[var(--color-blue-accent)]/40 group"
                >
                  <item.icon className="h-5 w-5 text-[var(--color-gray-400)] group-hover:text-[var(--color-blue-accent)]" />
                  <span className="text-sm font-semibold text-[var(--color-gray-800)]">{item.label}</span>
                  <span className="text-xs text-[var(--color-gray-500)]">{item.desc}</span>
                </Link>
              ))}
            </div>
            <div className="mt-3">
              <ExportPackageButton />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function ExportPackageButton() {
  return (
    <a
      href="/api/export/assessment-package"
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] transition-colors"
    >
      <ExternalLink className="h-4 w-4" />
      Export Assessment Package
    </a>
  );
}
