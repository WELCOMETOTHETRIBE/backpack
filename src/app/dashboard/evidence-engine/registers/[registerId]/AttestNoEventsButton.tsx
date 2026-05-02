"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, X, CheckCircle2 } from "lucide-react";

type Props = {
  registerKey: string;
  registerName: string;
  boundaryId: string;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * "Attest — no events this period" action for event-driven registers.
 *
 * Rendered only on event-driven registers (cadence_days = 0, excluding
 * technical_compliance_run) so the user can capture the dated, signed
 * artifact a C3PAO examines when the register is legitimately empty.
 * Writes a status="final" entry of type "no_events_attestation"; the
 * server immediately recalculates the dependent controls so the
 * dashboard reflects the attestation.
 */
type AttestResult = { recalculated: number; promoted: number };

export function AttestNoEventsButton({ registerKey, registerName, boundaryId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<AttestResult | null>(null);

  // Default period: the previous 90 days ending today — a sane default for
  // a quarterly attestation cadence. User can widen or narrow.
  const defaults = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - 90 * 86_400_000);
    return { start: ymd(start), end: ymd(end) };
  }, []);
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [rationale, setRationale] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  function resetForm() {
    setConfirmed(false);
    setRationale("");
    setErr(null);
    setResult(null);
  }

  async function onSubmit() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/evidence-engine/registers/${encodeURIComponent(registerKey)}/attest-no-events`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            boundary_id: boundaryId,
            period_start: periodStart,
            period_end: periodEnd,
            rationale: rationale.trim() || undefined,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      setResult({
        recalculated: typeof body?.recalculated === "number" ? body.recalculated : 0,
        promoted: typeof body?.promoted === "number" ? body.promoted : 0,
      });
      // Refresh underlying data so the new entry shows in the table once
      // the user dismisses the confirmation.
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 transition"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        Attest — no events this period
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {result ? "Attestation signed" : "Attest — no events this period"}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {registerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {result ? (
              <div className="space-y-4 px-5 py-5">
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600" />
                  <div className="space-y-1 text-sm text-emerald-900 leading-relaxed">
                    <p className="font-semibold">
                      Signed attestation recorded for {registerName}.
                    </p>
                    <p>
                      Period: <strong>{periodStart}</strong> → <strong>{periodEnd}</strong>.
                    </p>
                    <p>
                      Register lane is now passing on cadence.{" "}
                      {result.recalculated > 0
                        ? `Re-evaluated ${result.recalculated} dependent control${result.recalculated === 1 ? "" : "s"}`
                        : "No dependent controls required re-evaluation"}
                      {result.promoted > 0
                        ? ` — ${result.promoted} promoted to Implemented.`
                        : "."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      resetForm();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
            <>
            <div className="space-y-4 px-5 py-4">
              <p className="text-sm text-slate-600 leading-relaxed">
                A C3PAO examiner will ask how you know no events requiring an entry
                occurred in this register. This records a dated, signed
                assertion — retained alongside the register — that an examiner
                can cite during the Examine method.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-medium text-slate-700">
                  Period start
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-slate-700">
                  Period end
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              </div>

              <label className="block text-xs font-medium text-slate-700">
                Supporting rationale <span className="text-slate-400 font-normal">(optional)</span>
                <textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  rows={3}
                  placeholder="e.g. Reviewed ticketing system, SIEM alerts, and HR offboarding records for the period — no qualifying events identified."
                  className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm leading-relaxed"
                />
              </label>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-700 leading-relaxed">
                <strong className="text-slate-900">You are attesting:</strong>{" "}
                that no events requiring an entry in <em>{registerName}</em>{" "}
                occurred within the defined CUI boundary between{" "}
                <strong>{periodStart}</strong> and <strong>{periodEnd}</strong>.
                Records supporting this assertion have been reviewed and are
                retained per your organization's record-retention policy.
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                />
                <span>
                  I confirm I have the authority to make this attestation on
                  behalf of the organization and that the assertion above is
                  accurate to the best of my knowledge.
                </span>
              </label>

              {err && (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {err}
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetForm();
                }}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={!confirmed || busy || !periodStart || !periodEnd}
                className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
              >
                {busy ? "Signing…" : (<><CheckCircle2 className="h-3.5 w-3.5" /> Sign attestation</>)}
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
