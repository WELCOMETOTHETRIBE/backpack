"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { FileUploadWidget } from "@/components/governance-wizard/FileUploadWidget";
import { getSpecForControl } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { ChevronDown, FileText, CheckCircle2, MessageSquare, BookOpen, ListChecks, Lightbulb, Link2 } from "lucide-react";
import Link from "next/link";
import {
  parseAssessmentGuideSections,
  cleanDisplayText,
  type GuideSection,
} from "./assessment-guide-sections";
import type { SctmOptimizedControl } from "@/lib/sctm-optimized-types";
import { getHybridCriteriaLabels } from "@/lib/compliance/satisfaction-sources";

function TextWithBold({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const i = remaining.indexOf("**");
    if (i === -1) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }
    if (i > 0) parts.push(<span key={key++}>{remaining.slice(0, i)}</span>);
    const j = remaining.indexOf("**", i + 2);
    if (j === -1) {
      parts.push(<span key={key++}>{remaining.slice(i)}</span>);
      break;
    }
    parts.push(<strong key={key++}>{remaining.slice(i + 2, j)}</strong>);
    remaining = remaining.slice(j + 2);
  }
  return <>{parts}</>;
}

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
  evidencePartial?: boolean;
  satisfiedByOs?: boolean;
  satisfiedByCloud?: boolean;
  satisfiedByGovernance?: boolean;
  satisfiedByHybrid?: boolean;
  oftenNotApplicable?: boolean;
  hybridSatisfaction?: { technical?: boolean; governance?: boolean } | null;
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
  "What assessors do": ListChecks,
  "How the Codex Accelerator Helps": Lightbulb,
};

/** Splits text on "How the Codex Accelerator Helps" so it can be rendered as its own section. */
function extractCodexAcceleratorSection(text: string): { main: string; codex: string } {
  const codexMarker = /\s*\*?\s*\*?How the Codex Accelerator Helps\*?\s*:?\s*/i;
  const idx = text.search(codexMarker);
  if (idx === -1) return { main: text, codex: "" };
  const main = text.slice(0, idx).replace(/\s*$/, "");
  const after = text.slice(idx).replace(codexMarker, "").trim();
  return { main, codex: after };
}

/** Renders guide/JSON body with [SELECT FROM: a; b; c] as a readable list; rest as paragraphs. Use bold to support **bold** in text. */
function FormattedGuideBody({ text, bold = false }: { text: string; bold?: boolean }) {
  const parts: React.ReactNode[] = [];
  const selectFromRegex = /\[SELECT FROM:\s*([^\]]+)\]/gi;
  let lastEnd = 0;
  let match;
  let key = 0;
  while ((match = selectFromRegex.exec(text)) !== null) {
    if (match.index > lastEnd) {
      const paragraph = text.slice(lastEnd, match.index).trim();
      if (paragraph) {
        parts.push(
          <p key={key++} className="mb-3 text-[15px] leading-[1.65] text-[var(--color-gray-700)] whitespace-pre-wrap last:mb-0">
            {bold ? <TextWithBold text={paragraph} /> : paragraph}
          </p>
        );
      }
    }
    const optionsText = match[1].trim();
    const options = optionsText.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
    parts.push(
      <div key={key++} className="my-3 rounded-lg bg-[var(--color-gray-50)]/80 border border-[var(--color-border)]/40 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-2">Select from</p>
        <ul className="list-none space-y-1.5 text-[14px] leading-relaxed text-[var(--color-gray-700)]">
          {options.map((opt, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--color-gray-400)] shrink-0">·</span>
              <span>{opt}</span>
            </li>
          ))}
        </ul>
      </div>
    );
    lastEnd = match.index + match[0].length;
  }
  if (lastEnd < text.length) {
    const paragraph = text.slice(lastEnd).trim();
    if (paragraph) {
      parts.push(
        <p key={key++} className="mb-3 text-[15px] leading-[1.65] text-[var(--color-gray-700)] whitespace-pre-wrap last:mb-0">
          {bold ? <TextWithBold text={paragraph} /> : paragraph}
        </p>
      );
    }
  }
  if (parts.length === 0 && text.trim()) {
    return (
      <div className="pt-3 text-[15px] leading-[1.65] text-[var(--color-gray-700)] whitespace-pre-wrap">
        {bold ? <TextWithBold text={text} /> : text}
      </div>
    );
  }
  return <div className="pt-3 space-y-0">{parts}</div>;
}

