"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { getSpecForControl } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import {
  ChevronDown,
  FileText,
  MessageSquare,
  BookOpen,
  ListChecks,
  Lightbulb,
  Link2,
  ClipboardList,
  Shield,
  Clock,
  Plus,
  Trash2,
  AlertTriangle,
  ExternalLink,
  Save,
  Eye,
} from "lucide-react";
import { CollapsibleBlock } from "./CollapsibleBlock";
import Link from "next/link";
import {
  parseAssessmentGuideSections,
  cleanDisplayText,
  buildAssessmentGuideSections,
  type GuideSection,
} from "./assessment-guide-sections";
import type { SctmOptimizedControl } from "@/lib/sctm-optimized-types";
import { getHybridCriteriaLabels } from "@/lib/compliance/satisfaction-sources";
import { getEnclaveEntry } from "@/lib/compliance/os-evidence-manifest";
import { getPlatformHelpForControl } from "@/lib/compliance/platform-helps";
import type { ArtifactSpec } from "@/lib/artifact-guide";
import {
  getControlIntelligence,
  dispositionLabel,
  dispositionColorClass,
  LANE_LABELS,
  LANE_COLORS,
  cadenceLabel,
} from "@/data/cmmc/control-intelligence";
import vaultNarratives from "@/data/cmmc/vault-narratives.json";

// ─── Vault narrative lookup ───────────────────────────────────────────────────

const VAULT_NARRATIVES = vaultNarratives as Record<string, string>;

function buildVaultNarrative(controlId: string): string | null {
  const raw = VAULT_NARRATIVES[controlId];
  if (!raw) return null;
  // The JSON stores \\n as literal — convert to real newlines
  return raw.replace(/\\n/g, "\n");
}

// ─── Text helpers ──────────────────────────────────────────────────────────────

function TextWithBold({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining.length > 0) {
    const i = remaining.indexOf("**");
    if (i === -1) { parts.push(<span key={key++}>{remaining}</span>); break; }
    if (i > 0) parts.push(<span key={key++}>{remaining.slice(0, i)}</span>);
    const j = remaining.indexOf("**", i + 2);
    if (j === -1) { parts.push(<span key={key++}>{remaining.slice(i)}</span>); break; }
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

function stripStraySectionPrefix(s: string): string {
  return s.replace(/^\s*\*:\s*/i, "").trim();
}

function FormattedGuideBody({ text, bold = false }: { text: string; bold?: boolean }) {
  const cleaned = stripStraySectionPrefix(text) || text.trim();
  const parts: React.ReactNode[] = [];
  const selectFromRegex = /\[SELECT FROM:\s*([^\]]+)\]/gi;
  let lastEnd = 0;
  let match;
  let key = 0;
  while ((match = selectFromRegex.exec(cleaned)) !== null) {
    if (match.index > lastEnd) {
      const paragraph = cleaned.slice(lastEnd, match.index).trim();
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
  if (lastEnd < cleaned.length) {
    const paragraph = cleaned.slice(lastEnd).trim();
    if (paragraph) {
      parts.push(
        <p key={key++} className="mb-3 text-[15px] leading-[1.65] text-[var(--color-gray-700)] whitespace-pre-wrap last:mb-0">
          {bold ? <TextWithBold text={paragraph} /> : paragraph}
        </p>
      );
    }
  }
  if (parts.length === 0 && cleaned) {
    return (
      <div className="pt-3 text-[15px] leading-[1.65] text-[var(--color-gray-700)] whitespace-pre-wrap">
        {bold ? <TextWithBold text={cleaned} /> : cleaned}
      </div>
    );
  }
  return <div className="pt-3 space-y-0">{parts}</div>;
}

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
  "How this platform helps": Lightbulb,
};

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
      <div className="grid transition-[grid-template-rows] duration-200 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-[var(--color-border)]/50 bg-[var(--color-gray-50)]/30 px-4 pb-4 pt-3">
            <FormattedGuideBody text={section.body} bold />
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Types ─────────────────────────────────────────────────────────────────────

export type SCTMRecord = {
  id: string;
  controlId: string;
  implementationStatus: string;
  governanceNarrative: string | null;
  responsibleRoleId: string | null;
  roleName: string | null;
  artifactCount: number;
  monitoringCadence?: string | null;
  lastValidationDate?: Date | string | null;
  validationMethod?: string | null;
  sprs31311Condition?: string | null;
  hybridSatisfaction?: { technical?: boolean; governance?: boolean } | null;
  evidencePartial?: boolean;
  satisfiedByOs?: boolean;
  satisfiedByCloud?: boolean;
  satisfiedByGovernance?: boolean;
  satisfiedByHybrid?: boolean;
  oftenNotApplicable?: boolean;
  // Dual-evidence lanes
  technicalStatus?: string | null;
  policyDocRequired?: boolean;
  policyStatus?: string | null;
  policyDocNarrative?: string | null;
  policyDocLinkedAt?: string | null;
};

export type NistRow = {
  controlId: string;
  title: string | null;
  nistExactText: string | null;
  nistDiscussionGuidance: string | null;
};

type EvidenceLink = {
  id: string;
  runId: string;
  filePath: string;
  sha256Hash: string;
  description: string | null;
  source: string | null;
  linkedAt: string;
  expiresAt: string | null;
};

type PoamEntry = {
  id: string;
  status: string;
  weaknessDescription: string | null;
  scheduledCompletionDate: string | null;
};

type HistoryEntry = {
  id: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  changedById: string;
};

// ─── Implementation record helpers ────────────────────────────────────────────

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "implemented", label: "Implemented" },
  { value: "assessed", label: "Assessed" },
  { value: "inherited", label: "Inherited" },
  { value: "not_applicable", label: "N/A" },
];

const STATUS_CONSEQUENCE: Record<string, string> = {
  not_started: "No implementation on record — this control contributes to your SPRS deficit.",
  in_progress: "Implementation underway — document progress and set a completion target.",
  implemented: "Fully implemented — ready for assessor verification.",
  assessed: "Formally verified by an independent assessor.",
  inherited: "Inherited from a service provider — document the inheritance in your SSP.",
  not_applicable: "Not applicable to this system — document your rationale in the narrative.",
};

