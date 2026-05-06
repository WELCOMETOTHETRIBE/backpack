"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PlusCircle,
  Trash2,
  ExternalLink,
  AlertTriangle,
  Users,
  ShieldAlert,
  Eye,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  FileStack,
  Shield,
  ShieldCheck,
  UserCheck,
  UserX,
  Settings,
  ClipboardList,
} from "lucide-react";
import CertificateImporter from "@/components/training/CertificateImporter";

// ── Constants ────────────────────────────────────────────────────────────────

const TRAINING_SECTIONS = [
  {
    type: "security_awareness",
    control: "3.2.1",
    title: "Security Awareness Training",
    audience: "All Users",
    audienceNote: "Every person with access to CUI systems must complete this annually.",
    sprsValue: 3,
    icon: Users,
    requiredFor: ["general", "privileged"] as const,
    color: {
      bg: "bg-blue-50 dark:bg-blue-950/20",
      border: "border-blue-200 dark:border-blue-800/40",
      header: "bg-blue-600",
      badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      pill: "bg-blue-100 text-blue-700",
      button: "bg-blue-600 hover:bg-blue-700",
    },
  },
  {
    type: "role_based",
    control: "3.2.2",
    title: "Role-Based / Privileged User Training",
    audience: "Privileged Users",
    audienceNote:
      "Required for system administrators, IT staff, security personnel, and anyone with elevated access.",
    sprsValue: 3,
    icon: ShieldAlert,
    requiredFor: ["privileged"] as const,
    color: {
      bg: "bg-violet-50 dark:bg-violet-950/20",
      border: "border-violet-200 dark:border-violet-800/40",
      header: "bg-violet-600",
      badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
      pill: "bg-violet-100 text-violet-700",
      button: "bg-violet-600 hover:bg-violet-700",
    },
  },
  {
    type: "insider_threat",
    control: "3.2.3",
    title: "Insider Threat Awareness",
    audience: "All Users",
    audienceNote: "All personnel must complete insider threat awareness training annually.",
    sprsValue: 5,
    icon: Eye,
    requiredFor: ["general", "privileged"] as const,
    color: {
      bg: "bg-orange-50 dark:bg-orange-950/20",
      border: "border-orange-200 dark:border-orange-800/40",
      header: "bg-orange-600",
      badge: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
      pill: "bg-orange-100 text-orange-700",
      button: "bg-orange-600 hover:bg-orange-700",
    },
  },
] as const;

const USER_ROLES = [
  { value: "all_users", label: "All Users" },
  { value: "system_administrator", label: "System Administrator" },
  { value: "it_staff", label: "IT Staff" },
  { value: "security_officer", label: "Security Officer / ISSO" },
  { value: "developer", label: "Developer / Engineer" },
  { value: "privileged_user", label: "Privileged User (other)" },
  { value: "manager", label: "Manager / Supervisor" },
  { value: "contractor", label: "Contractor" },
];

const DELIVERY_METHODS = [
  { value: "mactech_training", label: "MacTech Training", note: "MacTech Solutions external training platform" },
  { value: "online", label: "Online / LMS" },
  { value: "cbt", label: "Computer-based training" },
  { value: "classroom", label: "Instructor-led classroom" },
  { value: "self_study", label: "Self-study / reading" },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface TrainingRecord {
  id: string;
  personnelName: string;
  personnelEmail: string | null;
  trainingType: string;
  courseTitle: string;
  deliveryMethod: string | null;
  completedAt: string;
  expiresAt: string | null;
  evidenceUrl: string | null;
  notes: string | null;
  createdAt: string;
}

type UserType = "general" | "privileged";

interface BoundaryUser {
  id: string;
  email: string;
  name: string | null;
  userType: UserType;
}

const makeEmptyForm = (type: string) => ({
  personnelName: "",
  personnelEmail: "",
  userRole: "all_users",
  trainingType: type,
  courseTitle: "",
  deliveryMethod: "mactech_training",
  completedAt: new Date().toISOString().slice(0, 10),
  expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  evidenceUrl: "",
  notes: "",
});

// ── Sub-components ───────────────────────────────────────────────────────────

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  const daysLeft = Math.ceil((exp.getTime() - Date.now()) / (1000 * 3600 * 24));
  if (daysLeft < 0)
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">
        Expired
      </span>
    );
  if (daysLeft <= 30)
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
        Expires in {daysLeft}d
      </span>
    );
  return (
    <span className="text-xs text-gray-500 dark:text-gray-400">
      {exp.toLocaleDateString()}
    </span>
  );
}

