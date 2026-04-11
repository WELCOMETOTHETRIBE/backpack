"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function RecalculateButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ recalculated: number; promoted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/governance/recalculate-status", { method: "POST" });
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
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} aria-hidden />
        {running ? "Recalculating…" : "Recalculate status"}
      </button>
      {result && (
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {result.promoted > 0
            ? `${result.promoted} control${result.promoted > 1 ? "s" : ""} promoted to Implemented`
            : `${result.recalculated} recalculated — no new promotions`}
        </span>
      )}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
