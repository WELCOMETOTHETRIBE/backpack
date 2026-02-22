import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import ExportButton from "@/components/ExportButton";
import {
  controlImplementations,
  poamItems,
  evidenceMetadata,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function DashboardPage() {
  const session = await auth();
  const user = session?.user as { role?: string; email?: string; organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const implsWithControl = await db
    .select({
      status: controlImplementations.status,
      controlId: controls.controlId,
    })
    .from(controlImplementations)
    .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
    .where(eq(controlImplementations.organizationId, orgId));
  const total = implsWithControl.length;
  const implemented = implsWithControl.filter((i) => i.status === "Implemented").length;
  const poamCount = implsWithControl.filter((i) => i.status === "POA&M").length;
  const inherited = implsWithControl.filter((i) => i.status === "Inherited").length;
  const naCount = implsWithControl.filter((i) => i.status === "Not Applicable").length;
  const compliancePct = total ? Math.round((implemented / total) * 100) : 0;
  const adjudicatedCount = implemented + inherited + naCount;
  const outstandingCount = Math.max(0, total - adjudicatedCount);

  const openPoam = await db
    .select()
    .from(poamItems)
    .where(eq(poamItems.organizationId, orgId));
  const openPoamCount = openPoam.filter((p) => p.status !== "Closed").length;
  const highRiskCount = openPoam.filter(
    (p) => p.status !== "Closed" && (p.riskSeverity === "High" || p.riskSeverity === "Critical")
  ).length;

  const evidence = await db
    .select({ retentionUntil: evidenceMetadata.retentionUntil })
    .from(evidenceMetadata)
    .where(eq(evidenceMetadata.organizationId, orgId));
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const expiringSoon = evidence.filter(
    (e) => e.retentionUntil && new Date(e.retentionUntil) <= in30Days
  ).length;
  const auditReadinessScore = total
    ? Math.min(100, compliancePct - (openPoamCount > 0 ? 10 : 0) - (expiringSoon > 0 ? 5 : 0))
    : 0;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900">Dashboard</h1>
      <p className="mb-6 text-zinc-600">
        Welcome, {user?.email}. Role: {user?.role ?? "—"}
      </p>
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">Compliance %</p>
          <p className="text-2xl font-semibold text-zinc-900">{compliancePct}%</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">Open POA&Ms</p>
          <p className="text-2xl font-semibold text-zinc-900">{openPoamCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">High/Critical risk</p>
          <p className="text-2xl font-semibold text-zinc-900">{highRiskCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">Inherited controls</p>
          <p className="text-2xl font-semibold text-zinc-900">{inherited}</p>
        </div>
      </div>
      <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-zinc-800">Codex adjudication (Trust Codex Manual)</h2>
        <p className="mb-2 text-sm text-zinc-600">
          Adjudicated: {adjudicatedCount}/{total} — Outstanding: {Math.max(0, outstandingCount)}
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-zinc-800"
            style={{ width: total ? `${(adjudicatedCount / total) * 100}%` : "0%" }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Use <strong>Controls</strong> for per-control status and the Auditor manual section on each control for evidence location and regeneration.
        </p>
      </div>
      <div className="mb-8 rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="mb-2 font-medium text-zinc-800">Technical view</h2>
        <p className="text-sm text-zinc-600">Controls needing monitoring: {poamCount}</p>
        <p className="text-sm text-zinc-600">Evidence expiring soon: {expiringSoon}</p>
        <p className="text-sm text-zinc-600">Audit readiness score: {auditReadinessScore}%</p>
      </div>
      <div className="mb-8">
        <ExportButton />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/dashboard/controls"
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300"
        >
          <h2 className="font-medium text-zinc-900">Controls</h2>
          <p className="text-sm text-zinc-500">Manage 110 NIST SP 800-171 controls</p>
        </Link>
        <Link
          href="/dashboard/poam"
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300"
        >
          <h2 className="font-medium text-zinc-900">POA&M</h2>
          <p className="text-sm text-zinc-500">Plans of Action and Milestones</p>
        </Link>
        <Link
          href="/dashboard/evidence"
          className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300"
        >
          <h2 className="font-medium text-zinc-900">Evidence Registry</h2>
          <p className="text-sm text-zinc-500">Metadata-only evidence ledger</p>
        </Link>
      </div>
    </div>
  );
}
