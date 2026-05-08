"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export default function SspDownloadButton({ label = "Download SSP" }: { label?: string }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ssp/document");
      if (!res.ok) throw new Error("Failed to generate SSP");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename = filenameMatch?.[1] ?? "SSP_Document.md";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("SSP download failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      {loading ? "Generating…" : label}
    </button>
  );
}
