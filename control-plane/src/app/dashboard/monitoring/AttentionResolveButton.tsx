"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Single-click button that marks a control_attention_item as resolved.
 * Lives next to each row in the "Open admin actions" card on the
 * Monitoring tab.
 */
export function AttentionResolveButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/control-attention/${itemId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution_note: "Resolved from Monitoring tab" }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? `Server returned ${res.status}`);
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className="rounded border border-current bg-white px-2 py-0.5 text-[11px] font-medium hover:bg-opacity-80 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Resolving…" : "Mark resolved"}
      </button>
      {error && (
        <span className="text-[10px] text-red-700 max-w-[200px] text-right">
          {error}
        </span>
      )}
    </div>
  );
}
