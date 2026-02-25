"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { FileUploadWidget } from "@/components/governance-wizard/FileUploadWidget";
import { getSpecForControl } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";

function familyCodeFromControlId(controlId: string): string {
  const prefix = controlId.split(".").slice(0, 2).join(".");
  const family = CONTROL_FAMILIES.find((f) => f.controlPrefix === prefix);
  return family?.code ?? "—";
}

export type SCTMRecord = {
  id: string;
  controlId: string;
  implementationStatus: string;
  governanceNarrative: string | null;
  responsibleRoleId: string | null;
  roleName: string | null;
  artifactCount: number;
};

export type NistRow = {
  controlId: string;
  title: string | null;
  nistExactText: string | null;
  nistDiscussionGuidance: string | null;
};

const CARD_CLASS =
  "rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm";

export function SCTMControlDetail({
  record,
  nist,
  orgUploadedLabels = [],
  onSaved,
}: {
  record: SCTMRecord;
  nist: NistRow | undefined;
  orgUploadedLabels?: string[];
  onSaved?: () => void;
}) {
  const [narrative, setNarrative] = useState(record.governanceNarrative ?? "");
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [showGuidance, setShowGuidance] = useState(false);
  const [artifacts, setArtifacts] = useState<{ artifactLabel: string }[]>([]);

  const refresh = useCallback(() => {
    onSaved?.();
  }, [onSaved]);

  useEffect(() => {
    setNarrative(record.governanceNarrative ?? "");
  }, [record.governanceNarrative]);

  useEffect(() => {
    fetch(`/api/artifacts?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setArtifacts);
  }, [record.id, record.artifactCount]);

  const spec = getSpecForControl(record.controlId);
  const requiredUpload = spec?.artifacts.filter(
    (a) => a.handling === "UPLOAD" || a.handling === "NATIVE"
  ) ?? [];
  const uploadedSet = new Set(artifacts.map((a) => a.artifactLabel));

  async function saveNarrative() {
    if (savingNarrative) return;
    setSavingNarrative(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ governanceNarrative: narrative || null }),
      });
      if (res.ok) refresh();
    } finally {
      setSavingNarrative(false);
    }
  }

  type StatusValue = "not_started" | "in_progress" | "implemented" | "assessed" | "inherited" | "not_applicable";
  async function setStatus(newStatus: StatusValue) {
    if (savingStatus) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationStatus: newStatus }),
      });
      if (res.ok) refresh();
    } finally {
      setSavingStatus(false);
    }
  }

  const familyCode = familyCodeFromControlId(record.controlId);

  return (
    <div className="space-y-6">
      {/* 1. Summary card */}
      <section className={CARD_CLASS} aria-labelledby="sctm-summary-heading">
        <h2 id="sctm-summary-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
          Summary
        </h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-[var(--color-navy-primary)]">{record.controlId}</span>
          <StatusBadge status={record.implementationStatus} />
          {familyCode && (
            <span className="rounded bg-[var(--color-gray-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-gray-700)]">
              {familyCode}
            </span>
          )}
          {record.roleName && (
            <span className="text-sm text-[var(--color-gray-600)]">Responsible: {record.roleName}</span>
          )}
        </div>
        {nist?.title && (
          <p className="mt-2 text-sm text-[var(--color-gray-700)]">{nist.title}</p>
        )}
      </section>

      {/* 2. NIST card */}
      <section className={CARD_CLASS} aria-labelledby="sctm-nist-heading">
        <h2 id="sctm-nist-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
          NIST requirement
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[var(--color-gray-800)] whitespace-pre-wrap">
          {nist?.nistExactText ?? "—"}
        </p>
        {nist?.nistDiscussionGuidance && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowGuidance((v) => !v)}
              className="flex items-center gap-1 text-sm font-medium text-[var(--color-blue-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 rounded"
            >
              {showGuidance ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {showGuidance ? "Hide" : "Show"} discussion / guidance
            </button>
            {showGuidance && (
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-gray-700)] whitespace-pre-wrap border-t border-[var(--color-border)] pt-3">
                {nist.nistDiscussionGuidance}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 3. Evidence card */}
      <section className={CARD_CLASS} aria-labelledby="sctm-evidence-heading">
        <h2 id="sctm-evidence-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
          Evidence
        </h2>
        {requiredUpload.length > 0 ? (
          <ul className="mt-3 space-y-1.5 text-sm text-[var(--color-gray-700)]">
            {requiredUpload.map((a) => (
              <li key={a.label} className="flex items-center gap-2">
                {uploadedSet.has(a.label) ? (
                  <span className="text-[var(--color-status-green)]" aria-hidden>✓</span>
                ) : (
                  <span className="text-[var(--color-gray-400)]" aria-hidden>○</span>
                )}
                {a.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">No upload artifacts required for this control.</p>
        )}
        {requiredUpload.length > 0 && (
          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium text-[var(--color-gray-600)]">Upload artifact</p>
            <FileUploadWidget
              controlRecordId={record.id}
              artifactLabel={requiredUpload[0]?.label ?? "Document"}
              onUploaded={() => {
                refresh();
                fetch(`/api/artifacts?controlRecordId=${record.id}`)
                  .then((r) => (r.ok ? r.json() : []))
                  .then(setArtifacts);
              }}
            />
          </div>
        )}
      </section>

      {/* 4. Adjudication card */}
      <section className={CARD_CLASS} aria-labelledby="sctm-adj-heading">
        <h2 id="sctm-adj-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
          Adjudication
        </h2>
        <div className="mt-3 space-y-4">
          <div>
            <label htmlFor="sctm-status" className="block text-xs font-medium text-[var(--color-gray-600)]">
              Implementation status
            </label>
            <select
              id="sctm-status"
              value={record.implementationStatus}
              onChange={(e) => setStatus(e.target.value as StatusValue)}
              disabled={savingStatus}
              className="mt-1 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-gray-900)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 disabled:opacity-60"
            >
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="implemented">Implemented</option>
              <option value="assessed">Assessed</option>
              <option value="inherited">Inherited</option>
              <option value="not_applicable">N/A</option>
            </select>
          </div>
          <div>
            <label htmlFor="sctm-narrative" className="block text-xs font-medium text-[var(--color-gray-600)]">
              Governance narrative
            </label>
            <textarea
              id="sctm-narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-gray-900)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20"
              placeholder="Describe how this control is satisfied."
            />
            <button
              type="button"
              onClick={saveNarrative}
              disabled={savingNarrative}
              className="mt-2 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
            >
              {savingNarrative ? "Saving…" : "Save narrative"}
            </button>
          </div>
          <p className="text-sm text-[var(--color-gray-600)]">
            <Link
              href="/dashboard/poam"
              className="font-medium text-[var(--color-blue-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 rounded"
            >
              Open POA&M
            </Link> to manage findings and remediation.
          </p>
        </div>
      </section>
    </div>
  );
}
