"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Manual "Run Drift Check" trigger on a baseline detail page. POSTs
 * to /api/ssp/baselines/:id/detect-drift, then revalidates.
 */
export function RunDriftCheckButton({ baselineId }: { baselineId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    new: number;
    refreshed: number;
    open: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setResult(null);
          setBusy(true);
          try {
            const res = await fetch(
              `/api/ssp/baselines/${baselineId}/detect-drift`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              },
            );
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
              newEventCount?: number;
              refreshedEventCount?: number;
              openEventCount?: number;
            };
            if (!res.ok) {
              setError(body.error ?? `HTTP ${res.status}`);
            } else {
              setResult({
                new: body.newEventCount ?? 0,
                refreshed: body.refreshedEventCount ?? 0,
                open: body.openEventCount ?? 0,
              });
              router.refresh();
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          } finally {
            setBusy(false);
          }
        }}
        className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-sky-400"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Running drift check…" : "Run drift check"}
      </button>
      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
          {error}
        </p>
      )}
      {result && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
          {result.new} new, {result.refreshed} refreshed · {result.open} open
        </p>
      )}
    </div>
  );
}