const STATUS_COLORS: Record<string, { base: string; active: string }> = {
  not_started: { base: "border-gray-200 text-gray-600 hover:bg-gray-50", active: "bg-gray-100 border-gray-400 text-gray-800 font-semibold" },
  in_progress: { base: "border-blue-200 text-blue-600 hover:bg-blue-50", active: "bg-blue-100 border-blue-500 text-blue-800 font-semibold" },
  implemented: { base: "border-emerald-200 text-emerald-700 hover:bg-emerald-50", active: "bg-emerald-100 border-emerald-500 text-emerald-800 font-semibold" },
  assessed: { base: "border-violet-200 text-violet-700 hover:bg-violet-50", active: "bg-violet-100 border-violet-500 text-violet-800 font-semibold" },
  inherited: { base: "border-teal-200 text-teal-700 hover:bg-teal-50", active: "bg-teal-100 border-teal-500 text-teal-800 font-semibold" },
  not_applicable: { base: "border-slate-200 text-slate-600 hover:bg-slate-50", active: "bg-slate-100 border-slate-400 text-slate-700 font-semibold" },
};

const VALIDATION_METHODS: { value: string; label: string; description: string }[] = [
  { value: "examine", label: "Examine", description: "Review docs, logs, and configuration" },
  { value: "interview", label: "Interview", description: "Discussions with system personnel" },
  { value: "test", label: "Test", description: "Exercise mechanisms and observe" },
  { value: "combination", label: "Combination", description: "Two or more methods applied" },
];

const HISTORY_FIELD_LABELS: Record<string, string> = {
  governanceNarrative: "Narrative",
  implementationStatus: "Status",
  validationMethod: "Validation method",
  monitoringCadence: "Review cadence",
  hybridSatisfaction: "Hybrid satisfaction",
  responsibleRoleId: "Responsible role",
  lastValidationDate: "Last validation date",
  technicalStatus: "Technical evidence status",
  policyStatus: "Policy document status",
  policyDocNarrative: "Policy document narrative",
  sprs31311Condition: "SPRS 3.13.11 condition",
};

function narrativeStrength(text: string): { label: string; color: string; pct: number } {
  const len = text.trim().length;
  if (len === 0) return { label: "—", color: "bg-gray-200", pct: 0 };
  if (len < 50) return { label: "Weak", color: "bg-red-400", pct: 20 };
  if (len < 150) return { label: "Developing", color: "bg-amber-400", pct: 45 };
  if (len < 400) return { label: "Adequate", color: "bg-blue-400", pct: 70 };
  return { label: "Strong", color: "bg-emerald-400", pct: 100 };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function isExpiringSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
}

function isExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function SCTMControlDetail({
  record,
  nist,
  sctmOptimized,
  orgUploadedLabels = [],
  onSaved,
  userRole,
}: {
  record: SCTMRecord;
  nist: NistRow | undefined;
  sctmOptimized?: SctmOptimizedControl | null;
  orgUploadedLabels?: string[];
  onSaved?: () => void;
  userRole?: string;
}) {
  const isAssessor = userRole === "Assessor";

  // ── Implementation record state ──
  const [narrative, setNarrative] = useState(record.governanceNarrative ?? "");
  const [localStatus, setLocalStatus] = useState(record.implementationStatus);
  const [localValidationMethod, setLocalValidationMethod] = useState(record.validationMethod ?? "");
  const [localCadence, setLocalCadence] = useState(record.monitoringCadence ?? "");
  const [saving, setSaving] = useState(false);

  // ── Hybrid satisfaction state ──
  const [savingHybrid, setSavingHybrid] = useState(false);
  const hybridLabels = record.satisfiedByHybrid ? getHybridCriteriaLabels(record.controlId) : null;
  const enclaveEntry = record.satisfiedByHybrid ? getEnclaveEntry(record.controlId) : undefined;
  const [technicalSatisfied, setTechnicalSatisfied] = useState(
    record.hybridSatisfaction?.technical ?? Boolean(record.evidencePartial)
  );
  const [governanceSatisfied, setGovernanceSatisfied] = useState(
    record.hybridSatisfaction?.governance ?? false
  );

  // ── Policy lane state ──
  const [policyStatus, setPolicyStatus] = useState(record.policyStatus ?? "not_required");
  const [policyNarrative, setPolicyNarrative] = useState(record.policyDocNarrative ?? "");
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    setPolicyStatus(record.policyStatus ?? "not_required");
    setPolicyNarrative(record.policyDocNarrative ?? "");
  }, [record.id, record.policyStatus, record.policyDocNarrative]);

  async function savePolicyLane(newStatus?: string) {
    if (savingPolicy || isAssessor) return;
    setSavingPolicy(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyStatus: newStatus ?? policyStatus,
          policyDocNarrative: policyNarrative || null,
        }),
      });
      if (res.ok) {
        if (newStatus) setPolicyStatus(newStatus);
        refresh();
        loadHistory();
      }
    } finally {
      setSavingPolicy(false);
    }
  }

  // ── Evidence links state ──
  const [evidenceLinks, setEvidenceLinks] = useState<EvidenceLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [linkForm, setLinkForm] = useState({
    runId: "", filePath: "", sha256Hash: "", description: "", source: "", expiresAt: "",
  });
  const [savingLink, setSavingLink] = useState(false);

  // ── POA&M state ──
  const [poamEntry, setPoamEntry] = useState<PoamEntry | null | undefined>(undefined);
  const [creatingPoam, setCreatingPoam] = useState(false);

  // ── History state ──
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const refresh = useCallback(() => onSaved?.(), [onSaved]);

  // ── Sync state on record change ──
  useEffect(() => {
    setNarrative(record.governanceNarrative ?? "");
    setLocalStatus(record.implementationStatus);
    setLocalValidationMethod(record.validationMethod ?? "");
    setLocalCadence(record.monitoringCadence ?? "");
  }, [record.id, record.governanceNarrative, record.implementationStatus, record.validationMethod, record.monitoringCadence]);

  useEffect(() => {
    setTechnicalSatisfied(record.hybridSatisfaction?.technical ?? Boolean(record.evidencePartial));
    setGovernanceSatisfied(record.hybridSatisfaction?.governance ?? false);
  }, [record.hybridSatisfaction, record.evidencePartial]);

  // ── Load dependent data ──
  const loadEvidenceLinks = useCallback(() => {
    setLoadingLinks(true);
    fetch(`/api/evidence-links?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setEvidenceLinks)
      .finally(() => setLoadingLinks(false));
  }, [record.id]);

  const loadPoamEntry = useCallback(() => {
    fetch(`/api/poam/entries?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPoamEntry(data ?? null));
  }, [record.id]);

  const loadHistory = useCallback(() => {
    setLoadingHistory(true);
    fetch(`/api/control-records/${record.id}/history`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setHistory)
      .finally(() => setLoadingHistory(false));
  }, [record.id]);

  useEffect(() => {
    loadEvidenceLinks();
    loadPoamEntry();
    loadHistory();
  }, [record.id, loadEvidenceLinks, loadPoamEntry, loadHistory]);

  // ── Save handlers ──
  async function saveAll() {
    if (saving || isAssessor) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          governanceNarrative: narrative || null,
          implementationStatus: localStatus,
          validationMethod: localValidationMethod || null,
          monitoringCadence: localCadence || null,
        }),
      });
      if (res.ok) {
        refresh();
        loadHistory();
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveHybridSatisfaction(payload: { technical: boolean; governance: boolean }) {
    if (savingHybrid || !record.satisfiedByHybrid || isAssessor) return;
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

  async function saveLinkEvidence() {
    if (savingLink || isAssessor) return;
    if (!linkForm.runId || !linkForm.filePath || !linkForm.sha256Hash) return;
    setSavingLink(true);
    try {
      const res = await fetch("/api/evidence-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          controlRecordId: record.id,
          runId: linkForm.runId,
          filePath: linkForm.filePath,
          sha256Hash: linkForm.sha256Hash,
          description: linkForm.description || null,
          source: linkForm.source || null,
          expiresAt: linkForm.expiresAt || null,
        }),
      });
      if (res.ok) {
        setShowLinkForm(false);
        setLinkForm({ runId: "", filePath: "", sha256Hash: "", description: "", source: "", expiresAt: "" });
        loadEvidenceLinks();
      }
    } finally {
      setSavingLink(false);
    }
  }

  async function deleteLink(linkId: string) {
    if (isAssessor) return;
    const res = await fetch(`/api/evidence-links/${linkId}`, { method: "DELETE" });
    if (res.ok) loadEvidenceLinks();
  }

  async function createPoamEntry() {
    if (creatingPoam || isAssessor) return;
    setCreatingPoam(true);
    try {
      const res = await fetch("/api/poam/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlRecordId: record.id }),
      });
      if (res.ok) loadPoamEntry();
    } finally {
      setCreatingPoam(false);
    }
  }

  // ── Derived data ──
  const familyCode = familyCodeFromControlId(record.controlId);
  const ultimateArtifacts = sctmOptimized?.compliance_meta?.required_artifacts ?? [];
  const hybridArtifacts = (() => {
    if (!record.satisfiedByHybrid) return { technical: [] as string[], governance: [] as string[] };
    const list: { label: string; handling: string }[] = (sctmOptimized?.compliance_meta?.required_artifacts ?? []).map((a) => ({ label: a.name, handling: a.handling }));
    if (list.length === 0) {
      const s = getSpecForControl(record.controlId);
      s?.artifacts?.filter((a) => (a as ArtifactSpec).handling !== "N/A").forEach((a) => {
        const x = a as ArtifactSpec;
        list.push({ label: x.label, handling: x.handling });
      });
    }
    const governance = list.filter((a) => a.handling === "UPLOAD" || a.handling === "REFERENCE" || a.handling === "ATTESTATION").map((a) => a.label);
    const nativeLabels = list.filter((a) => a.handling === "NATIVE").map((a) => a.label);
    const enclaveFiles = enclaveEntry?.evidence_files ?? [];
    return { technical: [...nativeLabels, ...enclaveFiles], governance };
  })();

  const guideSections = parseAssessmentGuideSections(nist?.nistDiscussionGuidance);
  const requirementText = sctmOptimized?.requirement ?? cleanDisplayText(nist?.nistExactText);
  const displayTitle = sctmOptimized?.title ?? (nist?.title ? cleanDisplayText(nist.title) : null);
  const strength = narrativeStrength(narrative);

  const poamWarrantsCreation =
    localStatus === "not_started" || localStatus === "in_progress";

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl w-full px-0 py-0">

      {/* Assessor read-only banner */}
      {isAssessor && (
        <div className="mb-4 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          <Shield className="h-4 w-4 shrink-0 text-amber-500" />
          <span>You are viewing as <strong>Assessor</strong> — all fields are read-only.</span>
        </div>
      )}

      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="font-mono text-sm font-semibold text-[var(--color-navy-primary)]">{record.controlId}</span>
        <StatusBadge status={record.implementationStatus} />
        {/* ── Dual-evidence lane badges ── */}
        {(record.technicalStatus && record.technicalStatus !== "not_started") && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
            record.technicalStatus === "satisfied" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
            record.technicalStatus === "failed" ? "bg-red-50 border-red-200 text-red-700" :
            record.technicalStatus === "not_applicable" ? "bg-slate-50 border-slate-200 text-slate-500" :
            "bg-gray-50 border-gray-200 text-gray-500"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              record.technicalStatus === "satisfied" ? "bg-emerald-500" :
              record.technicalStatus === "failed" ? "bg-red-500" :
              "bg-slate-400"
            }`} />
            Technical: {record.technicalStatus === "satisfied" ? "PASS" : record.technicalStatus === "failed" ? "MISSING" : "N/A"}
          </span>
        )}
        {record.policyDocRequired && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
            policyStatus === "satisfied" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
            (policyStatus === "missing" || policyStatus === "required") ? "bg-amber-50 border-amber-200 text-amber-700" :
            "bg-slate-50 border-slate-200 text-slate-500"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              policyStatus === "satisfied" ? "bg-emerald-500" :
              (policyStatus === "missing" || policyStatus === "required") ? "bg-amber-500" :
              "bg-slate-400"
            }`} />
            Policy: {policyStatus === "satisfied" ? "SATISFIED" : policyStatus === "not_required" ? "N/A" : "MISSING"}
          </span>
        )}
        {/* Combined adjudication banner for dual-evidence controls */}
        {record.policyDocRequired && record.technicalStatus && record.technicalStatus !== "not_started" && (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold border ${
            record.technicalStatus === "satisfied" && policyStatus === "satisfied"
              ? "bg-emerald-100 border-emerald-300 text-emerald-800"
              : record.technicalStatus === "satisfied" && policyStatus !== "satisfied"
              ? "bg-amber-100 border-amber-300 text-amber-800"
              : record.technicalStatus !== "satisfied" && policyStatus === "satisfied"
              ? "bg-amber-100 border-amber-300 text-amber-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {record.technicalStatus === "satisfied" && policyStatus === "satisfied"
              ? "Fully Implemented"
              : record.technicalStatus === "satisfied" && policyStatus !== "satisfied"
              ? "Policy Gap"
              : record.technicalStatus !== "satisfied" && policyStatus === "satisfied"
              ? "Evidence Gap"
              : "Not Implemented"}
          </span>
        )}
        {familyCode && (
          <span className="text-xs font-medium text-[var(--color-gray-500)]">{familyCode}</span>
        )}
        {sctmOptimized?.compliance_meta?.satisfaction_type && (
          <span className="rounded-full bg-[var(--color-blue-accent)]/10 px-2.5 py-0.5 text-xs font-medium text-[var(--color-blue-accent)]">
            {sctmOptimized.compliance_meta.satisfaction_type.replace(/-/g, " ")}
          </span>
        )}
        {record.satisfiedByHybrid ? (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-teal-100 text-teal-800" title="Hybrid (OS + gov docs).">Hybrid</span>
        ) : (
          <>
            {record.satisfiedByOs && <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-700" title="Met by OS configuration (73).">OS</span>}
            {record.satisfiedByCloud && <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-sky-100 text-sky-800" title="Met by cloud (5 inherited + 7 Azure/Entra).">Cloud</span>}
            {record.satisfiedByGovernance && <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-violet-100 text-violet-800" title="Met by governance (18).">Governance</span>}
          </>
        )}
        {record.monitoringCadence && (
          <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium bg-[var(--color-gray-100)] text-[var(--color-gray-600)]">
            <Clock className="h-3 w-3" />{record.monitoringCadence}
          </span>
        )}
        {record.roleName && <span className="text-xs text-[var(--color-gray-400)]">· {record.roleName}</span>}
      </div>

      {/* ── NIST guide sections ── */}
      <div className="mb-4">
        <CollapsibleBlock label="Requirement" defaultOpen={false} icon={BookOpen} contentClassName="bg-white/90">
          <div className="flex items-center gap-2 mb-2">
            {sctmOptimized?.scoring && (
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-medium text-[var(--color-gray-700)] backdrop-blur-sm border border-white/40">
                SPRS {sctmOptimized.scoring.sprs} · {sctmOptimized.scoring.weight}
              </span>
            )}
          </div>
          {displayTitle && <p className="text-base font-medium text-[var(--color-gray-900)] mb-1">{displayTitle}</p>}
          {requirementText ? (
            <p className="text-[15px] leading-[1.7] text-[var(--color-gray-800)] whitespace-pre-wrap max-w-none">{requirementText}</p>
          ) : (
            <p className="text-[15px] text-[var(--color-gray-400)] italic">Requirement text will appear here once loaded.</p>
          )}
        </CollapsibleBlock>
      </div>

      {(sctmOptimized?.objectives?.length ?? 0) > 0 && (
        <div className="mb-4">
          <CollapsibleBlock label="Assessment objectives" defaultOpen={false} icon={ListChecks}>
            <ul className="space-y-2" role="list">
              {(sctmOptimized?.objectives ?? []).map((obj) => (
                <li key={obj.id} className="flex gap-2 text-[15px] leading-relaxed text-[var(--color-gray-800)]">
                  <span className="font-mono text-xs text-[var(--color-gray-500)] shrink-0">{obj.id.split("-").pop()}</span>
                  <span>{obj.text}</span>
                </li>
              ))}
            </ul>
          </CollapsibleBlock>
        </div>
      )}

      {sctmOptimized?.nist_guidance && (
        <div className="mb-4">
          <CollapsibleBlock label="NIST guidance" defaultOpen={false} icon={BookOpen} contentClassName="bg-white/90">
            <div className="text-[15px] leading-[1.7] text-[var(--color-gray-700)] whitespace-pre-wrap [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
              <TextWithBold text={sctmOptimized.nist_guidance} />
            </div>
          </CollapsibleBlock>
        </div>
      )}

      {sctmOptimized?.onboarding_tips && (
        <div className="mb-4">
          <CollapsibleBlock label="Onboarding tips" defaultOpen={false} icon={Lightbulb} contentClassName="bg-gradient-to-b from-amber-50/50 to-white/90">
            <div className="text-[15px] leading-[1.7] text-[var(--color-gray-700)] whitespace-pre-wrap break-words space-y-2 [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
              <TextWithBold text={sctmOptimized.onboarding_tips} />
            </div>
          </CollapsibleBlock>
        </div>
      )}

      {(() => {
        const allSections = buildAssessmentGuideSections(
          record.controlId,
          nist?.nistDiscussionGuidance,
          sctmOptimized,
          getPlatformHelpForControl
        );
        return (
          <div className="mb-4">
            <CollapsibleBlock label="Assessment guide" defaultOpen={false} icon={BookOpen} contentClassName="bg-transparent pt-0">
              <div className="space-y-2">
                {allSections.map((section, i) => (
                  <CollapsibleSection key={`${section.label}-${i}`} section={section} defaultOpen={false} />
                ))}
              </div>
            </CollapsibleBlock>
          </div>
        );
      })()}

      {(!nist?.nistDiscussionGuidance || guideSections.length === 0) && nist?.nistDiscussionGuidance && (
        <div className="mb-4">
          <CollapsibleBlock label="Discussion & guidance" defaultOpen={false} icon={FileText} contentClassName="bg-white/90">
            <div className="text-[15px] leading-[1.7] text-[var(--color-gray-700)] whitespace-pre-wrap [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
              <TextWithBold text={cleanDisplayText(nist.nistDiscussionGuidance)} />
            </div>
          </CollapsibleBlock>
        </div>
      )}

      {record.satisfiedByHybrid && hybridLabels && (
        <div className="mb-4">
          <CollapsibleBlock
            label="Hybrid — satisfaction criteria"
            defaultOpen={false}
            icon={ListChecks}
            className="rounded-xl border-2 border-teal-200 overflow-hidden"
            contentClassName="bg-teal-50/30 border-teal-200/50"
          >
            <p className="text-xs text-teal-700 mb-3">Mark each criterion when satisfied.</p>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={technicalSatisfied}
                    onChange={handleTechnicalToggle}
                    disabled={savingHybrid || isAssessor}
                    className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm font-medium text-teal-900 group-hover:text-teal-800">{hybridLabels.technical}</span>
                  {technicalSatisfied && <span className="text-xs text-teal-600">Satisfied</span>}
                </label>
                <div className="ml-7 text-xs text-teal-800 space-y-0.5">
                  {requirementText && (() => {
                    const firstSentence = requirementText.split(/[.!?]/)[0]?.trim() ?? "";
                    const hasPunct = /[.!?]/.test(requirementText);
                    return (
                      <>
                        <p className="font-medium">Technical requirement:</p>
                        <p className="text-teal-700">{firstSentence}{hasPunct ? "." : ""}</p>
                      </>
                    );
                  })()}
                  {enclaveEntry && enclaveEntry.evidence_files?.length > 0 && (
                    <p className="mt-1"><span className="font-medium">Required config / evidence files:</span> {enclaveEntry.evidence_files.join(", ")}</p>
                  )}
                  {hybridArtifacts.technical.length > 0 && (
                    <p className="mt-1"><span className="font-medium">Required evidence:</span> {hybridArtifacts.technical.join("; ")}</p>
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={governanceSatisfied}
                    onChange={handleGovernanceToggle}
                    disabled={savingHybrid || isAssessor}
                    className="h-4 w-4 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm font-medium text-teal-900 group-hover:text-teal-800">{hybridLabels.governance}</span>
                  {governanceSatisfied && <span className="text-xs text-teal-600">Satisfied</span>}
                </label>
                <div className="ml-7 text-xs text-teal-800 space-y-0.5">
                  {hybridArtifacts.governance.length > 0 ? (
                    <p><span className="font-medium">Required governance docs:</span> {hybridArtifacts.governance.join("; ")}</p>
                  ) : (
                    <p className="text-teal-700">Policy, procedure, or documentation addressing this control.</p>
                  )}
                </div>
              </div>
              {savingHybrid && <p className="text-xs text-teal-600">Saving…</p>}
            </div>
          </CollapsibleBlock>
        </div>
      )}

      {/* ── C3PAO Intelligence Panel ── */}
      {(() => {
        const intel = getControlIntelligence(record.controlId);
        if (!intel) return null;
        return (
          <div className="mb-4">
            <CollapsibleBlock
              label="C3PAO Intelligence"
              defaultOpen={false}
              icon={Eye}
              className="rounded-xl border-2 border-indigo-100 overflow-hidden"
              contentClassName="bg-indigo-50/20"
            >
              <p className="text-xs text-indigo-700/70 mb-4 leading-relaxed">
                What a C3PAO examiner will specifically look for, ask, and test for this control.
                Read this before your assessment.
              </p>

              {/* Disposition + Evidence Lanes row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">
                    Architecture Disposition
                  </p>
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${dispositionColorClass(intel.disposition)}`}>
                    {dispositionLabel(intel.disposition)}
                  </span>
                  {intel.naRationale && (
                    <p className="mt-1.5 text-xs text-[var(--color-gray-600)] leading-relaxed italic">
                      {intel.naRationale}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">
                    Evidence Lanes
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {intel.evidenceLanes.map((lane) => (
                      <span key={lane} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${LANE_COLORS[lane]}`}>
                        {LANE_LABELS[lane]}
                      </span>
                    ))}
                    {intel.evidenceLanes.length === 0 && (
                      <span className="text-xs text-[var(--color-gray-400)] italic">No evidence lanes</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cadence + Register row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">
                    Evidence Cadence
                  </p>
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[var(--color-gray-400)]" />
                    <span className="text-xs font-medium text-[var(--color-gray-800)]">
                      {cadenceLabel(intel.cadenceType)}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--color-gray-500)]">
                    {intel.cadenceType === "continuous" && "Re-verified on every OS Collector run"}
                    {intel.cadenceType === "monthly" && "Evidence must be refreshed monthly"}
                    {intel.cadenceType === "quarterly" && "Evidence must be refreshed quarterly"}
                    {intel.cadenceType === "annual" && "Evidence must be refreshed annually"}
                    {intel.cadenceType === "per_event" && "Evidence required on each change event"}
                    {intel.cadenceType === "one_time" && "One-time documentation required"}
                    {intel.cadenceType === "ongoing" && "Continuously maintained"}
                  </p>
                </div>
                {intel.registerRequired && intel.registerSchemaId && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">
                      Required Register
                    </p>
                    <Link
                      href={`/dashboard/evidence-engine/registers/${intel.registerSchemaId}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      {intel.registerKey}
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    </Link>
                    <p className="mt-1 text-[11px] text-[var(--color-gray-500)]">
                      A C3PAO examiner will request this register.
                    </p>
                  </div>
                )}
              </div>

              {/* C3PAO Examiner Note */}
              {intel.c3paoExaminerNote && (
                <div className="rounded-lg border border-indigo-200 bg-white/70 px-4 py-3 mb-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 mb-1.5">
                    What the examiner will do
                  </p>
                  <p className="text-[13px] leading-relaxed text-[var(--color-gray-800)]">
                    {intel.c3paoExaminerNote}
                  </p>
                </div>
              )}

              {/* ConMon Trigger */}
              {intel.conmonTrigger && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700 mb-1.5">
                    Re-adjudication trigger
                  </p>
                  <p className="text-[13px] leading-relaxed text-[var(--color-gray-800)]">
                    {intel.conmonTrigger}
                  </p>
                </div>
              )}
            </CollapsibleBlock>
          </div>
        );
      })()}

      {/* ── Divider between reference and action sections ── */}
      <div className="my-5 border-t border-[var(--color-border)]/60" />

      {/* ── Section 1: Implementation record ── */}
      <div className="mb-4">
        <CollapsibleBlock label="Implementation record" defaultOpen icon={ClipboardList}>
          <div className="space-y-5">

            {/* Status selector */}
            <div>
              <p className="text-sm font-medium text-[var(--color-gray-700)] mb-2">Implementation status</p>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {STATUS_OPTIONS.map((opt) => {
                  const isSelected = localStatus === opt.value;
                  const colors = STATUS_COLORS[opt.value];
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={isAssessor}
                      onClick={() => setLocalStatus(opt.value)}
                      className={`rounded-lg border px-2 py-2 text-xs text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
                        isSelected ? colors.active : colors.base
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {localStatus && (
                <p className="mt-2 text-xs italic text-[var(--color-gray-500)]">
                  {STATUS_CONSEQUENCE[localStatus]}
                </p>
              )}
            </div>

            {/* Narrative */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <label htmlFor="sctm-narrative" className="text-sm font-medium text-[var(--color-gray-700)]">
                    Implementation narrative
                  </label>
                  {!isAssessor && !narrative.trim() && buildVaultNarrative(record.controlId) && (
                    <button
                      type="button"
                      onClick={() => {
                        const vn = buildVaultNarrative(record.controlId);
                        if (vn) setNarrative(vn);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                    >
                      <Lightbulb className="h-3 w-3" />
                      Load Vault narrative
                    </button>
                  )}
                </div>
                {narrative.trim().length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--color-gray-400)]">{narrative.trim().length} chars</span>
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 w-20 rounded-full bg-[var(--color-gray-100)] overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${strength.color}`} style={{ width: `${strength.pct}%` }} />
                      </div>
                      <span className={`text-xs font-medium ${
                        strength.label === "Strong" ? "text-teal-600" :
                        strength.label === "Adequate" ? "text-blue-600" :
                        strength.label === "Developing" ? "text-amber-600" :
                        "text-red-500"
                      }`}>{strength.label}</span>
                    </div>
                  </div>
                )}
              </div>
              {/* Quick-attest banner for vault-backed controls with no narrative yet */}
              {!isAssessor && !narrative.trim() && buildVaultNarrative(record.controlId) && (
                <div className="mb-2 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2">
                  <Lightbulb className="h-4 w-4 text-indigo-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    MacTech Vault has a pre-written narrative for this control. Click <strong>Load Vault narrative</strong> to pre-populate, then review and save to attest.
                  </p>
                </div>
              )}
              <textarea
                id="sctm-narrative"
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                disabled={isAssessor}
                rows={5}
                className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 disabled:bg-[var(--color-gray-50)] disabled:text-[var(--color-gray-500)] disabled:cursor-not-allowed resize-y"
                placeholder="Describe how this control is satisfied — what is in place, how it is enforced, and how it is verified. Consider policies, technical controls, responsible parties, and ongoing monitoring."
              />
            </div>

            {/* Validation method */}
            <div>
              <p className="text-sm font-medium text-[var(--color-gray-700)] mb-2">Validation method</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {VALIDATION_METHODS.map((m) => {
                  const isSelected = localValidationMethod === m.value;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      disabled={isAssessor}
                      onClick={() => setLocalValidationMethod(isSelected ? "" : m.value)}
                      className={`rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
                        isSelected
                          ? "border-[var(--color-blue-accent)] bg-[var(--color-blue-accent)]/10 text-[var(--color-blue-accent)]"
                          : "border-[var(--color-border)] text-[var(--color-gray-600)] hover:bg-[var(--color-gray-50)]"
                      }`}
                    >
                      <p className="text-xs font-medium">{m.label}</p>
                      <p className="text-[11px] text-[var(--color-gray-400)] mt-0.5 leading-tight">{m.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Review cadence */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[140px]">
                <label htmlFor="sctm-cadence" className="block text-sm font-medium text-[var(--color-gray-700)] mb-1.5">
                  Review cadence
                </label>
                <select
                  id="sctm-cadence"
                  value={localCadence}
                  onChange={(e) => setLocalCadence(e.target.value)}
                  disabled={isAssessor}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-gray-900)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 disabled:bg-[var(--color-gray-50)] disabled:cursor-not-allowed"
                >
                  <option value="">— Not set</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
              {record.lastValidationDate && (
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-medium text-[var(--color-gray-700)] mb-1.5">Last validated</p>
                  <p className="text-sm text-[var(--color-gray-600)] py-2">
                    {formatDate(String(record.lastValidationDate))}
                  </p>
                </div>
              )}
            </div>

            {/* Save button */}
            {!isAssessor && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving…" : "Save implementation"}
                </button>
              </div>
            )}
          </div>
        </CollapsibleBlock>
      </div>

      {/* ── Section 2: Evidence metadata ── */}
      <div className="mb-4">
        <CollapsibleBlock
          label={`Evidence metadata${evidenceLinks.length > 0 ? ` (${evidenceLinks.length})` : ""}`}
          defaultOpen={evidenceLinks.length > 0}
          icon={FileText}
        >
          <div className="space-y-4">
            {/* Metadata-only explanation */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 text-xs text-blue-800 leading-relaxed">
              <strong>Metadata only.</strong> CUI evidence artifacts never leave the enclave. Link evidence by providing the RunId, file path within the enclave, and its SHA-256 hash — no file is transferred to this platform.
            </div>

            {/* Links table */}
            {loadingLinks ? (
              <p className="text-sm text-[var(--color-gray-400)]">Loading…</p>
            ) : evidenceLinks.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] bg-[var(--color-gray-50)]">
                      <th className="px-3 py-2 text-left font-semibold text-[var(--color-gray-600)]">Run ID</th>
                      <th className="px-3 py-2 text-left font-semibold text-[var(--color-gray-600)]">File path</th>
                      <th className="px-3 py-2 text-left font-semibold text-[var(--color-gray-600)]">SHA-256</th>
                      <th className="px-3 py-2 text-left font-semibold text-[var(--color-gray-600)]">Linked</th>
                      <th className="px-3 py-2 text-left font-semibold text-[var(--color-gray-600)]">Expires</th>
                      {!isAssessor && <th className="px-3 py-2" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {evidenceLinks.map((link) => {
                      const expiring = isExpiringSoon(link.expiresAt);
                      const expired = isExpired(link.expiresAt);
                      return (
                        <tr key={link.id} className="bg-white hover:bg-[var(--color-gray-50)]/50">
                          <td className="px-3 py-2 font-mono text-[var(--color-gray-700)] max-w-[120px] truncate" title={link.runId}>{link.runId}</td>
                          <td className="px-3 py-2 font-mono text-[var(--color-gray-700)] max-w-[180px] truncate" title={link.filePath}>{link.filePath}</td>
                          <td className="px-3 py-2 font-mono text-[var(--color-gray-500)] max-w-[100px] truncate" title={link.sha256Hash}>{link.sha256Hash.slice(0, 12)}…</td>
                          <td className="px-3 py-2 text-[var(--color-gray-500)] whitespace-nowrap">{formatDate(link.linkedAt)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {link.expiresAt ? (
                              <span className={`inline-flex items-center gap-1 ${expired ? "text-red-600" : expiring ? "text-amber-600" : "text-[var(--color-gray-500)]"}`}>
                                {(expired || expiring) && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                {formatDate(link.expiresAt)}
                              </span>
                            ) : (
                              <span className="text-[var(--color-gray-400)]">—</span>
                            )}
                          </td>
                          {!isAssessor && (
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => deleteLink(link.id)}
                                className="text-[var(--color-gray-400)] hover:text-red-500 transition-colors"
                                title="Remove link"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-[var(--color-gray-400)]">
                No evidence linked yet. Use <em>Link evidence</em> to record a RunId and file reference from your enclave.
              </p>
            )}

            {/* Link Evidence button / inline form */}
            {!isAssessor && (
              <div>
                {!showLinkForm ? (
                  <button
                    type="button"
                    onClick={() => setShowLinkForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Link evidence
                  </button>
                ) : (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)]/60 p-4 space-y-3">
                    <p className="text-sm font-medium text-[var(--color-gray-800)]">Link enclave evidence</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-gray-600)] mb-1">Run ID <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={linkForm.runId}
                          onChange={(e) => setLinkForm((f) => ({ ...f, runId: e.target.value }))}
                          placeholder="e.g. run-20240115-abc123"
                          className="w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-gray-600)] mb-1">Source</label>
                        <input
                          type="text"
                          value={linkForm.source}
                          onChange={(e) => setLinkForm((f) => ({ ...f, source: e.target.value }))}
                          placeholder="e.g. windows-collector"
                          className="w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]/30"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-gray-600)] mb-1">File path <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={linkForm.filePath}
                        onChange={(e) => setLinkForm((f) => ({ ...f, filePath: e.target.value }))}
                        placeholder="e.g. /evidence/audit-policy.log"
                        className="w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm font-mono focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--color-gray-600)] mb-1">SHA-256 hash <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        value={linkForm.sha256Hash}
                        onChange={(e) => setLinkForm((f) => ({ ...f, sha256Hash: e.target.value }))}
                        placeholder="e.g. a1b2c3d4e5f6…"
                        className="w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm font-mono focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]/30"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-gray-600)] mb-1">Description</label>
                        <input
                          type="text"
                          value={linkForm.description}
                          onChange={(e) => setLinkForm((f) => ({ ...f, description: e.target.value }))}
                          placeholder="Optional note"
                          className="w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[var(--color-gray-600)] mb-1">Expires at</label>
                        <input
                          type="date"
                          value={linkForm.expiresAt}
                          onChange={(e) => setLinkForm((f) => ({ ...f, expiresAt: e.target.value }))}
                          className="w-full rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]/30"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={saveLinkEvidence}
                        disabled={savingLink || !linkForm.runId || !linkForm.filePath || !linkForm.sha256Hash}
                        className="rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
                      >
                        {savingLink ? "Linking…" : "Link evidence"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowLinkForm(false); setLinkForm({ runId: "", filePath: "", sha256Hash: "", description: "", source: "", expiresAt: "" }); }}
                        className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-gray-600)] hover:bg-[var(--color-gray-50)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </CollapsibleBlock>
      </div>

      {/* ── Section 2b: Policy Document (dual-evidence controls only) ── */}
      {record.policyDocRequired && (
        <div className="mb-4">
          <CollapsibleBlock
            label="Policy document"
            defaultOpen={policyStatus === "missing" || policyStatus === "required"}
            icon={FileText}
            className={policyStatus === "satisfied" ? "" : "rounded-xl border-2 border-amber-200 overflow-hidden"}
            contentClassName={policyStatus === "satisfied" ? "" : "bg-amber-50/20"}
          >
            <div className="space-y-4">
              <p className="text-xs text-[var(--color-gray-500)] leading-relaxed">
                This control requires both a <strong>technical evidence</strong> file from your enclave AND a <strong>policy document</strong>
                {" "}on file. Identify which governance document satisfies the policy requirement, then mark it satisfied.
              </p>

              {/* Policy status selector */}
              {!isAssessor && (
                <div>
                  <p className="text-sm font-medium text-[var(--color-gray-700)] mb-2">Policy document status</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { value: "missing", label: "Missing", activeClass: "bg-amber-100 border-amber-500 text-amber-800 font-semibold", baseClass: "border-amber-200 text-amber-600 hover:bg-amber-50" },
                      { value: "satisfied", label: "Satisfied", activeClass: "bg-emerald-100 border-emerald-500 text-emerald-800 font-semibold", baseClass: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPolicyStatus(opt.value)}
                        className={`rounded-lg border px-3 py-1.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] ${
                          policyStatus === opt.value ? opt.activeClass : opt.baseClass
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Narrative textarea */}
              <div>
                <label className="block text-sm font-medium text-[var(--color-gray-700)] mb-1.5">
                  Policy document reference
                </label>
                {isAssessor ? (
                  <p className="text-sm text-[var(--color-gray-700)] leading-relaxed whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)] px-3 py-2.5 min-h-[60px]">
                    {policyNarrative || <span className="italic text-[var(--color-gray-400)]">No policy document recorded.</span>}
                  </p>
                ) : (
                  <textarea
                    value={policyNarrative}
                    onChange={(e) => setPolicyNarrative(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2.5 text-sm text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 resize-y"
                    placeholder="e.g. MAC-SOP-246 v1.0 — Media Sanitization Procedure. Verified via governance manifest GOV-20260411025839-fa9fdb. SHA-256: d411540584ad1e... Controlled copy: /docs/procedures/"
                  />
                )}
              </div>

              {/* Satisfied state — show timestamp + re-evaluate */}
              {policyStatus === "satisfied" && record.policyDocLinkedAt && (
                <p className="text-xs text-emerald-700">
                  Marked satisfied on {formatDate(record.policyDocLinkedAt)}.
                </p>
              )}

              {/* Save button */}
              {!isAssessor && (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => savePolicyLane()}
                    disabled={savingPolicy}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savingPolicy ? "Saving…" : policyStatus === "satisfied" ? "Save & mark satisfied" : "Save"}
                  </button>
                  {policyStatus === "satisfied" && (
                    <button
                      type="button"
                      onClick={() => { setPolicyStatus("missing"); savePolicyLane("missing"); }}
                      disabled={savingPolicy}
                      className="text-xs text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)] underline underline-offset-2"
                    >
                      Re-evaluate
                    </button>
                  )}
                </div>
              )}
            </div>
          </CollapsibleBlock>
        </div>
      )}

      {/* ── Section 3: POA&M integration ── */}
      <div className="mb-4">
        <CollapsibleBlock label="POA&M" defaultOpen={false} icon={Shield}>
          <div className="space-y-4">
            {poamEntry === undefined ? (
              <p className="text-sm text-[var(--color-gray-400)]">Loading…</p>
            ) : poamEntry !== null ? (
              /* Entry exists */
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    poamEntry.status === "closed" ? "bg-emerald-100 text-emerald-700" :
                    poamEntry.status === "risk_accepted" ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {poamEntry.status === "open" ? "Open" : poamEntry.status === "closed" ? "Closed" : "Risk accepted"}
                  </span>
                  {poamEntry.scheduledCompletionDate && (
                    <span className="text-xs text-[var(--color-gray-500)]">
                      Due: {poamEntry.scheduledCompletionDate}
                    </span>
                  )}
                </div>
                {poamEntry.weaknessDescription && (
                  <p className="text-sm text-[var(--color-gray-700)] leading-relaxed">{poamEntry.weaknessDescription}</p>
                )}
                <Link
                  href="/dashboard/poam"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open POA&M dashboard
                </Link>
              </div>
            ) : (
              /* No entry */
              <div className="space-y-3">
                {poamWarrantsCreation && !isAssessor ? (
                  <>
                    <p className="text-sm text-[var(--color-gray-600)]">
                      This control is <strong>{localStatus === "not_started" ? "not started" : "in progress"}</strong> — consider opening a POA&M entry to track remediation.
                    </p>
                    <button
                      type="button"
                      onClick={createPoamEntry}
                      disabled={creatingPoam}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] disabled:opacity-60"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {creatingPoam ? "Creating…" : "Add to POA&M"}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-gray-400)]">
                    No POA&M entry for this control.{" "}
                    {!isAssessor && (
                      <button
                        type="button"
                        onClick={createPoamEntry}
                        disabled={creatingPoam}
                        className="font-medium text-[var(--color-blue-accent)] hover:underline"
                      >
                        Create one
                      </button>
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        </CollapsibleBlock>
      </div>

      {/* ── Section 4: Implementation history ── */}
      <div className="mb-4">
        <CollapsibleBlock
          label={`History${history.length > 0 ? ` (${history.length})` : ""}`}
          defaultOpen={false}
          icon={Clock}
        >
          {loadingHistory ? (
            <p className="text-sm text-[var(--color-gray-400)]">Loading…</p>
          ) : history.length === 0 ? (
            <p className="text-sm text-[var(--color-gray-400)]">No changes recorded yet.</p>
          ) : (
            <ol className="relative border-l border-[var(--color-border)] ml-3 space-y-4">
              {history.map((entry) => {
                const fieldLabel = HISTORY_FIELD_LABELS[entry.fieldName] ?? entry.fieldName;
                return (
                  <li key={entry.id} className="ml-4">
                    <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-[var(--color-border)] bg-white" />
                    <time className="block text-xs text-[var(--color-gray-400)] mb-0.5">{formatDate(entry.createdAt)}</time>
                    <p className="text-sm text-[var(--color-gray-700)]">
                      <span className="font-medium text-[var(--color-gray-800)]">{fieldLabel}</span>
                      {" "}changed
                      {entry.oldValue != null && (
                        <> from <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 text-xs">{entry.oldValue}</code></>
                      )}
                      {entry.newValue != null && (
                        <> to <code className="rounded bg-[var(--color-blue-accent)]/10 px-1 py-0.5 text-xs text-[var(--color-blue-accent)]">{entry.newValue}</code></>
                      )}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </CollapsibleBlock>
      </div>

    </div>
  );
}
