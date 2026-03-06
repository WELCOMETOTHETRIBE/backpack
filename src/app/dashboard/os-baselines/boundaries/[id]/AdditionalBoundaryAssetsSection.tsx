"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Trash2 } from "lucide-react";

const COMPONENT_TYPE_LABELS: Record<string, string> = {
  network_device: "Networking device",
  vm: "VM",
  bare_metal: "Bare metal",
};

type Component = {
  id: string;
  boundaryId: string;
  name: string;
  componentType: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export function AdditionalBoundaryAssetsSection({ boundaryId }: { boundaryId: string }) {
  const router = useRouter();
  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [componentType, setComponentType] = useState<"network_device" | "vm" | "bare_metal">("network_device");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/os-baselines/boundaries/${boundaryId}/components`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setComponents)
      .catch(() => setComponents([]))
      .finally(() => setLoading(false));
  }, [boundaryId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setAdding(true);
    try {
      const res = await fetch(`/api/os-baselines/boundaries/${boundaryId}/components`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          component_type: componentType,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to add");
      }
      const created = await res.json();
      setComponents((prev) => [...prev, created]);
      setName("");
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(componentId: string) {
    try {
      const res = await fetch(
        `/api/os-baselines/boundaries/${boundaryId}/components/${componentId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed");
      setComponents((prev) => prev.filter((c) => c.id !== componentId));
      router.refresh();
    } catch {
      setError("Failed to delete");
    }
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
        Additional boundary assets
      </h2>
      <p className="mt-2 text-sm text-[var(--color-gray-600)]">
        Networking devices, additional VMs, or bare metal that are in scope but not added as OS endpoints.
      </p>

      <form onSubmit={handleAdd} className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)]/50 p-4">
        <div className="min-w-[160px]">
          <label className="block text-xs font-medium text-[var(--color-gray-600)]">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Firewall-01"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[140px]">
          <label className="block text-xs font-medium text-[var(--color-gray-600)]">Type</label>
          <select
            value={componentType}
            onChange={(e) => setComponentType(e.target.value as "network_device" | "vm" | "bare_metal")}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <option value="network_device">Networking device</option>
            <option value="vm">VM</option>
            <option value="bare_metal">Bare metal</option>
          </select>
        </div>
        <div className="min-w-[180px] flex-1">
          <label className="block text-xs font-medium text-[var(--color-gray-600)]">Notes (optional)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional description"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={adding || !name.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
        >
          <PlusCircle className="h-4 w-4" />
          {adding ? "Adding…" : "Add item"}
        </button>
      </form>

      {error && (
        <p className="mt-2 text-sm text-[var(--color-status-red)]">{error}</p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-[var(--color-gray-500)]">Loading…</p>
      ) : components.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--color-gray-500)]">
          No additional assets yet. Add networking devices, VMs, or bare metal above.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {components.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3"
            >
              <div>
                <span className="font-medium text-[var(--color-gray-900)]">{c.name}</span>
                <span className="ml-2 inline-flex rounded-full bg-[var(--color-gray-200)] px-2 py-0.5 text-xs font-medium text-[var(--color-gray-700)]">
                  {COMPONENT_TYPE_LABELS[c.componentType] ?? c.componentType}
                </span>
                {c.notes && (
                  <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">{c.notes}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(c.id)}
                className="rounded p-2 text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-status-red)]"
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
