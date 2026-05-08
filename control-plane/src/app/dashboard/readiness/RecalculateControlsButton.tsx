"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2 } from "lucide-react";

type Result = { recalculated: number; promoted: number } | { error: string };

/**
 * Button that POSTs to /api/controls/recalculate-all and refreshes the page
 * so the server re-renders with the newly-promoted controls. Intended as the
 * user-facing way to apply register/evidence changes to persisted control
 * statuses (calculateControlStatus is the source of truth for the
 * dashboard's "Controls Implemented" number — running it here is what
 * flips controls that became satisfied by a register entry, a new
 * document upload, or the event-driven-empty register rule).
 */
export function RecalculateControlsButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function onClick() {
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/controls/recalculate-all", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as Result;
      setResult(body);
      if (res.ok) router.refresh();
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Network error" });
    } finally {
      setBusy(false);
    }
  }

  const promoted = result && "promoted" in result ? result.promoted : null;
  const recalculated = result && "recalculated" in result ? result.recalculated : null;
  const errorMsg = result && "error" in result ? result.error : null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-xs font-medium text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:opacity-60 transition"
        title="Re-evaluate every control record against current register entries, artifacts, and evidence — persists any newly-satisfied controls as 'implemented'."
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Recalculating…" : "Recalculate control statuses"}
      </button>
      {promoted !== null && recalculated !== null && (
        <p className="text-[11px] text-slate-600">
          <CheckCircle2 className="inline h-3 w-3 text-emerald-500 mr-1" />
          Recalculated {recalculated} · promoted {promoted} to implemented
        </p>
      )}
      {errorMsg && (
        <p className="text-[11px] text-red-600">{errorMsg}</p>
      )}
    </div>
  );
}
