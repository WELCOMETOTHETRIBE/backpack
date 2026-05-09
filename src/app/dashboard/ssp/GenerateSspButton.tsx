"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

/**
 * Admin-only "Generate new version" CTA. POSTs to /api/ssp/generate
 * and refreshes the page so the new draft row appears.
 */
export function GenerateSspButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            const res = await fetch("/api/ssp/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            if (!res.ok) {
              const body = await res.json().catch(() => ({}));
              setError(
                body?.error
                  ? `${body.error}${body.detail ? ` — ${body.detail}` : ""}`
                  : `HTTP ${res.status}`,
              );
            } else {
              router.refresh();
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
      >
        <Plus className="h-4 w-4" />
        {busy ? "Generating…" : "Generate new version"}
      </button>
      {error && <p className="text-[11px] text-rose-700">{error}</p>}
    </div>
  );
}
