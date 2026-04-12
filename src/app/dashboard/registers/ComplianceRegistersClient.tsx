"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ClipboardList,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Circle,
  ChevronRight,
  BookOpen,
  RefreshCw,
  ExternalLink,
  Info,
} from "lucide-react";
import type { ComplianceRegisterHealth, RegisterHealthStatus } from "@/app/api/registers/compliance-health/route";

// ── Display name overrides (friendlier than schema IDs) ─────────────────────
const REGISTER_DISPLAY: Record<string, { name: string; description: string }> = {
  access_authorization:    { name: "User Access Register", description: "Authorized users, roles, access grants and quarterly reviews." },
  role_assignment_matrix:  { name: "Role Assignment Matrix", description: "Roles mapped to users; demonstrates least-privilege enforcement." },
  sod_matrix:              { name: "Separation of Duties Matrix", description: "Incompatible duties documented; annual review required." },
  authenticator_mgmt:      { name: "MFA Enrollment Register", description: "MFA enrollment status for all users with CUI access." },
  training_completion:     { name: "Security Training Register", description: "Annual security awareness training records for all CUI users." },
  personnel_screening:     { name: "Personnel Screening Register", description: "Pre-employment screening records per hire; annual check." },
  termination:             { name: "Termination Action Register", description: "Access revocation actions within 24 hours of termination." },
  audit_log_review:        { name: "Audit Log Review Register", description: "Monthly documentation of audit log reviews and anomalies found." },
  audit_config:            { name: "Key Management Register", description: "Azure Key Vault configuration, key rotation, and access policies." },
  control_monitoring:      { name: "ConMon Activity Log", description: "Continuous monitoring activities; Azure inheritance confirmations." },
  incident_log:            { name: "Incident Response Register", description: "Incidents, response actions, DFARS reporting, tabletop exercises." },
  maintenance_log:         { name: "Maintenance Log", description: "All maintenance activities, remote sessions, and approvals." },
  media_access:            { name: "Media Accountability Register", description: "CUI media transport chain-of-custody records." },
  media_destruction:       { name: "Media Sanitization Register", description: "BitLocker crypto-erase and physical destruction records." },
  visitor_log:             { name: "Visitor Log", description: "Controlled area visitor records with escort and purpose." },
  facility_access:         { name: "Facility Access Log", description: "Physical access reviews for non-datacenter controlled areas." },
  baseline_config:         { name: "Authorized Software Register", description: "Approved software and configuration baseline with quarterly review." },
  change_log:              { name: "Change Control Register", description: "Every configuration change with SIA, approval, and test results." },
  risk_register:           { name: "Risk Register", description: "Formal risk assessment findings, treatments, and annual reviews." },
  assessment_findings:     { name: "Security Assessment Register", description: "Annual assessment findings, actions, and verification status." },
  poam:                    { name: "POA&M Register", description: "Open Plan of Action & Milestones with monthly milestone updates." },
  vuln_remediation:        { name: "Vulnerability Remediation Register", description: "Vulnerability scan results, patch status, and remediation timelines." },
  policy_review:           { name: "SSP & Policy Review Register", description: "Annual SSP and policy document review records." },
  technical_compliance_run: { name: "Technical Compliance Log", description: "OS Collector run history; verifies continuous technical evidence." },
};

// ── Status visuals ──────────────────────────────────────────────────────────

