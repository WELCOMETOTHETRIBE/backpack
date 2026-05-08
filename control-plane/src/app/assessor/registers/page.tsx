import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getComplianceRegisterHealth, aggregateRegisterHealth, REGISTER_DISPLAY_NAMES } from "@/lib/registers/compliance-health";
import { AssessorNav } from "../AssessorNav";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Circle,
  ExternalLink,
  ClipboardList,
  Info,
} from "lucide-react";
import type { RegisterHealthStatus } from "@/lib/registers/compliance-health";

function StatusBadge({ status }: { status: RegisterHealthStatus }) {
  switch (status) {
    case "current":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Current
        </span>
      );
    case "due_soon":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          Due Soon
        </span>
      );
    case "overdue":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          Overdue
        </span>
      );
    case "never_used":
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
          Never Used
        </span>
      );
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default async function AssessorRegistersPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const registers = await getComplianceRegisterHealth(orgId);
  const counts = aggregateRegisterHealth(registers);

  const overdue = registers.filter((r) => r.status === "overdue");
  const dueSoon = registers.filter((r) => r.status === "due_soon");
  const neverUsed = registers.filter((r) => r.status === "never_used");
  const current = registers.filter((r) => r.status === "current");

  return (
    <div>
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">C3PAO Assessment View</h1>
            <p className="text-xs text-gray-500">Read-only — assessor perspective</p>
          </div>
          <AssessorNav />
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">Compliance Registers</h2>
          <p className="mt-1 text-sm text-gray-600">
            Ongoing records required by CMMC Level 2. These are the registers a C3PAO
            examiner expects to see populated, current, and auditable.
          </p>
        </div>

        {/* Posture summary */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Current", count: counts.current, color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Due Soon", count: counts.dueSoon, color: "text-amber-700", bg: "bg-amber-50 border-amber-200" },
            { label: "Overdue", count: counts.overdue, color: "text-red-700", bg: "bg-red-50 border-red-200" },
            { label: "Never Used", count: counts.neverUsed, color: "text-gray-600", bg: "bg-gray-50 border-gray-200" },
          ].map(({ label, count, color, bg }) => (
            <div key={label} className={`rounded-xl border px-4 py-3 ${bg}`}>
              <p className={`text-2xl font-bold ${color}`}>{count}</p>
              <p className={`text-xs font-medium ${color} opacity-80`}>{label}</p>
            </div>
          ))}
        </div>

        {/* Assessor finding: overdue registers */}
        {overdue.length > 0 && (
          <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-red-900">
                  Examiner Finding: {overdue.length} register{overdue.length !== 1 ? "s" : ""} overdue
                </p>
                <p className="text-xs text-red-700 mt-0.5">
                  Overdue registers are a finding under CMMC Assessment Process (CAP).
                  The organization must demonstrate continuous maintenance of these records.
                </p>
                <ul className="mt-2 space-y-1">
                  {overdue.map((r) => (
                    <li key={r.registerKey} className="flex items-center gap-2 text-xs text-red-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                      <strong>{r.displayName}</strong>
                      {r.daysOverdue && <span className="text-red-600">— {r.daysOverdue}d overdue</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Assessor note for never_used */}
        {neverUsed.length > 0 && (
          <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-gray-700">
                  {neverUsed.length} register{neverUsed.length !== 1 ? "s" : ""} with no entries
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  Registers with no entries are treated as non-existent during assessment,
                  regardless of policies in place.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Register table */}
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Register</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Controls</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Last Entry</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Entries</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registers.map((reg) => {
                const display = REGISTER_DISPLAY_NAMES[reg.registerKey] ?? reg.displayName;
                return (
                  <tr
                    key={reg.registerKey}
                    className={`transition-colors hover:bg-gray-50 ${
                      reg.status === "overdue" ? "bg-red-50/30" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900 text-xs">{display}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {/* controlIds not in this type, but it would be available via API */}
                        <span className="text-xs text-gray-400 italic">via register</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-gray-700">
                        {reg.entryCount > 0 ? "On record" : <span className="text-gray-400 italic">None</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold ${reg.entryCount === 0 ? "text-gray-400" : "text-gray-900"}`}>
                        {reg.entryCount}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={reg.status} />
                      {reg.daysOverdue && (
                        <p className="text-[10px] text-red-600 mt-0.5">{reg.daysOverdue}d overdue</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={reg.href}
                        className="text-gray-400 hover:text-blue-500 transition-colors"
                        title="View entries"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {registers.length === 0 && (
          <div className="rounded-xl border border-gray-200 bg-white px-8 py-12 text-center">
            <ClipboardList className="mx-auto h-8 w-8 text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">No compliance registers found for this organization.</p>
          </div>
        )}

        {/* Assessor methodology note */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
          <p className="text-xs font-semibold text-gray-700 mb-1">C3PAO Assessment Methodology</p>
          <p className="text-xs text-gray-600 leading-relaxed">
            Under NIST SP 800-171A, examiners use three methods: <strong>examine</strong>,{" "}
            <strong>interview</strong>, and <strong>test</strong>. Compliance registers are
            primary examine objects — they provide direct evidence that controls are operating
            continuously, not just configured. Registers with no entries cannot satisfy the
            examine method regardless of policy documentation.
          </p>
        </div>
      </div>
    </div>
  );
}
