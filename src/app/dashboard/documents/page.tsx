"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  GOVERNANCE_18_CONTROL_IDS,
  GOVERNANCE_18_ANALYSIS,
} from "@/lib/compliance/governance-18-analysis";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { GovernanceDocumentUploadModal } from "@/components/adjudication/GovernanceDocumentUploadModal";
import { RecordsManagementWidget } from "@/components/adjudication/RecordsManagementWidget";
import { FileStack, FileText, ClipboardCheck, ChevronRight } from "lucide-react";

type ControlRecord = {
  id: string;
  controlId: string;
  implementationStatus: string;
};

export default function DocumentsPage() {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [governanceModalOpen, setGovernanceModalOpen] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/control-records");
      if (res.ok) {
        const list: ControlRecord[] = await res.json();
        setRecords(list);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const recordByControlId = Object.fromEntries(records.map((r) => [r.controlId, r]));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">Documents</h1>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Upload governance documentation, adjudicate the 18 governance controls, and manage routine logs and records.
        </p>
      </div>

      {/* 1. Governance documents (upload & map) */}
      <section
        className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm"
        aria-labelledby="doc-governance-heading"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="doc-governance-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-navy-primary)]">
              <FileStack className="h-4 w-4" aria-hidden />
              Governance documents
            </h2>
            <p className="mt-1 text-sm text-[var(--color-gray-600)]">
              Upload policies and procedures; map one document to multiple controls.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGovernanceModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
          >
            <FileText className="h-4 w-4" aria-hidden />
            Upload & map documents
          </button>
        </div>
      </section>

      {/* 2. 18 Governance controls */}
      <section
        className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
        aria-labelledby="doc-18-heading"
      >
        <div className="border-b border-[var(--color-border)] px-6 py-4">
          <h2 id="doc-18-heading" className="flex items-center gap-2 text-sm font-semibold text-[var(--color-navy-primary)]">
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            18 Governance controls
          </h2>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Adjudicate by document: each control has its own page with requirements and upload.
          </p>
        </div>
        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center p-8">
            <p className="text-sm text-[var(--color-gray-600)]">Loading…</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border-muted)]">
            {GOVERNANCE_18_CONTROL_IDS.map((controlId) => {
              const analysis = GOVERNANCE_18_ANALYSIS[controlId];
              const record = recordByControlId[controlId];
              const title = analysis?.title ?? controlId;
              return (
                <li key={controlId}>
                  <Link
                    href={`/dashboard/adjudication/governance/${controlId}`}
                    className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-blue-accent)]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-sm font-medium text-[var(--color-gray-800)]">
                        {controlId}
                      </span>
                      <span className="ml-2 text-sm text-[var(--color-gray-600)]">{title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {record ? (
                        <StatusBadge status={record.implementationStatus} />
                      ) : (
                        <span className="rounded bg-[var(--color-gray-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-gray-600)]">
                          —
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-[var(--color-gray-400)]" aria-hidden />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
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

      {governanceModalOpen && (
        <GovernanceDocumentUploadModal
          onClose={() => setGovernanceModalOpen(false)}
          onSaved={() => {
            setGovernanceModalOpen(false);
            fetchRecords();
          }}
        />
      )}
    </div>
  );
}
