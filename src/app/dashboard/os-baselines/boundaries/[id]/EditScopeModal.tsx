"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { SCOPE_OPTIONS } from "@/types/boundary";
import type { ScopeComponent } from "@/types/boundary";

export function EditScopeModal({
  boundaryId,
  initialScopeComponents,
  open,
  onClose,
}: {
  boundaryId: string;
  initialScopeComponents: string[] | null;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [scopeComponents, setScopeComponents] = useState<ScopeComponent[]>(
    (initialScopeComponents ?? []) as ScopeComponent[]
  );
  const [saving, setSaving] = useState(false);

  function toggle(value: ScopeComponent) {
    setScopeComponents((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/os-baselines/boundaries/${boundaryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope_components: scopeComponents.length > 0 ? scopeComponents : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update scope");
      }
      onClose();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-scope-title"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-[var(--color-border)] px-6 py-4">
          <h2 id="edit-scope-title" className="text-lg font-semibold text-[var(--color-gray-900)]">
            Edit in-scope components
          </h2>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="rounded-lg p-2 text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-700)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <p className="mb-4 text-sm text-[var(--color-gray-600)]">
            Select the types of systems and components that are in scope for this boundary.
          </p>
          <div className="space-y-4">
            {SCOPE_OPTIONS.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-gray-500)]">
                  {group.label}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {group.items.map((item) => (
                    <label
                      key={item.value}
                      className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-gray-700)]"
                    >
                      <input
                        type="checkbox"
                        checked={scopeComponents.includes(item.value)}
                        onChange={() => toggle(item.value)}
                        className="h-3.5 w-3.5 rounded border-[var(--color-border)] text-[var(--color-blue-accent)]"
                      />
                      {item.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
