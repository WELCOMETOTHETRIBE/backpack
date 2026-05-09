"use client";

/**
 * Admin-only "Rescore all" CTA on the CAE overview. Calls
 * POST /api/cae/rescore which fans out to scoreControlsAffectedBy
 * with no controlIds (rescore every control in the org).
 *
 * Used to backfill aggregate_finding / met_via on snapshots that
 * predate migration 0068, or to refresh after a bulk evidence import.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type RescoreResult = {
  rescored: number;
  metFlipsToNotMet: number;
  notMetFlipsToMet: number;
  draftPoamsCreated: number;
  poamElevatorsRevoked: number;
  errored: number;
};

export function RescoreAllButton({ canRescore }: { canRescore: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<RescoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!canRescore) return null;

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cae/rescore", { method: "POST" });
      const json = (await res.json()) as RescoreResult & {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "rescore failed");
        return;
      }
      setLast(json);
      // Reload the server page to pick up the fresh snapshots.
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "rescore failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || pending}
        className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-navy-primary)] shadow-sm hover:bg-[var(--color-gray-50)] disabled:opacity-60"
      >
        {busy
          ? "Rescoring 110 controls…"
          : pending
            ? "Refreshing…"
            : "Rescore all"}
      </button>
      {last && !error && (
        <p className="text-[10px] text-[var(--color-gray-600)]">
          Rescored {last.rescored} · MET→NOT_MET {last.metFlipsToNotMet} ·
          NOT_MET→MET {last.notMetFlipsToMet} · auto-POA&Ms{" "}
          {last.draftPoamsCreated} · elevators revoked{" "}
          {last.poamElevatorsRevoked}
          {last.errored > 0 ? ` · ${last.errored} errored` : ""}
        </p>
      )}
      {error && (
        <p className="text-[10px] text-red-600">Error: {error}</p>
      )}
    </div>
  );
}
