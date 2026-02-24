"use client";

import { useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";

export default function GovernanceExportPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/governance/export", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const match = disposition?.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `Governance_Assessor_Package_${new Date().toISOString().slice(0, 10)}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/governance" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Governance
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">Assessor package export</h2>
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          Generate a ZIP package for assessors with manifest, controls, approved documents, registers, and evidence. Admin only.
        </p>
      </div>

      <div className="max-w-xl rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        {error && (
          <p className="mb-4 text-sm text-[var(--color-status-red)]">{error}</p>
        )}
        <button
          type="button"
          onClick={handleExport}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          {loading ? "Generating…" : "Generate assessor package"}
        </button>
        <p className="mt-3 text-sm text-[var(--color-gray-600)]">
          The ZIP includes manifest.json (hashes), controls/*.json, documents/*, registers/*.csv, and evidence files.
        </p>
      </div>
    </div>
  );
}
