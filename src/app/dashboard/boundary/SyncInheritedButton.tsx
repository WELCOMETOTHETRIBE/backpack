"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

export function SyncInheritedButton() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{
    updated: number;
    skipped: number;
    providers: string[];
  } | null>(null);

  async function handleSync() {
    if (syncing) return;
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/boundary/sync-inherited-controls", { method: "POST" });
      if (res.ok) setResult(await res.json());
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={syncing}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] disabled:opacity-60 transition-colors"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Syncing…" : "Re-sync inherited controls"}
      </button>
      {result && (
        <p className="text-xs text-emerald-700 font-medium">
          {result.updated} control{result.updated !== 1 ? "s" : ""} updated · {result.skipped} preserved
        </p>
      )}
    </div>
  );
}
