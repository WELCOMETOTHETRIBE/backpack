"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { FileUploadWidget } from "@/components/governance-wizard/FileUploadWidget";
import { getSpecForControl } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { ChevronDown, ChevronUp, FileText, CheckCircle2, MessageSquare, BookOpen, ListChecks, Lightbulb, Link2 } from "lucide-react";
import Link from "next/link";
import {
  parseAssessmentGuideSections,
  cleanDisplayText,
  type GuideSection,
} from "./assessment-guide-sections";

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

const SECTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "Assessment objectives": ListChecks,
  "Potential assessment methods and objects": FileText,
  "Discussion (NIST SP 800-171 Rev. 2)": BookOpen,
  "Further discussion": MessageSquare,
  "Examples": Lightbulb,
  "Potential assessment considerations": ListChecks,
  "Key references": Link2,
  "Overview": FileText,
  "More": FileText,
};

function CollapsibleSection({
  section,
  defaultOpen = false,
}: {
  section: GuideSection;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = SECTION_ICONS[section.label] ?? FileText;
  return (
    <div className="border border-[var(--color-border)]/80 rounded-2xl bg-white/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-black/[0.02] transition-colors"
      >
        <span className="flex items-center gap-2.5 text-sm font-semibold text-[var(--color-gray-800)] tracking-tight">
          <Icon className="h-4 w-4 text-[var(--color-gray-500)]" />
          {section.label}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-[var(--color-gray-400)] shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-[var(--color-gray-400)] shrink-0" />
        )}
      </button>
      {open && (
        <div className="px-5 pb-5 pt-0">
          <div className="text-[15px] leading-relaxed text-[var(--color-gray-700)] whitespace-pre-wrap border-t border-[var(--color-border)]/80 pt-4">
            {section.body}
          </div>
        </div>
      )}
    </div>
  );
}

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

  const guideSections = parseAssessmentGuideSections(nist?.nistDiscussionGuidance);
  const requirementText = cleanDisplayText(nist?.nistExactText);
  const displayTitle = nist?.title ? cleanDisplayText(nist.title) : null;

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
    <div className="min-h-full bg-[var(--color-surface-muted)]/50">
      {/* Hero: control identity — Apple-style minimal header */}
      <div className="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[var(--color-border)]/60 overflow-hidden mb-6">
        <div className="px-8 py-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-lg font-semibold tracking-tight text-[var(--color-navy-primary)]">
              {record.controlId}
            </span>
            <StatusBadge status={record.implementationStatus} />
            {familyCode && (
              <span className="rounded-full bg-[var(--color-gray-100)] px-3 py-1 text-xs font-medium text-[var(--color-gray-700)] tracking-wide">
                {familyCode}
              </span>
            )}
            {record.roleName && (
              <span className="text-sm text-[var(--color-gray-500)]">Responsible: {record.roleName}</span>
            )}
          </div>
          {displayTitle && (
            <p className="mt-3 text-[17px] leading-snug text-[var(--color-gray-700)] max-w-2xl">
              {displayTitle}
            </p>
          )}
        </div>
      </div>

      {/* Requirement statement — hero copy */}
      {requirementText && (
        <div className="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[var(--color-border)]/60 overflow-hidden mb-6">
          <div className="px-8 py-6">
            <p className="text-[15px] leading-relaxed text-[var(--color-gray-800)] whitespace-pre-wrap">
              {requirementText}
            </p>
          </div>
        </div>
      )}

      {/* Assessment Guide: all sections in collapsible cards */}
      {guideSections.length > 0 && (
        <div className="space-y-3 mb-6">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-gray-500)] px-1">
            Assessment guide
          </h2>
          <div className="space-y-3">
            {guideSections.map((section, i) => (
              <CollapsibleSection
                key={`${section.label}-${i}`}
                section={section}
                defaultOpen={i < 2}
              />
            ))}
          </div>
        </div>
      )}

      {/* Fallback: single discussion block if no sections parsed */}
      {(!nist?.nistDiscussionGuidance || guideSections.length === 0) && nist?.nistDiscussionGuidance && (
        <div className="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[var(--color-border)]/60 overflow-hidden mb-6">
          <div className="px-8 py-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-gray-500)] mb-4">
              Discussion & guidance
            </h2>
            <p className="text-[15px] leading-relaxed text-[var(--color-gray-700)] whitespace-pre-wrap">
              {cleanDisplayText(nist.nistDiscussionGuidance)}
            </p>
          </div>
        </div>
      )}

      {/* Evidence — compact card */}
      <div className="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[var(--color-border)]/60 overflow-hidden mb-6">
        <div className="px-8 py-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-gray-500)] mb-3">
            Evidence
          </h2>
          {requiredUpload.length > 0 ? (
            <>
              <ul className="space-y-2 text-[15px] text-[var(--color-gray-700)]">
                {requiredUpload.map((a) => (
                  <li key={a.label} className="flex items-center gap-2.5">
                    {uploadedSet.has(a.label) ? (
                      <CheckCircle2 className="h-4 w-4 text-[var(--color-status-green)] shrink-0" aria-hidden />
                    ) : (
                      <span className="w-4 h-4 rounded-full border-2 border-[var(--color-gray-300)] shrink-0" aria-hidden />
                    )}
                    {a.label}
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <p className="text-xs font-medium text-[var(--color-gray-600)] mb-2">Upload artifact</p>
                <FileUploadWidget
                  controlRecordId={record.id}
                  artifactLabel={requiredUpload[0]?.label ?? "Document"}
                  onUploaded={() => {
                    refresh();
                    fetch(`/api/artifacts?controlRecordId=${record.id}`)
                      .then((r) => (r.ok ? r.json() : [])
                      .then(setArtifacts);
                  }}
                />
              </div>
            </>
          ) : (
            <p className="text-[15px] text-[var(--color-gray-500)]">No upload artifacts required for this control.</p>
          )}
        </div>
      </div>

      {/* Adjudication — compact card */}
      <div className="rounded-3xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-[var(--color-border)]/60 overflow-hidden mb-6">
        <div className="px-8 py-5">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-[var(--color-gray-500)] mb-4">
            Adjudication
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="sctm-status" className="block text-sm font-medium text-[var(--color-gray-700)] mb-1.5">
                Implementation status
              </label>
              <select
                id="sctm-status"
                value={record.implementationStatus}
                onChange={(e) => setStatus(e.target.value as StatusValue)}
                disabled={savingStatus}
                className="w-full max-w-xs rounded-xl border border-[var(--color-border)] bg-white px-4 py-2.5 text-[15px] text-[var(--color-gray-900)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 disabled:opacity-60"
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
              <label htmlFor="sctm-narrative" className="block text-sm font-medium text-[var(--color-gray-700)] mb-1.5">
                Governance narrative
              </label>
              <textarea
                id="sctm-narrative"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-[var(--color-border)] bg-white px-4 py-3 text-[15px] text-[var(--color-gray-900)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 placeholder:text-[var(--color-gray-400)]"
                placeholder="Describe how this control is satisfied."
              />
              <button
                type="button"
                onClick={saveNarrative}
                disabled={savingNarrative}
                className="mt-2 rounded-xl bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 transition-opacity"
              >
                {savingNarrative ? "Saving…" : "Save narrative"}
              </button>
            </div>
            <p className="text-[15px] text-[var(--color-gray-600)]">
              <Link
                href="/dashboard/poam"
                className="font-medium text-[var(--color-blue-accent)] hover:underline"
              >
                Open POA&M
              </Link> to manage findings and remediation.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
