"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FinalizeButton({ entryId, registerKey }: { entryId: string; registerKey: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleFinalize = async () => {
    if (!confirm("Approve this entry? Once approved it will be locked, visible to auditors, and count toward compliance coverage.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/evidence-engine/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "final" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? "Failed to finalize");
        setLoading(false);
        return;
      }
      router.refresh();
      router.push(`/dashboard/evidence-engine/registers/${encodeURIComponent(registerKey)}`);
    } catch {
      alert("Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleFinalize}
      disabled={loading}
      className="rounded-[var(--radius-md)] bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
    >
      {loading ? "Approving…" : "Approve entry"}
    </button>
  );
}