function CollapsibleSection({ section, defaultOpen = false }: { section: GuideSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const Icon = SECTION_ICONS[section.label] ?? FileText;
  return (
    <div className="rounded-xl border border-[var(--color-border)]/60 bg-white/90 shadow-sm shadow-black/5 overflow-hidden transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-[var(--color-blue-accent)]/20 focus-within:ring-offset-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--color-gray-800)] hover:bg-[var(--color-gray-50)]/80 focus:outline-none focus-visible:ring-0 transition-colors duration-150"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-gray-100)] text-[var(--color-gray-500)]">
            <Icon className="h-4 w-4" />
          </span>
          {section.label}
        </span>
        <span className="shrink-0 rounded p-1 text-[var(--color-gray-400)] transition-transform duration-200 ease-out" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--color-border)]/50 bg-[var(--color-gray-50)]/30 px-4 pb-4 pt-3">
            <FormattedGuideBody text={section.body} bold />
          </div>
        </div>
      </div>
    </div>
  );
}

function refreshArtifacts(recordId: string, setArtifacts: (a: { artifactLabel: string }[]) => void) {
  fetch(`/api/artifacts?controlRecordId=${recordId}`)
    .then((r) => (r.ok ? r.json() : []))
    .then(setArtifacts);
}

export function SCTMControlDetail({
  record,
  nist,
  sctmOptimized,
  orgUploadedLabels = [],
  onSaved,
}: {
  record: SCTMRecord;
  nist: NistRow | undefined;
  sctmOptimized?: SctmOptimizedControl | null;
  orgUploadedLabels?: string[];
  onSaved?: () => void;
}) {
  const [narrative, setNarrative] = useState(record.governanceNarrative ?? "");
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingHybrid, setSavingHybrid] = useState(false);
  const [artifacts, setArtifacts] = useState<{ artifactLabel: string }[]>([]);

  const hybridLabels = record.satisfiedByHybrid ? getHybridCriteriaLabels(record.controlId) : null;
  const technicalDefault = Boolean(record.evidencePartial);
  const [technicalSatisfied, setTechnicalSatisfied] = useState(
    record.hybridSatisfaction?.technical ?? technicalDefault
  );
  const [governanceSatisfied, setGovernanceSatisfied] = useState(
    record.hybridSatisfaction?.governance ?? false
  );

  const refresh = useCallback(() => {
    onSaved?.();
  }, [onSaved]);

  useEffect(() => {
    setNarrative(record.governanceNarrative ?? "");
  }, [record.governanceNarrative]);

  useEffect(() => {
    const techDefault = Boolean(record.evidencePartial);
    setTechnicalSatisfied(record.hybridSatisfaction?.technical ?? techDefault);
    setGovernanceSatisfied(record.hybridSatisfaction?.governance ?? false);
  }, [record.hybridSatisfaction, record.evidencePartial]);

  useEffect(() => {
    refreshArtifacts(record.id, setArtifacts);
  }, [record.id, record.artifactCount]);

  const spec = getSpecForControl(record.controlId);
  const ultimateArtifacts = sctmOptimized?.compliance_meta?.required_artifacts ?? [];
  const hasUltimateArtifacts = ultimateArtifacts.length > 0;
  const requiredUpload = hasUltimateArtifacts
    ? ultimateArtifacts.filter((a) => a.handling === "UPLOAD" || a.handling === "NATIVE").map((a) => ({ label: a.name, handling: a.handling }))
    : (spec?.artifacts.filter((a) => a.handling === "UPLOAD" || a.handling === "NATIVE") ?? []);
  const allEvidenceArtifacts = hasUltimateArtifacts
    ? ultimateArtifacts.map((a) => ({ label: a.name, handling: a.handling }))
    : (spec?.artifacts ?? []);
  const uploadedSet = new Set(artifacts.map((a) => a.artifactLabel));

  const guideSections = parseAssessmentGuideSections(nist?.nistDiscussionGuidance);
  const requirementText = sctmOptimized?.requirement ?? cleanDisplayText(nist?.nistExactText);
  const displayTitle = sctmOptimized?.title ?? (nist?.title ? cleanDisplayText(nist.title) : null);

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

  async function saveHybridSatisfaction(payload: { technical: boolean; governance: boolean }) {
    if (savingHybrid || !record.satisfiedByHybrid) return;
    setSavingHybrid(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hybridSatisfaction: payload }),
      });
      if (res.ok) refresh();
    } finally {
      setSavingHybrid(false);
    }
  }

  function handleTechnicalToggle() {
    const next = !technicalSatisfied;
    setTechnicalSatisfied(next);
    saveHybridSatisfaction({ technical: next, governance: governanceSatisfied });
  }

  function handleGovernanceToggle() {
    const next = !governanceSatisfied;
    setGovernanceSatisfied(next);
    saveHybridSatisfaction({ technical: technicalSatisfied, governance: next });
  }

  const familyCode = familyCodeFromControlId(record.controlId);

  return (
    <div className="mx-auto max-w-5xl w-full px-0 py-0">
      {/* Compact header: ID and meta (title is under Requirement below) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="font-mono text-sm font-semibold text-[var(--color-navy-primary)]">{record.controlId}</span>
        <StatusBadge status={record.implementationStatus} />
        {familyCode && (
          <span className="text-xs font-medium text-[var(--color-gray-500)]">{familyCode}</span>
        )}
        {sctmOptimized?.compliance_meta?.satisfaction_type && (
          <span className="rounded-full bg-[var(--color-blue-accent)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--color-blue-accent)]">
            {sctmOptimized.compliance_meta.satisfaction_type.replace(/-/g, " ")}
          </span>
        )}
        {record.oftenNotApplicable && (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600" title="Often not applicable.">N/A</span>
        )}
        {record.satisfiedByHybrid ? (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-800" title="Hybrid (OS + gov docs or policy + technical).">Hybrid</span>
        ) : (
          <>
            {record.satisfiedByOs && (
              <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700" title="Met by OS configuration (73).">OS</span>
            )}
            {record.satisfiedByCloud && (
              <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-sky-100 text-sky-800" title="Met by cloud (5 inherited + 7 Azure/Entra).">Cloud</span>
            )}
            {record.satisfiedByGovernance && (
              <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-800" title="Met by governance (18).">Governance</span>
            )}
          </>
        )}
        {record.roleName && <span className="text-xs text-[var(--color-gray-400)]">· {record.roleName}</span>}
      </div>

      {/* Requirement — the main “field we were working on” */}
      <section className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">Requirement</h2>
          {sctmOptimized?.scoring && (
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium text-[var(--color-gray-700)] backdrop-blur-sm border border-white/40">
              SPRS {sctmOptimized.scoring.sprs} · {sctmOptimized.scoring.weight}
            </span>
          )}
        </div>
        {displayTitle && <p className="text-base font-medium text-[var(--color-gray-900)] mb-1">{displayTitle}</p>}
        <div className="rounded-xl border border-[var(--color-border)]/60 bg-white/90 px-4 py-3.5 shadow-sm">
          {requirementText ? (
            <p className="text-[15px] leading-[1.7] text-[var(--color-gray-800)] whitespace-pre-wrap max-w-none">{requirementText}</p>
          ) : (
            <p className="text-[15px] text-[var(--color-gray-400)] italic">Requirement text will appear here once loaded.</p>
          )}
        </div>
      </section>

      {(sctmOptimized?.objectives?.length ?? 0) > 0 && (
        <section className="mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Assessment objectives</h2>
          <div className="rounded-lg border border-white/30 bg-white/70 backdrop-blur-sm px-4 py-3">
            <ul className="space-y-2" role="list">
              {(sctmOptimized?.objectives ?? []).map((obj) => (
                <li key={obj.id} className="flex gap-2 text-[15px] leading-relaxed text-[var(--color-gray-800)]">
                  <span className="font-mono text-xs text-[var(--color-gray-500)] shrink-0">{obj.id.split("-").pop()}</span>
                  <span>{obj.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {sctmOptimized?.nist_guidance && (
        <section className="mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">NIST guidance</h2>
          <div className="rounded-xl border border-[var(--color-border)]/60 bg-white/90 px-4 py-3.5 shadow-sm">
            <div className="text-[15px] leading-[1.7] text-[var(--color-gray-700)] whitespace-pre-wrap [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
              <TextWithBold text={sctmOptimized.nist_guidance} />
            </div>
          </div>
        </section>
      )}

      {sctmOptimized?.onboarding_tips && (
        <section className="mb-4 overflow-visible">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5 flex items-center gap-2">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" aria-hidden />
            Onboarding tips
          </h2>
          <div className="rounded-xl border border-[var(--color-border)]/60 bg-gradient-to-b from-amber-50/50 to-white/90 px-4 py-3.5 shadow-sm overflow-visible">
            <div className="text-[15px] leading-[1.7] text-[var(--color-gray-700)] whitespace-pre-wrap break-words min-h-0 space-y-2 [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
              <TextWithBold text={sctmOptimized.onboarding_tips} />
            </div>
          </div>
        </section>
      )}

      {(() => {
        const hasAssessorContent =
          sctmOptimized?.assessor_interrogation &&
          (sctmOptimized.assessor_interrogation.assessor_questions ||
            sctmOptimized.assessor_interrogation.examine_criteria ||
            sctmOptimized.assessor_interrogation.test_procedures);
        let assessorSectionBody = "";
        let codexSection: GuideSection | null = null;
        if (hasAssessorContent) {
          const testProcedures = sctmOptimized!.assessor_interrogation!.test_procedures ?? "";
          const { main: testMain, codex: codexBody } = extractCodexAcceleratorSection(testProcedures);
          assessorSectionBody = [
            sctmOptimized!.assessor_interrogation!.assessor_questions && `**Interview**\n\n${sctmOptimized!.assessor_interrogation!.assessor_questions}`,
            sctmOptimized!.assessor_interrogation!.examine_criteria && `**Examine**\n\n${sctmOptimized!.assessor_interrogation!.examine_criteria}`,
            testMain && `**Test**\n\n${testMain}`,
          ]
            .filter(Boolean)
            .join("\n\n");
          if (codexBody.trim()) {
            codexSection = { label: "How the Codex Accelerator Helps", body: codexBody.trim() };
          }
        }
        const assessorSection: GuideSection | null =
          assessorSectionBody.trim() ? { label: "What assessors do", body: assessorSectionBody.trim() } : null;
        const allSections: GuideSection[] = [
          ...(assessorSection ? [assessorSection] : []),
          ...(codexSection ? [codexSection] : []),
          ...guideSections,
        ];

        if (allSections.length === 0) return null;
        return (
          <section className="mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-2 flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-[var(--color-blue-accent)]" aria-hidden />
              Assessment guide
            </h2>
            <div className="space-y-2">
              {allSections.map((section, i) => (
                <CollapsibleSection key={`${section.label}-${i}`} section={section} defaultOpen={i < 2} />
              ))}
            </div>
          </section>
        );
      })()}

      {/* Fallback when no sections parsed */}
      {(!nist?.nistDiscussionGuidance || guideSections.length === 0) && nist?.nistDiscussionGuidance && (
        <section className="mb-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Discussion & guidance</h2>
          <div className="rounded-xl border border-[var(--color-border)]/60 bg-white/90 px-4 py-3.5 shadow-sm">
            <div className="text-[15px] leading-[1.7] text-[var(--color-gray-700)] whitespace-pre-wrap [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
              <TextWithBold text={cleanDisplayText(nist.nistDiscussionGuidance)} />
            </div>
          </div>
        </section>
      )}

      {/* Hybrid satisfaction criteria — when control is Hybrid */}
      {record.satisfiedByHybrid && hybridLabels && (
        <section className="mb-4 rounded-xl border-2 border-teal-200 bg-teal-50/50 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-teal-200/80 bg-teal-100/50">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-teal-800">Hybrid — satisfaction criteria</h2>
            <p className="text-xs text-teal-700 mt-0.5">Mark each criterion when satisfied (editable).</p>
          </div>
          <div className="px-4 py-3 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={technicalSatisfied}
                onChange={handleTechnicalToggle}
                disabled={savingHybrid}
                className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-teal-900 group-hover:text-teal-800">{hybridLabels.technical}</span>
              {technicalSatisfied && <span className="text-xs text-teal-600">Satisfied</span>}
            </label>
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={governanceSatisfied}
                onChange={handleGovernanceToggle}
                disabled={savingHybrid}
                className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
              />
              <span className="text-sm font-medium text-teal-900 group-hover:text-teal-800">{hybridLabels.governance}</span>
              {governanceSatisfied && <span className="text-xs text-teal-600">Satisfied</span>}
            </label>
            {savingHybrid && <p className="text-xs text-teal-600">Saving…</p>}
          </div>
        </section>
      )}

      {/* Your response — one card: status, narrative, evidence */}
      <section className="rounded-lg border border-white/30 bg-white/70 backdrop-blur-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-white/30">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">Your response</h2>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div>
            <label htmlFor="sctm-status" className="block text-sm font-medium text-[var(--color-gray-700)] mb-1.5">Implementation status</label>
            <select
              id="sctm-status"
              value={record.implementationStatus}
              onChange={(e) => setStatus(e.target.value as StatusValue)}
              disabled={savingStatus}
              className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-gray-900)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20"
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
            <label htmlFor="sctm-narrative" className="block text-sm font-medium text-[var(--color-gray-700)] mb-1.5">Governance narrative</label>
            <textarea
              id="sctm-narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20"
              placeholder="Describe how this control is satisfied."
            />
            <button
              type="button"
              onClick={saveNarrative}
              disabled={savingNarrative}
              className="mt-2 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
            >
              {savingNarrative ? "Saving…" : "Save narrative"}
            </button>
          </div>

          {(allEvidenceArtifacts.length > 0 || requiredUpload.length > 0) && (
            <div>
              <p className="text-sm font-medium text-[var(--color-gray-700)] mb-2">Evidence</p>
              <ul className="space-y-3">
                {(allEvidenceArtifacts.length > 0 ? allEvidenceArtifacts : requiredUpload).map((a) => {
                  const needsUpload = (a.handling === "UPLOAD" || a.handling === "NATIVE") && !uploadedSet.has(a.label);
                  return (
                    <li key={a.label} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                      <div className="flex items-center gap-2 min-w-0">
                        {uploadedSet.has(a.label) ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-status-green)]" aria-hidden />
                        ) : (
                          <span className="w-4 h-4 shrink-0 rounded-full border-2 border-[var(--color-gray-300)]" aria-hidden />
                        )}
                        <span className="text-sm text-[var(--color-gray-800)]">{a.label}</span>
                        {a.handling && a.handling !== "UPLOAD" && a.handling !== "NATIVE" && (
                          <span className="text-xs text-[var(--color-gray-500)]">({a.handling})</span>
                        )}
                      </div>
                      {needsUpload && (
                        <FileUploadWidget
                          compact
                          controlRecordId={record.id}
                          artifactLabel={a.label}
                          onUploaded={() => {
                            refresh();
                            refreshArtifacts(record.id, setArtifacts);
                          }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <p className="text-sm text-[var(--color-gray-500)]">
            <Link href="/dashboard/poam" className="font-medium text-[var(--color-blue-accent)] hover:underline">
              Open POA&M
            </Link>{" "}
            to manage findings and remediation.
          </p>
        </div>
      </section>
    </div>
  );
}
