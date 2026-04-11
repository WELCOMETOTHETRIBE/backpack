"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Trash2, ExternalLink, AlertTriangle } from "lucide-react";

const TRAINING_TYPES = [
  { value: "security_awareness", label: "Security Awareness (3.2.1)" },
  { value: "role_based", label: "Role-Based Security (3.2.2)" },
  { value: "insider_threat", label: "Insider Threat (3.2.3)" },
  { value: "other", label: "Other" },
];

const DELIVERY_METHODS = [
  { value: "online", label: "Online / LMS" },
  { value: "cbt", label: "Computer-based training" },
  { value: "classroom", label: "Instructor-led classroom" },
  { value: "self_study", label: "Self-study / reading" },
];

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

const EMPTY_FORM = {
  personnelName: "",
  personnelEmail: "",
  trainingType: "security_awareness",
  courseTitle: "",
  deliveryMethod: "online",
  completedAt: new Date().toISOString().slice(0, 10),
  expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().slice(0, 10),
  evidenceUrl: "",
  notes: "",
};

function TypeBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    security_awareness: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    role_based: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    insider_threat: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
    other: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  const label = TRAINING_TYPES.find((t) => t.value === type)?.label.split(" (")[0] ?? type;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[type] ?? map.other}`}>
      {label}
    </span>
  );
}

function ExpiryBadge({ expiresAt }: { expiresAt: string | null }) {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt);
  const now = new Date();
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 3600 * 24));
  if (daysLeft < 0)
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/20 dark:text-red-400">Expired</span>;
  if (daysLeft <= 30)
    return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">Expires in {daysLeft}d</span>;
  return <span className="text-xs text-gray-500 dark:text-gray-400">Expires {exp.toLocaleDateString()}</span>;
}

export default function TrainingClient({ initialRecords }: { initialRecords: TrainingRecord[] }) {
  const router = useRouter();
  const [records, setRecords] = useState<TrainingRecord[]>(initialRecords);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiredCount = records.filter((r) => r.expiresAt && new Date(r.expiresAt) < new Date()).length;
  const expiringSoonCount = records.filter((r) => {
    if (!r.expiresAt) return false;
    const days = Math.ceil((new Date(r.expiresAt).getTime() - Date.now()) / (1000 * 3600 * 24));
    return days >= 0 && days <= 30;
  }).length;

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
      setRecords((prev) => [{ ...data }, ...prev]);
      setForm(EMPTY_FORM);
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
      setRecords((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100";
  const labelClass = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Training Records</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Track security awareness and role-based training completions for CMMC 3.2.x compliance.
            {" "}{records.length} record{records.length !== 1 ? "s" : ""} on file.
          </p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setError(null); }}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <PlusCircle className="h-3.5 w-3.5" aria-hidden />
          Add record
        </button>
      </div>

      {/* Alert banners */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-900 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {expiredCount > 0 && `${expiredCount} expired record${expiredCount > 1 ? "s" : ""}`}
            {expiredCount > 0 && expiringSoonCount > 0 && " · "}
            {expiringSoonCount > 0 && `${expiringSoonCount} expiring within 30 days`}
          </div>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            Renew training and add updated records to maintain continuous compliance.
          </p>
        </div>
      )}

      {/* Add record form */}
      {showForm && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-800/30 dark:bg-blue-950/20">
          <h2 className="mb-4 text-sm font-semibold text-gray-900 dark:text-gray-100">New Training Record</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Personnel name *</label>
              <input type="text" value={form.personnelName} onChange={(e) => setForm({ ...form, personnelName: e.target.value })} placeholder="Jane Smith" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Email (optional)</label>
              <input type="email" value={form.personnelEmail} onChange={(e) => setForm({ ...form, personnelEmail: e.target.value })} placeholder="jane@example.com" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Training type *</label>
              <select value={form.trainingType} onChange={(e) => setForm({ ...form, trainingType: e.target.value })} className={inputClass}>
                {TRAINING_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Delivery method</label>
              <select value={form.deliveryMethod} onChange={(e) => setForm({ ...form, deliveryMethod: e.target.value })} className={inputClass}>
                {DELIVERY_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Course title *</label>
              <input type="text" value={form.courseTitle} onChange={(e) => setForm({ ...form, courseTitle: e.target.value })} placeholder="e.g. Annual CUI Security Awareness Training 2026" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Completion date *</label>
              <input type="date" value={form.completedAt} onChange={(e) => setForm({ ...form, completedAt: e.target.value })} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Expiry date (optional)</label>
              <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Evidence URL (completion certificate, LMS screenshot)</label>
              <input type="url" value={form.evidenceUrl} onChange={(e) => setForm({ ...form, evidenceUrl: e.target.value })} placeholder="https://lms.example.com/cert/..." className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Notes (optional)</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputClass} />
            </div>
          </div>
          {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={handleSubmit} disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              {submitting ? "Saving…" : "Save record"}
            </button>
            <button onClick={() => { setShowForm(false); setError(null); }} className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Records table */}
      {records.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center dark:border-gray-700 dark:bg-gray-900">
          <p className="text-sm font-medium text-gray-500">No training records yet.</p>
          <p className="mt-1 text-xs text-gray-400">Add records for each person who has completed CMMC security training.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Personnel</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Course</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 hidden sm:table-cell">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Completed</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 hidden md:table-cell">Expiry</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 dark:text-gray-100">{r.personnelName}</p>
                    {r.personnelEmail && <p className="text-xs text-gray-500">{r.personnelEmail}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-800 dark:text-gray-200">{r.courseTitle}</p>
                    {r.evidenceUrl && (
                      <a href={r.evidenceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline dark:text-blue-400">
                        Certificate <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <TypeBadge type={r.trainingType} />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                    {new Date(r.completedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <ExpiryBadge expiresAt={r.expiresAt} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500">
        CMMC 3.2.1 requires annual security awareness training for all users. 3.2.2 requires role-based training for privileged users. 3.2.3 requires insider threat awareness. Keep records for at least 3 years.
      </p>
    </div>
  );
}
