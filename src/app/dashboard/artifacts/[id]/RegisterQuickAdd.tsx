"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type RegisterColumn = { key: string; label: string; type: string };

export function RegisterQuickAdd({
  registerKey,
  registerName,
  boundaryId,
  columns,
}: {
  registerKey: string;
  registerName: string;
  boundaryId: string;
  columns: RegisterColumn[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string | boolean | number>>(() => {
    const init: Record<string, string | boolean | number> = {};
    for (const c of columns) {
      init[c.key] = c.type === "boolean" ? false : c.type === "number" ? 0 : "";
    }
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function setValue(key: string, v: string | boolean | number) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function onAdd() {
    setSaving(true);
    setErr(null);
    setOk(null);
    try {
      const createRes = await fetch(
        `/api/governance/registers/${encodeURIComponent(registerKey)}/entries`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            boundary_id: boundaryId,
            entryData: values,
          }),
        }
      );
      if (!createRes.ok) {
        const j = await createRes.json().catch(() => ({}));
        throw new Error(j.error ?? `Create failed (${createRes.status})`);
      }
      const entry = await createRes.json();

      // Admins can finalize immediately; non-admins leave as draft (server
      // enforces the role check and returns 403 which we surface cleanly).
      const finalRes = await fetch(`/api/evidence-engine/entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boundary_id: boundaryId, status: "final" }),
      });
      if (finalRes.ok) {
        setOk("Entry created and finalized.");
      } else if (finalRes.status === 403) {
        setOk("Entry saved as draft. An Admin must finalize to close the milestone.");
      } else {
        const j = await finalRes.json().catch(() => ({}));
        throw new Error(j.error ?? `Finalize failed (${finalRes.status})`);
      }

      // Reset form
      const reset: Record<string, string | boolean | number> = {};
      for (const c of columns) {
        reset[c.key] = c.type === "boolean" ? false : c.type === "number" ? 0 : "";
      }
      setValues(reset);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-sky-300 bg-sky-50 p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-sky-900">
        Add to {registerName}
      </h2>
      <p className="mt-1 text-xs text-sky-900/70">
        Preferred way to close this milestone. Fill the form and save — the
        entry will be finalized and the milestone will satisfy the control.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {columns.map((c) => (
          <label key={c.key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-[var(--color-text)]">{c.label}</span>
            {c.type === "boolean" ? (
              <input
                type="checkbox"
                checked={Boolean(values[c.key])}
                onChange={(e) => setValue(c.key, e.target.checked)}
                className="h-4 w-4"
              />
            ) : c.type === "date" ? (
              <input
                type="date"
                value={String(values[c.key] ?? "")}
                onChange={(e) => setValue(c.key, e.target.value)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
              />
            ) : c.type === "number" ? (
              <input
                type="number"
                value={Number(values[c.key] ?? 0)}
                onChange={(e) => setValue(c.key, Number(e.target.value))}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
              />
            ) : (
              <input
                type="text"
                value={String(values[c.key] ?? "")}
                onChange={(e) => setValue(c.key, e.target.value)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm"
              />
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={onAdd}
          disabled={saving}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add entry"}
        </button>
        {err && <div className="text-sm text-red-600">{err}</div>}
        {ok && <div className="text-sm text-emerald-700">{ok}</div>}
      </div>
    </section>
  );
}
