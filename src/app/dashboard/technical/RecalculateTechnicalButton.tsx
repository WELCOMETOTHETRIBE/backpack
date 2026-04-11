"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function RecalculateTechnicalButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ recalculated: number; promoted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/controls/recalculate-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Server error ${res.status}`);
      } else {
        setResult(data);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={running}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${running ? "animate-spin" : ""}`} aria-hidden />
        {running ? "Recalculating…" : "Recalculate status"}
      </button>
      {result && (
        <span className="text-sm text-[var(--color-gray-600)]">
          {result.promoted > 0
            ? `${result.promoted} control${result.promoted > 1 ? "s" : ""} promoted to Implemented`
            : `${result.recalculated} recalculated — no new promotions`}
        </span>
      )}
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
