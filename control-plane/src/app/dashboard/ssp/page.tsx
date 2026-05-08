import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { controlRecords, controls, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { FileText, Download, CheckCircle2, AlertTriangle, ExternalLink } from "lucide-react";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import SspDownloadButton from "./SspDownloadButton";

const CONTROL_FAMILIES = [
  { prefix: "3.1", name: "Access Control" },
  { prefix: "3.2", name: "Awareness & Training" },
  { prefix: "3.3", name: "Audit & Accountability" },
  { prefix: "3.4", name: "Configuration Management" },
  { prefix: "3.5", name: "Identification & Authentication" },
  { prefix: "3.6", name: "Incident Response" },
  { prefix: "3.7", name: "Maintenance" },
  { prefix: "3.8", name: "Media Protection" },
  { prefix: "3.9", name: "Personnel Security" },
  { prefix: "3.10", name: "Physical Protection" },
  { prefix: "3.11", name: "Risk Assessment" },
  { prefix: "3.12", name: "Security Assessment" },
  { prefix: "3.13", name: "System & Communications Protection" },
  { prefix: "3.14", name: "System & Information Integrity" },
];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    implemented: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
    assessed: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
    inherited: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    not_applicable: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
    in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    not_started: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? map.not_started}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export default async function SspDashboardPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const [org, records, ctrlTitles] = await Promise.all([
    db
      .select({
        name: organizations.name,
        systemName: organizations.systemName,
        systemOwnerName: organizations.systemOwnerName,
        issoName: organizations.issoName,
        authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
        boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),

    db
      .select({
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        governanceNarrative: controlRecords.governanceNarrative,
        technicalNarrative: controlRecords.technicalNarrative,
      })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId)),

    db
      .select({ controlId: controls.controlId, title: controls.title })
      .from(controls),
  ]);

  const orgMeta = org[0];
  const recordMap = new Map(records.map((r) => [r.controlId, r]));
  const titleMap = new Map(ctrlTitles.map((c) => [c.controlId, c.title]));

  const withNarrative = records.filter((r) => r.governanceNarrative?.trim() || r.technicalNarrative?.trim()).length;
  const implemented = records.filter((r) =>
    ["implemented", "assessed", "inherited", "not_applicable"].includes(r.implementationStatus)
  ).length;
  const total = ALL_CONTROL_IDS.length;

  // Metadata completeness checks
  const metaChecks = [
    { label: "System name", ok: !!orgMeta?.systemName },
    { label: "System owner", ok: !!orgMeta?.systemOwnerName },
    { label: "ISSO designated", ok: !!orgMeta?.issoName },
    { label: "Authorization boundary statement", ok: !!orgMeta?.authorizationBoundaryStatement },
    { label: "Boundary scoping completed", ok: !!orgMeta?.boundaryScopingCompletedAt },
  ];
  const metaDone = metaChecks.filter((c) => c.ok).length;

  const card = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-900";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-5xl space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">System Security Plan</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {orgMeta?.systemName
                ? `${orgMeta.systemName} — NIST SP 800-171 Rev 2 / CMMC Level 2`
                : "Complete org settings to populate system identification."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <SspDownloadButton />
            <Link
              href="/assessor/ssp"
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Assessor preview
            </Link>
          </div>
        </div>

        {/* Progress summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={card}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Metadata</p>
            <p className={`mt-1 text-2xl font-bold ${metaDone === metaChecks.length ? "text-emerald-600" : "text-amber-600"}`}>
              {metaDone}<span className="text-base font-normal text-gray-400"> / {metaChecks.length}</span>
            </p>
            <p className="text-xs text-gray-500">fields complete</p>
          </div>
          <div className={card}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Control narratives</p>
            <p className={`mt-1 text-2xl font-bold ${withNarrative === total ? "text-emerald-600" : "text-blue-600"}`}>
              {withNarrative}<span className="text-base font-normal text-gray-400"> / {total}</span>
            </p>
            <p className="text-xs text-gray-500">authored</p>
          </div>
          <div className={card}>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Controls adjudicated</p>
            <p className={`mt-1 text-2xl font-bold ${implemented === total ? "text-emerald-600" : "text-blue-600"}`}>
              {implemented}<span className="text-base font-normal text-gray-400"> / {total}</span>
            </p>
            <p className="text-xs text-gray-500">implemented / assessed / inherited / N/A</p>
          </div>
        </div>

        {/* Metadata checklist */}
        <div className={card}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">System Identification Checklist</h2>
            <Link
              href="/dashboard/settings#system-identification"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Edit in Settings →
            </Link>
          </div>
          <ul className="space-y-1.5">
            {metaChecks.map((c) => (
              <li key={c.label} className="flex items-center gap-2 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                )}
                <span className={c.ok ? "text-gray-700 dark:text-gray-300" : "text-amber-700 dark:text-amber-400"}>
                  {c.label}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Control coverage by family */}
        <div className={card}>
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">
            Control Implementation Statements — by Family
          </h2>
          <div className="space-y-3">
            {CONTROL_FAMILIES.map(({ prefix, name }) => {
              const familyIds = ALL_CONTROL_IDS.filter((id) => id.startsWith(prefix + "."));
              const authored = familyIds.filter((id) => {
                const r = recordMap.get(id);
                return r?.governanceNarrative?.trim() || r?.technicalNarrative?.trim();
              }).length;
              const pct = familyIds.length > 0 ? Math.round((authored / familyIds.length) * 100) : 0;
              const color = pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-blue-500" : "bg-gray-200 dark:bg-gray-700";

              return (
                <div key={prefix}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      <span className="font-mono text-gray-400">{prefix}</span>{" "}
                      {name}
                    </span>
                    <span className={`font-medium ${pct === 100 ? "text-emerald-600" : "text-gray-500"}`}>
                      {authored}/{familyIds.length}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Control table — not started */}
        {(() => {
          const noNarrative = ALL_CONTROL_IDS.filter((id) => {
            const r = recordMap.get(id);
            return !r?.governanceNarrative?.trim() && !r?.technicalNarrative?.trim();
          });
          if (noNarrative.length === 0) return null;
          return (
            <div className={card}>
              <h2 className="mb-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                Controls Without Narratives
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  {noNarrative.length}
                </span>
              </h2>
              <p className="mb-4 text-xs text-gray-500">
                These controls need governance or technical narrative to complete the SSP. Click any control to author.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-24">Control</th>
                      <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Requirement</th>
                      <th className="pb-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500 w-32">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {noNarrative.map((id) => {
                      const r = recordMap.get(id);
                      return (
                        <tr key={id}>
                          <td className="py-2 pr-3">
                            <Link
                              href={`/dashboard/controls/${id}`}
                              className="font-mono text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                            >
                              {id}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 text-xs text-gray-700 dark:text-gray-300">
                            {titleMap.get(id) ?? id}
                          </td>
                          <td className="py-2">
                            <StatusPill status={r?.implementationStatus ?? "not_started"} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

        {/* Download banner */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800/30 dark:bg-blue-950/20">
          <div className="flex items-start gap-4">
            <FileText className="h-6 w-6 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" aria-hidden />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Download SSP for C3PAO Review</p>
              <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-400">
                The download includes all system identification fields, authorization boundary, external service
                providers, CUI categories, and all 110 control implementation statements. Format: Markdown
                (.md) — open in Word or Google Docs to apply formatting.
              </p>
              <div className="mt-3">
                <SspDownloadButton label="Download SSP (.md)" />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
