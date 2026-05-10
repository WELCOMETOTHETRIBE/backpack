"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X, CheckCheck } from "lucide-react";

type Action = "acknowledge" | "dismiss" | "resolve";

/**
 * Three-button adjudication control for a single drift event. Ack
 * and Resolve fire immediately; Dismiss requires a rationale (per
 * spec) and reveals a textarea before confirming.
 */
export function AdjudicateDriftEvent({
  eventId,
  canAdjudicate,
}: {
  eventId: string;
  /** Hide the controls if the viewer doesn't have permission. */
  canAdjudicate: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDismiss, setShowDismiss] = useState(false);
  const [rationale, setRationale] = useState("");

  if (!canAdjudicate) {
    return (
      <p className="text-[11px] text-gray-500">
        Read-only — Admin or Compliance role required to adjudicate.
      </p>
    );
  }

  async function submit(action: Action, payload: Record<string, unknown> = {}) {
    setError(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/ssp/drift-events/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? `HTTP ${res.status}`);
      } else {
        setShowDismiss(false);
        setRationale("");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => submit("acknowledge")}
          className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-[11px] font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Check className="h-3 w-3" />
          {busy === "acknowledge" ? "Acknowledging…" : "Acknowledge"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => setShowDismiss((s) => !s)}
          className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-3 w-3" />
          Dismiss…
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => submit("resolve")}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800 shadow-sm transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckCheck className="h-3 w-3" />
          {busy === "resolve" ? "Resolving…" : "Resolve"}
        </button>
      </div>

      {showDismiss && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5">
          <label className="mb-1 block text-[11px] font-medium text-amber-900">
            Dismissal rationale (required)
          </label>
          <textarea
            rows={2}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="Explain why this drift does not impact the SSP."
            className="w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-[12px] text-gray-900 shadow-sm focus:border-amber-500 focus:outline-none"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={busy !== null || rationale.trim().length === 0}
              onClick={() =>
                submit("dismiss", { rationale: rationale.trim() })
              }
              className="rounded-md bg-amber-700 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-amber-400"
            >
              {busy === "dismiss" ? "Dismissing…" : "Confirm dismiss"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setShowDismiss(false);
                setRationale("");
              }}
              className="text-[11px] text-amber-800 underline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] text-rose-800">
          {error}
        </p>
      )}
    </div>
  );
}
