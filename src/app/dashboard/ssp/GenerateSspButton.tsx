"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Plus, AlertTriangle } from "lucide-react";

/**
 * Admin-only "Generate new version" CTA. POSTs to /api/ssp/generate
 * which now does three things in one request:
 *   1. Generates the SSP from canonical state
 *   2. Auto-attests with three Codex provenance signoffs
 *   3. Auto-submits to MacTech Quality Doc Control
 *
 * The button surfaces the result of all three so the operator sees
 * exactly what happened in one click instead of having to refresh +
 * scan the version card.
 */
interface GenerateResponse {
  ok?: boolean;
  sspDocumentId?: string;
  versionNumber?: number;
  payloadSha256?: string;
  controlsCovered?: number;
  controlsMet?: number;
  autoAttest?: {
    signoffsCreated: number;
    generatedBy: { displayName: string; email: string };
  } | null;
  docControl?: {
    transmitted: boolean;
    submissionId?: string;
    qmsSubmissionId?: string | null;
    qmsDocumentNumber?: string | null;
    reviewWindowDaysEstimate?: number | null;
    reason?: string | null;
  } | null;
}

export function GenerateSspButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<GenerateResponse | null>(null);

  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setError(null);
          setLast(null);
          setBusy(true);
          try {
            const res = await fetch("/api/ssp/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({}),
            });
            const body = (await res.json().catch(() => ({}))) as GenerateResponse & {
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
              setLast(body);
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
        {busy ? "Generating + submitting…" : "Generate new version"}
      </button>

      {error && (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">
          {error}
        </p>
      )}

      {last && last.ok && (
        <div className="w-full rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">
                Version {last.versionNumber} generated
                {last.payloadSha256 && (
                  <span className="ml-2 font-mono text-[10px] text-emerald-700">
                    sha256:{last.payloadSha256.slice(0, 12)}…
                  </span>
                )}
              </p>
              {last.autoAttest && (
                <p>
                  Provenance: {last.autoAttest.signoffsCreated} system
                  attestation{last.autoAttest.signoffsCreated === 1 ? "" : "s"}{" "}
                  by{" "}
                  <span className="font-medium">
                    {last.autoAttest.generatedBy.displayName}
                  </span>
                </p>
              )}
              {last.docControl?.transmitted ? (
                <p>
                  ✓ Submitted to Doc Control
                  {last.docControl.qmsSubmissionId &&
                    ` · QMS id ${last.docControl.qmsSubmissionId.slice(0, 12)}…`}
                  {last.docControl.qmsDocumentNumber &&
                    ` (${last.docControl.qmsDocumentNumber})`}
                  {last.docControl.reviewWindowDaysEstimate &&
                    ` · review window ~${last.docControl.reviewWindowDaysEstimate}d`}
                </p>
              ) : last.docControl ? (
                <p className="flex items-start gap-1.5 text-amber-900">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    Queued — auto-submit failed: {last.docControl.reason}.
                    Retry from the Doc Control panel on this version&apos;s
                    card below.
                  </span>
                </p>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
