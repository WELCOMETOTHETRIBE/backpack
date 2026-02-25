"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FileText, Download } from "lucide-react";

interface ReportCardProps {
  title: string;
  description: string;
  reportType: string;
  data: any;
}

export default function ReportCard({ title, description, reportType, data }: ReportCardProps) {
  const [generating, setGenerating] = useState(false);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/reporting/generate?type=${reportType}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error("Failed to generate report");
      }

      const result = await res.json();
      
      // Open HTML in new window for printing/saving as PDF
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(result.html);
        printWindow.document.close();
        printWindow.focus();
        toast.success("Report generated. Print dialog will open.");
        // Auto-trigger print dialog
        setTimeout(() => {
          printWindow.print();
        }, 250);
      } else {
        toast.error("Please allow pop-ups to view the report.");
      }
    } catch (err) {
      toast.error("Failed to generate report. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#3B82F6]/10">
          <FileText className="h-5 w-5 text-[#3B82F6]" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-[#0F172A]">{title}</h3>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
      </div>
      <button
        onClick={handleGenerate}
        disabled={generating}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        {generating ? "Generating..." : "Generate PDF"}
      </button>
    </div>
  );
}