function statusConfig(status: RegisterHealthStatus) {
  switch (status) {
    case "current":
      return {
        label: "Current",
        dot: "bg-emerald-500",
        badge: "bg-emerald-50 border-emerald-200 text-emerald-800",
        icon: CheckCircle2,
        iconColor: "text-emerald-500",
        ring: "border-emerald-200",
      };
    case "due_soon":
      return {
        label: "Due Soon",
        dot: "bg-amber-500",
        badge: "bg-amber-50 border-amber-200 text-amber-800",
        icon: Clock,
        iconColor: "text-amber-500",
        ring: "border-amber-300",
      };
    case "overdue":
      return {
        label: "Overdue",
        dot: "bg-red-500",
        badge: "bg-red-50 border-red-200 text-red-800",
        icon: AlertTriangle,
        iconColor: "text-red-500",
        ring: "border-red-300",
      };
    case "never_used":
      return {
        label: "Never Used",
        dot: "bg-gray-400",
        badge: "bg-gray-50 border-gray-200 text-gray-600",
        icon: Circle,
        iconColor: "text-gray-400",
        ring: "border-gray-200",
      };
  }
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatNextDue(iso: string | null, status: RegisterHealthStatus): string {
  if (!iso) {
    if (status === "never_used") return "Add first entry";
    return "Event-driven";
  }
  const d = new Date(iso);
  const days = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days}d`;
  if (days < 30) return `Due in ${Math.floor(days / 7)}w`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── Register card ────────────────────────────────────────────────────────────

function RegisterCard({ reg }: { reg: ComplianceRegisterHealth }) {
  const display = REGISTER_DISPLAY[reg.registerKey];
  const name = display?.name ?? reg.displayName;
  const desc = display?.description ?? reg.description;
  const cfg = statusConfig(reg.status);
  const StatusIcon = cfg.icon;

  return (
    <Link
      href={reg.href}
      className={`group block rounded-xl border bg-white p-5 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${cfg.ring}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <StatusIcon className={`h-4 w-4 shrink-0 mt-0.5 ${cfg.iconColor}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{name}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed">{desc}</p>
          </div>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cfg.badge}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-gray-100">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Last Entry</p>
          <p className="text-xs font-medium text-gray-700 mt-0.5">
            {reg.lastEntryAt ? formatRelativeDate(reg.lastEntryAt) : <span className="text-gray-400 italic">None</span>}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Next Due</p>
          <p className={`text-xs font-medium mt-0.5 ${
            reg.status === "overdue" ? "text-red-600" :
            reg.status === "due_soon" ? "text-amber-600" :
            "text-gray-700"
          }`}>
            {formatNextDue(reg.nextDueAt, reg.status)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Entries</p>
          <p className="text-xs font-medium text-gray-700 mt-0.5">{reg.entryCount}</p>
        </div>
      </div>

      {/* Controls row */}
      {reg.controlIds.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 pt-2.5 border-t border-gray-100">
          {reg.controlIds.slice(0, 5).map((id) => (
            <span key={id} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
              {id}
            </span>
          ))}
          {reg.controlIds.length > 5 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              +{reg.controlIds.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Arrow */}
      <div className="flex items-center justify-end mt-3">
        <span className="text-[11px] font-medium text-gray-400 group-hover:text-blue-600 transition-colors flex items-center gap-1">
          View register <ChevronRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}

// ── Status summary chip ──────────────────────────────────────────────────────

function SummaryChip({
  status, count, active, onClick,
}: {
  status: RegisterHealthStatus | "all";
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const label = status === "all" ? "All" :
    status === "current" ? "Current" :
    status === "due_soon" ? "Due Soon" :
    status === "overdue" ? "Overdue" : "Never Used";

  const colors = status === "all"
    ? (active ? "bg-gray-900 text-white border-gray-900" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50")
    : status === "current"
    ? (active ? "bg-emerald-600 text-white border-emerald-600" : "bg-white border-emerald-200 text-emerald-700 hover:bg-emerald-50")
    : status === "due_soon"
    ? (active ? "bg-amber-500 text-white border-amber-500" : "bg-white border-amber-200 text-amber-700 hover:bg-amber-50")
    : status === "overdue"
    ? (active ? "bg-red-600 text-white border-red-600" : "bg-white border-red-200 text-red-700 hover:bg-red-50")
    : (active ? "bg-gray-600 text-white border-gray-600" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50");

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${colors}`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        active ? "bg-white/20" : "bg-gray-100 text-gray-600"
      }`}>
        {count}
      </span>
    </button>
  );
}

// ── Main client component ────────────────────────────────────────────────────

export function ComplianceRegistersClient({ userRole }: { userRole: string }) {
  const isAssessor = userRole === "Assessor";
  const [registers, setRegisters] = useState<ComplianceRegisterHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RegisterHealthStatus | "all">("all");
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/registers/compliance-health");
      if (res.ok) setRegisters(await res.json());
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  useEffect(() => { load(); }, []);

  const counts = {
    all: registers.length,
    current: registers.filter((r) => r.status === "current").length,
    due_soon: registers.filter((r) => r.status === "due_soon").length,
    overdue: registers.filter((r) => r.status === "overdue").length,
    never_used: registers.filter((r) => r.status === "never_used").length,
  };

  const filtered = filter === "all" ? registers : registers.filter((r) => r.status === filter);
  const hasUrgent = counts.overdue > 0 || counts.due_soon > 0;

  return (
    <div className="mx-auto max-w-5xl">
      {/* Page header */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-navy-primary)]">
              Registers
            </h1>
            <p className="mt-1 text-sm text-gray-600 max-w-2xl">
              Day-to-day compliance records required by CMMC Level 2. A C3PAO examiner will
              examine these during your assessment — overdue registers are automatic findings.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Urgent alert banner */}
      {!loading && hasUrgent && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">
              {counts.overdue > 0
                ? `${counts.overdue} register${counts.overdue !== 1 ? "s" : ""} overdue`
                : `${counts.due_soon} register${counts.due_soon !== 1 ? "s" : ""} due soon`}
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              {counts.overdue > 0
                ? "A C3PAO examiner will flag overdue registers as a finding. Add entries now to clear this."
                : "Review these registers before your assessment window opens."}
            </p>
            {counts.overdue > 0 && (
              <ul className="mt-2 space-y-0.5">
                {registers
                  .filter((r) => r.status === "overdue")
                  .slice(0, 3)
                  .map((r) => {
                    const display = REGISTER_DISPLAY[r.registerKey];
                    return (
                      <li key={r.registerKey}>
                        <Link href={r.href} className="text-xs font-medium text-red-700 underline hover:text-red-900">
                          {display?.name ?? r.displayName}
                          {r.daysOverdue ? ` — ${r.daysOverdue}d overdue` : ""}
                        </Link>
                      </li>
                    );
                  })}
                {counts.overdue > 3 && (
                  <li className="text-xs text-red-600">…and {counts.overdue - 3} more</li>
                )}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* What are registers callout */}
      {!loading && !isAssessor && counts.never_used > 0 && counts.never_used === counts.all && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5">
          <Info className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-blue-900">Getting started with compliance registers</p>
            <p className="text-xs text-blue-800 mt-0.5 leading-relaxed">
              Registers are the day-to-day record-keeping that proves your controls are
              working in practice — not just on paper. Start with the{" "}
              <Link href="/dashboard/evidence-engine/registers/training_completion" className="font-semibold underline">
                Security Training Register
              </Link>{" "}
              and{" "}
              <Link href="/dashboard/evidence-engine/registers/access_authorization" className="font-semibold underline">
                User Access Register
              </Link>
              {" "}— examiners ask for these first.
            </p>
          </div>
        </div>
      )}

      {/* Filter chips + summary */}
      {!loading && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {(["all", "overdue", "due_soon", "never_used", "current"] as const).map((s) => (
            <SummaryChip
              key={s}
              status={s}
              count={s === "all" ? counts.all : counts[s]}
              active={filter === s}
              onClick={() => setFilter(s)}
            />
          ))}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
            <BookOpen className="h-3.5 w-3.5" />
            <span>{counts.current} of {counts.all} registers current</span>
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-full mb-1" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
              <div className="h-px bg-gray-100 mt-4 mb-3" />
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map((j) => (
                  <div key={j}>
                    <div className="h-2.5 bg-gray-100 rounded w-2/3 mb-1" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Register cards grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((reg) => (
            <RegisterCard key={reg.registerKey} reg={reg} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-8 py-12 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-600">No registers with status "{filter}"</p>
          <button
            type="button"
            onClick={() => setFilter("all")}
            className="mt-3 text-xs text-blue-600 hover:underline"
          >
            Show all registers
          </button>
        </div>
      )}

      {/* Footer guidance */}
      {!loading && (
        <div className="mt-8 space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-gray-700">How C3PAO examiners use these registers</p>
                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                  Examiners will request your registers as part of the{" "}
                  <strong>examine</strong> method — they expect to see actual records, not
                  just policies. Each register entry timestamps your compliance activity
                  and creates an auditable chain of evidence. Registers with no entries are
                  treated as non-existent, regardless of your policies.
                </p>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <strong>Current</strong> — within cadence window
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <strong>Due Soon</strong> — entry needed within 7 days
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    <strong>Overdue</strong> — past cadence deadline — assessor finding
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-gray-400" />
                    <strong>Never Used</strong> — no entries on record
                  </span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end">
            <Link
              href="/dashboard/evidence-engine"
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View control-level evidence coverage (advanced)
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
