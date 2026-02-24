"use client";

import { useState } from "react";
import { BoundaryDiagramCreator } from "@/components/adjudication/BoundaryDiagramCreator";
import { AdjudicationMatrix } from "@/components/adjudication/AdjudicationMatrix";
import { RecordsManagementWidget } from "@/components/adjudication/RecordsManagementWidget";
import { GovernanceDocumentUploadModal } from "@/components/adjudication/GovernanceDocumentUploadModal";
import Link from "next/link";
import { FileText, ClipboardCheck } from "lucide-react";

export default function AdjudicationPage() {
  const [governanceModalOpen, setGovernanceModalOpen] = useState(false);

  return (
    <div className="min-h-0 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">
          C3PAO Adjudication
        </h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Rapid control adjudication, evidence, and records management.
        </p>
      </div>

      {/* Top row: full-width Boundary Diagram Creator */}
      <BoundaryDiagramCreator />

      {/* Middle row: Adjudication matrix (2/3) + Records Management (1/3) */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AdjudicationMatrix />
        </div>
        <div>
          <RecordsManagementWidget />
        </div>
      </div>

      {/* 18 Governance Controls: per-control pages with analysis */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              18 Governance Controls
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Adjudicate by document: each control has its own page with requirements and upload.
            </p>
          </div>
          <Link
            href="/dashboard/adjudication/governance"
            className="inline-flex items-center gap-2 rounded-lg bg-[#0F172A] px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            <ClipboardCheck className="h-4 w-4" />
            Adjudicate 18 governance controls
          </Link>
        </div>
      </div>

      {/* Governance Document Upload (bulk map one doc to many controls) */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Governance documents (bulk)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Upload policies and procedures; map one document to multiple controls.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGovernanceModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <FileText className="h-4 w-4" />
            Upload & map documents
          </button>
        </div>
      </div>

      {governanceModalOpen && (
        <GovernanceDocumentUploadModal
          onClose={() => setGovernanceModalOpen(false)}
          onSaved={() => setGovernanceModalOpen(false)}
        />
      )}
    </div>
  );
}
