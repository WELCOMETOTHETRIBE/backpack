"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, FileSignature } from "lucide-react";

/**
 * "Trigger SSP redraft" — 1-click on a baseline detail page when
 * material drift is open. Calls the existing /api/ssp/generate route
 * with the baseline's boundaryId so the new draft pins to the same
 * scope. The existing generate flow auto-attests and auto-submits to
 * QMS Doc Control; once QMS releases the new version, the inbound
 * manifest creates a new release baseline that automatically
 * supersedes the current one (per the linker's supersession logic).
 *
 * No new "redraft trigger" workflow table needed — sspDocControlSubmissions
 * already models the in-flight submission, and ssp_release_baselines
 * supersession is handled atomically inside the linker.
 */
export function TriggerSspRedraftButton({
  boundaryId,
  materialDriftCount,
}: {
  boundaryId: string;
  materialDriftCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (materialDriftCount === 0) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700"
        >
          <AlertTriangle className="h-4 w-4" />
          Trigger SSP redraft ({materialDriftCount} material)
        </button>
      ) : (
        <div className="rounded-lg border border-rose-300 bg-rose-50 p-3">
          <p className="text-[12px] font-medium text-rose-900">
            Generate a new SSP version?
          </p>
          <p className="mt-1 text-[11px] text-rose-800">
            Pins to the same boundary as this baseline. The new version
            will auto-submit to QMS Doc Control; on release, the new
            baseline supersedes this one.
          </p>
          <div className="mt-2 flex items-center gap-2">
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
                    body: JSON.stringify({ boundaryId }),
                  });
                  const body = (await res.json().catch(() => ({}))) as {
                    error?: string;
                    detail?: string;
                  };
                  if (!res.ok) {
                    setError(
                      body.error
                        ? `${body.error}${body.detail ? ` — ${body.detail}` : ""}`
                        : `HTTP ${res.status}`,
                    );
                  } else {
                    router.push("/dashboard/ssp");
                  }
                } catch (e) {
                  setError(e instanceof Error ? e.message : String(e));
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-rose-700 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:bg-rose-400"
            >
              <FileSignature className="h-3 w-3" />
              {busy ? "Generating…" : "Confirm — generate new SSP"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setConfirming(false)}
              className="text-[11px] text-rose-800 underline"
            >
              Cancel
            </button>
          </div>
          {error && (
            <p className="mt-2 rounded-md border border-rose-300 bg-white px-2 py-1 text-[11px] text-rose-900">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
