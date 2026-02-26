"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteAssetButton({
  assetId,
  hostname,
  boundaryId,
}: {
  assetId: string;
  hostname: string;
  boundaryId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/os-baselines/assets/${assetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      router.push(`/dashboard/os-baselines/boundaries/${boundaryId}`);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-status-red)]/50 bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-status-red)] hover:bg-[var(--color-status-red)]/5"
      >
        <Trash2 className="h-4 w-4" />
        Delete asset
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !deleting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-gray-900)]">Delete asset</h3>
            <p className="mt-2 text-sm text-[var(--color-gray-600)]">
              Remove &quot;{hostname}&quot; from this boundary? Evidence runs already imported for this system will remain.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={deleting}
                className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg bg-[var(--color-status-red)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