function DeliveryBadge({ method }: { method: string | null }) {
  if (!method) return null;
  const m = DELIVERY_METHODS.find((d) => d.value === method);
  if (!m) return <span className="text-xs text-gray-500">{method}</span>;
  return (
    <span className={`text-xs ${method === "mactech_training" ? "font-semibold text-[#00A882]" : "text-gray-500"}`}>
      {m.label}
    </span>
  );
}

function RoleBadge({ role }: { role: string | null | undefined }) {
  if (!role) return null;
  const r = USER_ROLES.find((u) => u.value === role);
  return <span className="text-xs text-gray-500 dark:text-gray-400">{r?.label ?? role}</span>;
}

// ── User Compliance Roster ───────────────────────────────────────────────────

interface UserComplianceRosterProps {
  users: BoundaryUser[];
  records: TrainingRecord[];
}

function UserComplianceRoster({ users, records }: UserComplianceRosterProps) {
  const [expanded, setExpanded] = useState(true);

  // Calculate compliance status for each user
  const userCompliance = useMemo(() => {
    return users.map((user) => {
      const userRecords = records.filter(
        (r) =>
          r.personnelName.toLowerCase() === user.name?.toLowerCase() ||
          r.personnelEmail?.toLowerCase() === user.email.toLowerCase()
      );

      const requiredTrainings = TRAINING_SECTIONS.filter((s) =>
        (s.requiredFor as readonly UserType[]).includes(user.userType)
      );

      const completedTrainings = requiredTrainings.filter((section) => {
        const sectionRecords = userRecords.filter((r) => r.trainingType === section.type);
        // Check if there's at least one non-expired record
        return sectionRecords.some(
          (r) => !r.expiresAt || new Date(r.expiresAt) >= new Date()
        );
      });

      const missingTrainings = requiredTrainings.filter(
        (section) => !completedTrainings.includes(section)
      );

      const expiringSoonTrainings = requiredTrainings.filter((section) => {
        const sectionRecords = userRecords.filter((r) => r.trainingType === section.type);
        return sectionRecords.some((r) => {
          if (!r.expiresAt) return false;
          const days = Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / (1000 * 3600 * 24));
          return days >= 0 && days <= 30;
        });
      });

      return {
        user,
        requiredCount: requiredTrainings.length,
        completedCount: completedTrainings.length,
        missingTrainings,
        expiringSoonTrainings,
        isCompliant: missingTrainings.length === 0,
        hasExpiringSoon: expiringSoonTrainings.length > 0,
      };
    });
  }, [users, records]);

  const compliantCount = userCompliance.filter((u) => u.isCompliant).length;
  const totalCount = users.length;
  const privilegedCount = users.filter((u) => u.userType === "privileged").length;
  const generalCount = totalCount - privilegedCount;

  if (users.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900/50">
        <div className="flex flex-col items-center justify-center py-6">
          <Users className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
            No Boundary Users Defined
          </h3>
          <p className="mt-1 max-w-sm text-center text-xs text-slate-500 dark:text-slate-400">
            Define users in your CUI boundary to track training compliance. Go to Settings → User Management
            to add users and classify them as General or Privileged.
          </p>
          <Link
            href="/dashboard/settings"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Settings className="h-4 w-4" />
            Go to User Management
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
            <Users className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Boundary User Compliance
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Track training compliance for all users in your CUI boundary
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-slate-500">
              <Shield className="h-3.5 w-3.5 text-blue-500" />
              {generalCount} general
            </span>
            <span className="flex items-center gap-1.5 text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5 text-violet-500" />
              {privilegedCount} privileged
            </span>
          </div>
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
            compliantCount === totalCount
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          }`}>
            {compliantCount === totalCount ? (
              <UserCheck className="h-3.5 w-3.5" />
            ) : (
              <UserX className="h-3.5 w-3.5" />
            )}
            {compliantCount}/{totalCount} compliant
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* User table */}
      {expanded && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  User
                </th>
                <th
                  className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
                  title="CUI environment privilege — separate from Trust Codex platform role. Drives whether AT.L2-3.2.2 role-based training is required."
                >
                  CUI Access
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  3.2.1 Awareness
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  3.2.2 Role-Based
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  3.2.3 Insider Threat
                </th>
                <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {userCompliance.map(({ user, isCompliant, missingTrainings }) => {
                const userRecords = records.filter(
                  (r) =>
                    r.personnelName.toLowerCase() === user.name?.toLowerCase() ||
                    r.personnelEmail?.toLowerCase() === user.email.toLowerCase()
                );

                const getTrainingStatus = (trainingType: string, requiredFor: readonly string[]) => {
                  if (!requiredFor.includes(user.userType)) {
                    return { status: "na", label: "N/A" };
                  }
                  const typeRecords = userRecords.filter((r) => r.trainingType === trainingType);
                  if (typeRecords.length === 0) {
                    return { status: "missing", label: "Missing" };
                  }
                  const validRecord = typeRecords.find(
                    (r) => !r.expiresAt || new Date(r.expiresAt) >= new Date()
                  );
                  if (!validRecord) {
                    return { status: "expired", label: "Expired" };
                  }
                  if (validRecord.expiresAt) {
                    const days = Math.ceil(
                      (new Date(validRecord.expiresAt).getTime() - Date.now()) / (1000 * 3600 * 24)
                    );
                    if (days <= 30) {
                      return { status: "expiring", label: `${days}d` };
                    }
                  }
                  return { status: "complete", label: "✓" };
                };

                const awareness = getTrainingStatus("security_awareness", ["general", "privileged"]);
                const roleBased = getTrainingStatus("role_based", ["privileged"]);
                const insider = getTrainingStatus("insider_threat", ["general", "privileged"]);

                const StatusCell = ({ status, label }: { status: string; label: string }) => {
                  const classes = {
                    complete: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                    missing: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                    expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                    expiring: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    na: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
                  };
                  return (
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${classes[status as keyof typeof classes] ?? classes.na}`}>
                      {label}
                    </span>
                  );
                };

                return (
                  <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400">
                          {(user.name?.[0] ?? user.email[0]).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {user.name || "Unnamed User"}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.userType === "privileged"
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"
                          : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      }`}>
                        {user.userType === "privileged" ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <Shield className="h-3 w-3" />
                        )}
                        {user.userType === "privileged" ? "Privileged" : "General"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusCell {...awareness} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusCell {...roleBased} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusCell {...insider} />
                    </td>
                    <td className="px-5 py-3">
                      {isCompliant ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Compliant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
                          <XCircle className="h-3.5 w-3.5" />
                          {missingTrainings.length} missing
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-700 dark:bg-slate-800/50">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong className="font-medium text-slate-600 dark:text-slate-300">Note:</strong>{" "}
              User types are managed in{" "}
              <Link href="/dashboard/settings" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                Settings → User Management
              </Link>
              . General users require 3.2.1 and 3.2.3. Privileged users require all three training types.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Sync Training POAMs Button ───────────────────────────────────────────────

function SyncTrainingPoamsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ message: string; isError?: boolean } | null>(null);

  async function handleSync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/training-records/sync-poams", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ message: data.message ?? "Done." });
        if (data.created > 0) router.refresh();
      } else {
        setResult({ message: data.error ?? "Failed to sync.", isError: true });
      }
    } catch {
      setResult({ message: "Network error.", isError: true });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-300 dark:hover:bg-amber-950/40"
      >
        <ClipboardList className="h-4 w-4" />
        {loading ? "Generating POAMs..." : "Generate POAMs for Training Gaps"}
      </button>
      {result && (
        <span className={`text-sm ${result.isError ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-400"}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}

// ── Training Section ─────────────────────────────────────────────────────────

interface SectionProps {
  section: (typeof TRAINING_SECTIONS)[number];
  records: TrainingRecord[];
  onAdd: (record: TrainingRecord) => void;
  onDelete: (id: string) => void;
}

function TrainingSection({ section, records, onAdd, onDelete }: SectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState(() => makeEmptyForm(section.type));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const sectionRecords = records.filter((r) => r.trainingType === section.type);
  const expiredCount = sectionRecords.filter(
    (r) => r.expiresAt && new Date(r.expiresAt) < new Date()
  ).length;
  const expiringSoonCount = sectionRecords.filter((r) => {
    if (!r.expiresAt) return false;
    const days = Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / (1000 * 3600 * 24));
    return days >= 0 && days <= 30;
  }).length;
  const currentCount = sectionRecords.filter(
    (r) => !r.expiresAt || new Date(r.expiresAt) >= new Date()
  ).length;

  const compliant = currentCount > 0 && expiredCount === 0;
  const PREVIEW_COUNT = 5;
  const displayedRecords = showAll ? sectionRecords : sectionRecords.slice(0, PREVIEW_COUNT);

  const handleSubmit = async () => {
    if (!form.personnelName.trim() || !form.courseTitle.trim() || !form.completedAt) {
      setError("Name, course title, and completion date are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/training-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Server error"); return; }
      onAdd({ ...data });
      setForm(makeEmptyForm(section.type));
      setShowForm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this training record?")) return;
    const res = await fetch(`/api/training-records?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      onDelete(id);
      router.refresh();
    }
  };

  const Icon = section.icon;
  const c = section.color;
  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";
  const labelClass = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <section className={`overflow-hidden rounded-2xl border shadow-sm ${c.border} ${c.bg}`}>
      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.header}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {section.title}
              </h2>
              <span className="font-mono text-xs font-medium text-gray-400">NIST {section.control}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${c.badge}`}>
                {section.audience}
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                -{section.sprsValue} pts if unmet
              </span>
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{section.audienceNote}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {compliant ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {currentCount} record{currentCount !== 1 ? "s" : ""} current
            </span>
          ) : sectionRecords.length === 0 ? (
            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
              <XCircle className="h-3.5 w-3.5" />
              No records
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              {expiredCount > 0 ? `${expiredCount} expired` : `${expiringSoonCount} expiring soon`}
            </span>
          )}
          <button
            onClick={() => { setShowForm((s) => !s); setError(null); }}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white ${c.button}`}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add record
          </button>
        </div>
      </div>

      {/* Expiry alert */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <div className="mx-5 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-700/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {expiredCount > 0 && `${expiredCount} expired record${expiredCount !== 1 ? "s" : ""}`}
            {expiredCount > 0 && expiringSoonCount > 0 && " · "}
            {expiringSoonCount > 0 && `${expiringSoonCount} expiring within 30 days`}
            {" — renew and add updated records to maintain compliance."}
          </div>
        </div>
      )}

      {/* Add record form */}
      {showForm && (
        <div className="mx-5 mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            New {section.title} Record
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Personnel name *</label>
              <input
                type="text"
                value={form.personnelName}
                onChange={(e) => setForm({ ...form, personnelName: e.target.value })}
                placeholder="Jane Smith"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email (optional)</label>
              <input
                type="email"
                value={form.personnelEmail}
                onChange={(e) => setForm({ ...form, personnelEmail: e.target.value })}
                placeholder="jane@example.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>User role</label>
              <select
                value={form.userRole}
                onChange={(e) => setForm({ ...form, userRole: e.target.value })}
                className={inputClass}
              >
                {USER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Delivery method</label>
              <select
                value={form.deliveryMethod}
                onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })}
                className={inputClass}
              >
                {DELIVERY_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              {form.deliveryMethod === "mactech_training" && (
                <p className="mt-1 text-xs text-[#00A882]">
                  MacTech Solutions external training platform
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Course title *</label>
              <input
                type="text"
                value={form.courseTitle}
                onChange={(e) => setForm({ ...form, courseTitle: e.target.value })}
                placeholder={
                  section.type === "security_awareness"
                    ? "e.g. Annual CUI Security Awareness Training 2026"
                    : section.type === "role_based"
                    ? "e.g. Privileged User Security Administration Training 2026"
                    : "e.g. Insider Threat Awareness Training 2026"
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Completion date *</label>
              <input
                type="date"
                value={form.completedAt}
                onChange={(e) => setForm({ ...form, completedAt: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Expiry date</label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Evidence URL (completion certificate, LMS screenshot)</label>
              <input
                type="url"
                value={form.evidenceUrl}
                onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })}
                placeholder="https://training.mactech.com/cert/..."
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Notes (optional)</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className={inputClass}
              />
            </div>
          </div>
          {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className={`rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${c.button}`}
            >
              {submitting ? "Saving…" : "Save record"}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null); }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* MacTech certificate importer */}
      <div className="mx-5 mb-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          Import from MacTech Training
        </p>
        <CertificateImporter
          atControl={section.control as "3.2.1" | "3.2.2" | "3.2.3"}
          onImported={(result) => {
            onAdd({
              id: result.trainingRecord.id,
              personnelName: result.trainingRecord.personnelName,
              personnelEmail: null,
              trainingType: section.type,
              courseTitle: result.trainingRecord.courseTitle,
              deliveryMethod: "mactech_training",
              completedAt: new Date().toISOString().slice(0, 10),
              expiresAt: null,
              evidenceUrl: null,
              notes: null,
              createdAt: new Date().toISOString(),
            });
          }}
        />
      </div>

      {/* Records table */}
      {sectionRecords.length === 0 ? (
        <div className="mx-5 mb-5 rounded-lg border border-dashed border-gray-300 p-5 text-center dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500">No {section.title.toLowerCase()} records yet.</p>
          <p className="mt-0.5 text-xs text-gray-400">
            Import a MacTech certificate above or add a record manually.
          </p>
        </div>
      ) : (
        <div className="mx-5 mb-5 overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50">
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Personnel</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Course</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 sm:table-cell">Role</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Delivery</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Completed</th>
                <th className="hidden px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-gray-500 md:table-cell">Expiry</th>
                <th className="w-10 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {displayedRecords.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{r.personnelName}</p>
                    {r.personnelEmail && (
                      <p className="text-xs text-gray-500">{r.personnelEmail}</p>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <p className="text-xs text-gray-800 dark:text-gray-200">{r.courseTitle}</p>
                    {r.evidenceUrl && (
                      <a
                        href={r.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Certificate <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 sm:table-cell">
                    <RoleBadge role={(r as TrainingRecord & { userRole?: string }).userRole} />
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <DeliveryBadge method={r.deliveryMethod} />
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-400">
                    {new Date(r.completedAt).toLocaleDateString()}
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <ExpiryBadge expiresAt={r.expiresAt} />
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      aria-label="Delete record"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sectionRecords.length > PREVIEW_COUNT && (
            <div className="border-t border-gray-200 px-4 py-2.5 dark:border-gray-700">
              <button
                onClick={() => setShowAll((s) => !s)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {showAll ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" />
                    Show fewer
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" />
                    Show all {sectionRecords.length} records
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TrainingClient({ initialRecords }: { initialRecords: TrainingRecord[] }) {
  const [records, setRecords] = useState<TrainingRecord[]>(initialRecords);
  const [boundaryUsers, setBoundaryUsers] = useState<BoundaryUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Load boundary users with their persisted CUI access level. The
  // /api/boundary-users response now carries `cuiAccessLevel` (column
  // added in migration 0064) — no more browser-localStorage state for
  // compliance-impacting per-user data. See AdminUserManagement for the
  // edit UI; this component is read-only.
  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/boundary-users");
        if (res.ok) {
          const users = (await res.json()) as Array<{
            id: string;
            email: string;
            name: string | null;
            cuiAccessLevel?: "general" | "privileged";
          }>;
          const mappedUsers: BoundaryUser[] = users.map((u) => ({
            id: u.id,
            email: u.email,
            name: u.name,
            userType: u.cuiAccessLevel ?? "general",
          }));
          setBoundaryUsers(mappedUsers);
        }
      } catch {
        // ignore - users list is optional feature
      } finally {
        setLoadingUsers(false);
      }
    }
    loadUsers();
  }, []);

  const handleAdd = (record: TrainingRecord) => {
    setRecords((prev) => [record, ...prev]);
  };

  const handleDelete = (id: string) => {
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const totalExpired = useMemo(
    () => records.filter((r) => r.expiresAt && new Date(r.expiresAt) < new Date()).length,
    [records]
  );

  const totalControls = TRAINING_SECTIONS.length;
  const controlsMet = TRAINING_SECTIONS.filter((s) => {
    const sectionRecords = records.filter((r) => r.trainingType === s.type);
    return (
      sectionRecords.length > 0 &&
      sectionRecords.every((r) => !r.expiresAt || new Date(r.expiresAt) >= new Date())
    );
  }).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Training Records</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Track completion of the three CMMC awareness and training controls (NIST 3.2.1 – 3.2.3).{" "}
            {records.length} record{records.length !== 1 ? "s" : ""} on file.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
            controlsMet === totalControls
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/20"
              : "border-amber-200 bg-amber-50 dark:border-amber-700/40 dark:bg-amber-950/20"
          }`}>
            {controlsMet === totalControls ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            <span className={`text-xs font-semibold ${
              controlsMet === totalControls ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"
            }`}>
              {controlsMet} / {totalControls} controls covered
            </span>
          </div>
          {totalExpired > 0 && (
            <span className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 dark:border-red-800/40 dark:bg-red-950/20 dark:text-red-400">
              <XCircle className="h-4 w-4" />
              {totalExpired} expired
            </span>
          )}
        </div>
      </div>

      {/* User Compliance Roster */}
      {!loadingUsers && (
        <UserComplianceRoster users={boundaryUsers} records={records} />
      )}

      {/* POA&M generation for training gaps */}
      {!loadingUsers && boundaryUsers.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-800/40 dark:bg-amber-950/20">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-600">
              <ClipboardList className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Automated POA&M Generation
              </h3>
              <p className="mt-1 mb-3 text-xs text-amber-700 dark:text-amber-300">
                Scan boundary users for missing or expired training and automatically create POA&M entries
                for non-compliant NIST 3.2.x controls. Each entry includes a weakness description,
                remediation plan, 90-day target, and per-user milestones.
              </p>
              <SyncTrainingPoamsButton />
            </div>
          </div>
        </div>
      )}

      {/* Evidence Engine integration notice */}
      <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm dark:border-indigo-800/40 dark:bg-indigo-950/20">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600">
            <FileStack className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">
              Evidence Engine Integration
            </h3>
            <p className="mt-1 text-xs text-indigo-700 dark:text-indigo-300">
              Training records added here are automatically synced to the{" "}
              <Link
                href="/dashboard/evidence-engine/registers/training_completion"
                className="font-semibold underline hover:text-indigo-800 dark:hover:text-indigo-200"
              >
                Training Completion Register
              </Link>{" "}
              in the Evidence Engine. Entries are created as drafts — finalize them in the register to include in auditor exports.
            </p>
          </div>
        </div>
      </div>

      {/* Three training sections */}
      {TRAINING_SECTIONS.map((section) => (
        <TrainingSection
          key={section.type}
          section={section}
          records={records}
          onAdd={handleAdd}
          onDelete={handleDelete}
        />
      ))}

      {/* Footer note */}
      <p className="text-xs text-gray-400 dark:text-gray-500">
        CMMC requires records be retained for a minimum of 3 years.{" "}
        3.2.1 and 3.2.3 apply to all system users. 3.2.2 applies to privileged users (system admins, IT staff, security personnel).{" "}
        MacTech Training is available at the MacTech Solutions customer portal.
      </p>
    </div>
  );
}
