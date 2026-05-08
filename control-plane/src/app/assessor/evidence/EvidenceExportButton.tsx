"use client";

import { Download } from "lucide-react";

export type EvidenceRow = {
  controlId: string;
  controlTitle: string;
  runId: string;
  filePath: string;
  sha256Hash: string;
  source: string;
  linkedAt: string;
  expiresAt: string;
  status: string;
};

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n"))
    return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows: EvidenceRow[]): string {
  const headers = [
    "Control ID",
    "Control Title",
    "Run ID",
    "File Path",
    "SHA-256",
    "Source",
    "Linked At",
    "Expires At",
    "Status",
  ];
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((r) =>
      [
        r.controlId,
        r.controlTitle,
        r.runId,
        r.filePath,
        r.sha256Hash,
        r.source,
        r.linkedAt,
        r.expiresAt,
        r.status,
      ]
        .map(csvEscape)
        .join(",")
    ),
  ];
  return lines.join("\n");
}

export function EvidenceExportButton({ rows }: { rows: EvidenceRow[] }) {
  const handleExport = () => {
    const csv = toCSV(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Evidence_Index_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] transition-colors"
    >
      <Download className="h-4 w-4" aria-hidden />
      Export CSV
    </button>
  );
}
