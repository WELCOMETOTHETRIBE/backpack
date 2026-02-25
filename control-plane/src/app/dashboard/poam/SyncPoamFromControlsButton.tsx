"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncPoamFromControlsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/poam/entries/sync-from-controls", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const created = data.created ?? 0;
        setMessage(created === 0 ? "No new entries." : `Created ${created} POA&M entr${created === 1 ? "y" : "ies"}.`);
        router.refresh();
      } else {
        setMessage(data.error ?? "Sync failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={loading}
        className="rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {loading ? "Syncing…" : "Create POA&M for incomplete controls"}
      </button>
      {message && <span className="text-sm text-zinc-600">{message}</span>}
    </div>
  );
}
