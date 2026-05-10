"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Plus, ArrowDown } from "lucide-react";

/**
 * Admin-only "Generate new version" CTA. POSTs to /api/ssp/generate
 * which:
 *   1. Generates the SSP from canonical state
 *   2. Records the single author attestation (provenance only)
 *
 * Does NOT auto-submit to MacTech Quality. The "Submit to Doc Control"
 * button on the version's card below is the explicit handoff to the
 * QMS Reviewer / Approver / Quality Release chain. Two-step flow keeps
 * the QMS handoff defensible (operator consciously says "this version
 * is ready for review") and avoids the flaky auto-submit failure modes
 * that bit us on every transient QMS-side issue.
 */
interface GenerateResponse {
  ok?: boolean;
  sspDocumentId?: string;
  versionNumber?: number;
  payloadSha256?: string;
  controlsCovered?: number;
  controlsMet?: number;
  generatedBy?: {
    userId: string;
    displayName: string;
    email: string | null;
    attestedAt: string;
  } | null;
  authorAttestationError?: string;
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
        {busy ? "Generating…" : "Generate new version"}
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
              {last.generatedBy && (
                <p>
                  Authored by{" "}
                  <span className="font-medium">
                    {last.generatedBy.displayName}
                  </span>
                  {last.generatedBy.email && ` · ${last.generatedBy.email}`}
                </p>
              )}
              <p className="flex items-start gap-1.5 text-emerald-800/80">
                <ArrowDown className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  Click <em>Submit to Doc Control</em> on the version&apos;s
                  card below to send it to the QMS Reviewer / Approver /
                  Quality Release chain.
                </span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
