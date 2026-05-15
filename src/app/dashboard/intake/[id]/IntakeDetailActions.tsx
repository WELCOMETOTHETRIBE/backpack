"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IntakeDetailActions({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(label: string, path: string, body: Record<string, unknown>) {
    setBusy(label);
    setError(null);
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? `${label} failed`);
      setBusy(null);
      return;
    }
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
        Workflow Actions
      </h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() =>
            runAction(
              "Provision Scope",
              `/api/intake/${encodeURIComponent(intakeId)}/provision-upload-scope`,
              {
                accessMethod: "ENTRA_B2B",
                accessScope: `intake/${intakeId}`,
              },
            )
          }
          disabled={Boolean(busy)}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-gray-50)] disabled:opacity-60"
        >
          Provision Upload Scope
        </button>
        <button
          onClick={() =>
            runAction(
              "Generate Manifest",
              `/api/intake/${encodeURIComponent(intakeId)}/generate-manifest`,
              {},
            )
          }
          disabled={Boolean(busy)}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-gray-50)] disabled:opacity-60"
        >
          Generate Manifest
        </button>
        <button
          onClick={() =>
            runAction(
              "Generate Evidence Package",
              `/api/intake/${encodeURIComponent(intakeId)}/generate-evidence-package`,
              {},
            )
          }
          disabled={Boolean(busy)}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-gray-50)] disabled:opacity-60"
        >
          Generate Evidence Package
        </button>
        <button
          onClick={() =>
            runAction("Revoke Access", `/api/intake/${encodeURIComponent(intakeId)}/revoke-access`, {})
          }
          disabled={Boolean(busy)}
          className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-gray-50)] disabled:opacity-60"
        >
          Revoke Access
        </button>
        <button
          onClick={() =>
            runAction("Close Intake", `/api/intake/${encodeURIComponent(intakeId)}/close`, {})
          }
          disabled={Boolean(busy)}
          className="rounded bg-[var(--color-blue-accent)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-60"
        >
          Close Intake
        </button>
      </div>
      {busy && <p className="mt-2 text-xs text-[var(--color-gray-600)]">{busy} in progress...</p>}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
