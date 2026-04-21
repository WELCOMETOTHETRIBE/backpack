"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

export type SystemIdentityInitial = {
  systemName: string | null;
  systemOwnerName: string | null;
  systemOwnerEmail: string | null;
  issoName: string | null;
  issoEmail: string | null;
  authorizationBoundaryStatement: string | null;
  boundaryScopingCompletedAt: string | null;
};

const FIELDS: Array<{
  key: keyof Omit<SystemIdentityInitial, "boundaryScopingCompletedAt">;
  label: string;
  help: string;
  type: "text" | "email" | "textarea";
}> = [
  { key: "systemName", label: "System name", help: "Formal SSP system name (may differ from org display name).", type: "text" },
  { key: "systemOwnerName", label: "System owner", help: "Government-designated system owner (name).", type: "text" },
  { key: "systemOwnerEmail", label: "System owner email", help: "Point-of-contact email for the system owner.", type: "email" },
  { key: "issoName", label: "ISSO name", help: "Information System Security Officer (name).", type: "text" },
  { key: "issoEmail", label: "ISSO email", help: "Point-of-contact email for the ISSO.", type: "email" },
  { key: "authorizationBoundaryStatement", label: "Authorization boundary statement", help: "Formal boundary statement anchoring the SSP.", type: "textarea" },
];

export default function SystemIdentificationForm({ initial }: { initial: SystemIdentityInitial }) {
  const [values, setValues] = useState<Record<string, string>>({
    systemName: initial.systemName ?? "",
    systemOwnerName: initial.systemOwnerName ?? "",
    systemOwnerEmail: initial.systemOwnerEmail ?? "",
    issoName: initial.issoName ?? "",
    issoEmail: initial.issoEmail ?? "",
    authorizationBoundaryStatement: initial.authorizationBoundaryStatement ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/organizations", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Save failed (HTTP ${res.status})`);
        return;
      }
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50">
          <FileText className="h-4 w-4 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">System Identification</h2>
          <p className="text-xs text-slate-500">
            These fields populate the SSP and the System Identification Checklist.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {FIELDS.map((f) =>
          f.type === "textarea" ? (
            <div key={f.key} className="md:col-span-2">
              <label htmlFor={f.key} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {f.label}
              </label>
              <textarea
                id={f.key}
                rows={3}
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={f.help}
              />
              <p className="mt-1 text-xs text-slate-500">{f.help}</p>
            </div>
          ) : (
            <div key={f.key}>
              <label htmlFor={f.key} className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {f.label}
              </label>
              <input
                id={f.key}
                type={f.type}
                value={values[f.key]}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={f.help}
              />
              <p className="mt-1 text-xs text-slate-500">{f.help}</p>
            </div>
          )
        )}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="text-xs text-slate-500">
          {initial.boundaryScopingCompletedAt ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Boundary scoping marked complete
            </span>
          ) : (
            <span className="text-amber-700">Boundary scoping not yet marked complete.</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {error && <span className="text-xs text-red-600">{error}</span>}
          {savedAt && !error && (
            <span className="text-xs text-emerald-700">Saved.</span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
