"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { GOVERNANCE_DOCUMENT_MATRIX } from "@/lib/governance/governance-document-matrix";
import { GovernanceDocumentUploadModal } from "@/components/adjudication/GovernanceDocumentUploadModal";
import { AssignDocumentModal } from "@/components/adjudication/AssignDocumentModal";
import { SmartMapperModal } from "@/components/adjudication/SmartMapperModal";
import { BundleUploadModal } from "@/components/adjudication/BundleUploadModal";
import { RecordsManagementWidget } from "@/components/adjudication/RecordsManagementWidget";
import { FileStack, FileText, ClipboardCheck, ChevronRight, Upload, Link2, Package, CheckCircle2 } from "lucide-react";

export default function DocumentsPage() {
  const [governanceModalOpen, setGovernanceModalOpen] = useState(false);
  const [bundleModalOpen, setBundleModalOpen] = useState(false);
  const [uploadForRow, setUploadForRow] = useState<string | null>(null);
  const [assignForRow, setAssignForRow] = useState<string | null>(null);
  const [smartMapperControlIds, setSmartMapperControlIds] = useState<string[] | null>(null);
  const [assignedLabels, setAssignedLabels] = useState<Set<string>>(new Set());

  const refreshAssignedLabels = useCallback(async () => {
    try {
      const res = await fetch("/api/governance-documents/uploaded-labels");
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setAssignedLabels(new Set((data.uploadedLabels ?? []) as string[]));
      }
    } catch {
      // keep previous set
    }
  }, []);

  useEffect(() => {
    refreshAssignedLabels();
  }, [refreshAssignedLabels]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">Documents</h1>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Governance Documents Matrix: required for Gov Pure, Gov Hybrid, and Tech/Hybrid. Upload and map documents to controls.
        </p>
      </div>

      {/* 1. Governance Documents Matrix (primary) */}
      <section
        className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
        aria-labelledby="doc-matrix-heading"
        aria-describedby="doc-matrix-desc"
      >
        <div className="flex flex-col gap-4 border-b border-[var(--color-border)] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="doc-matrix-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-navy-primary)]">
              <FileStack className="h-4 w-4" aria-hidden />
              Governance Documents Matrix
              <span className="font-normal text-[var(--color-gray-600)]">({GOVERNANCE_DOCUMENT_MATRIX.length} documents)</span>
            </h2>
            <p id="doc-matrix-desc" className="mt-1 text-sm text-[var(--color-gray-600)]">
              Required for Gov Pure (18 governance-only controls), Gov Hybrid, and Tech/Hybrid. Upload and map documents below.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setBundleModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <Package className="h-4 w-4" aria-hidden />
              Upload bundle
            </button>
            <button
              type="button"
              onClick={() => setGovernanceModalOpen(true)}
              className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              <FileText className="h-4 w-4" aria-hidden />
              Upload & map documents
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[min(70vh,32rem)] overflow-y-auto">
          <table
            className="w-full table-fixed min-w-[520px] border-collapse text-left text-sm"
            aria-label="Governance Documents Matrix: required for Gov Pure, Gov Hybrid, Tech/Hybrid"
          >
            <colgroup>
              <col className="w-72 max-w-72" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-20" />
              <col className="w-44" />
            </colgroup>
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="pl-5 pb-3 pr-3 pt-4 font-semibold text-[var(--color-navy-primary)]">
                  Governance Document
                </th>
                <th className="w-20 pb-3 pr-2 pt-4 text-center font-semibold text-[var(--color-gray-700)]" scope="col">
                  Gov Pure
                </th>
                <th className="w-20 pb-3 pr-2 pt-4 text-center font-semibold text-[var(--color-gray-700)]" scope="col">
                  Gov Hybrid
                </th>
                <th className="w-20 pb-3 pr-2 pt-4 text-center font-semibold text-[var(--color-gray-700)]" scope="col">
                  Tech/Hybrid
                </th>
                <th className="w-44 pb-3 pl-2 pr-4 pt-4 font-semibold text-[var(--color-gray-700)]" scope="col">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {GOVERNANCE_DOCUMENT_MATRIX.map((row, i) => (
                <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
                  <td className="max-w-72 py-2.5 pl-5 pr-3 font-medium text-[var(--color-gray-800)]">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <span className="min-w-0 truncate" title={row.document}>{row.document}</span>
                      {assignedLabels.has(row.document) && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700" title="Document uploaded or assigned for this type">
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                          Assigned
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2.5 pr-2 text-center">
                    {row.govPure ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-emerald-100 text-emerald-700" aria-label="Required">✓</span>
                    ) : (
                      <span className="text-[var(--color-gray-400)]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 text-center">
                    {row.govHybrid ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-teal-100 text-teal-700" aria-label="Required">✓</span>
                    ) : (
                      <span className="text-[var(--color-gray-400)]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-2 text-center">
                    {row.techHybrid ? (
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-violet-100 text-violet-700" aria-label="Required">✓</span>
                    ) : (
                      <span className="text-[var(--color-gray-400)]">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pl-2 pr-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setUploadForRow(row.document)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-gray-700)] hover:bg-slate-50"
                        title={`Upload document for ${row.document}`}
                      >
                        <Upload className="h-3.5 w-3.5" aria-hidden />
                        Upload
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignForRow(row.document)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-xs font-medium text-[var(--color-gray-700)] hover:bg-slate-50"
                        title={`Assign from Document Control for ${row.document}`}
                      >
                        <Link2 className="h-3.5 w-3.5" aria-hidden />
                        Assign
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. 18 Governance controls — compact link */}
      <section
        className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
        aria-labelledby="doc-18-heading"
      >
        <h2 id="doc-18-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-navy-primary)]">
          <ClipboardCheck className="h-4 w-4" aria-hidden />
          18 Governance controls
        </h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Adjudicate by control: each control has its own page with requirements and upload.
        </p>
        <Link
          href="/dashboard/adjudication/governance"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-blue-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
        >
          Adjudicate 18 governance controls by control
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>

      {/* 3. Routine logs & records */}
      <section
        className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
        aria-labelledby="doc-records-heading"
      >
        <h2 id="doc-records-heading" className="text-sm font-semibold text-[var(--color-navy-primary)]">
          Routine logs & records
        </h2>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Controls that require periodic manual records, attestations, or training uploads.
        </p>
        <div className="mt-4">
          <RecordsManagementWidget />
        </div>
      </section>

      {(governanceModalOpen || uploadForRow !== null) && (
        <GovernanceDocumentUploadModal
          onClose={() => {
            setGovernanceModalOpen(false);
            setUploadForRow(null);
          }}
          onSaved={(controlIdsMapped?: string[]) => {
            setGovernanceModalOpen(false);
            setUploadForRow(null);
            setSmartMapperControlIds(controlIdsMapped ?? []);
            refreshAssignedLabels();
          }}
          initialArtifactLabel={uploadForRow ?? undefined}
        />
      )}
      {bundleModalOpen && (
        <BundleUploadModal
          onClose={() => setBundleModalOpen(false)}
          onSaved={(controlIdsMapped: string[]) => {
            setBundleModalOpen(false);
            setSmartMapperControlIds(controlIdsMapped ?? []);
            refreshAssignedLabels();
          }}
        />
      )}
      {smartMapperControlIds !== null && (
        <SmartMapperModal
          controlIdsMapped={smartMapperControlIds}
          onClose={() => setSmartMapperControlIds(null)}
        />
      )}
      {assignForRow && (
        <AssignDocumentModal
          artifactLabel={assignForRow}
          onClose={() => setAssignForRow(null)}
          onSaved={() => {
            setAssignForRow(null);
            refreshAssignedLabels();
          }}
        />
      )}
    </div>
  );
}
