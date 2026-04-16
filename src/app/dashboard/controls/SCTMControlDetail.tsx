"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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

type DetailTab = "guide" | "policy" | "evidence" | "poam" | "history";

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

function narrativeStrength(text: string): { label: string; color: string; toneClass: string; pct: number } {
  const len = text.trim().length;
  if (len === 0) return { label: "—", color: "bg-gray-200", toneClass: "text-gray-400", pct: 0 };
  if (len < 50) return { label: "Weak", color: "bg-red-400", toneClass: "text-red-500", pct: 20 };
  if (len < 150) return { label: "Developing", color: "bg-amber-400", toneClass: "text-amber-600", pct: 45 };
  if (len < 400) return { label: "Adequate", color: "bg-blue-400", toneClass: "text-blue-600", pct: 70 };
  return { label: "Strong", color: "bg-emerald-400", toneClass: "text-teal-600", pct: 100 };
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

  const [narrative, setNarrative] = useState(record.governanceNarrative ?? "");
  const [localStatus, setLocalStatus] = useState(record.implementationStatus);
  const [localValidationMethod, setLocalValidationMethod] = useState(record.validationMethod ?? "");
  const [localCadence, setLocalCadence] = useState(record.monitoringCadence ?? "");
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<DetailTab>("guide");

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

  const intel = useMemo(() => getControlIntelligence(record.controlId), [record.controlId]);

  // Only needed when the Guide tab is active — walks SCTM + NIST + platform helps.
  const assessmentGuideSections = useMemo(
    () => activeTab === "guide"
      ? buildAssessmentGuideSections(record.controlId, nist?.nistDiscussionGuidance, sctmOptimized, getPlatformHelpForControl)
      : [],
    [activeTab, record.controlId, nist?.nistDiscussionGuidance, sctmOptimized]
  );

  const vaultNarrative = useMemo(() => buildVaultNarrative(record.controlId), [record.controlId]);

  return (
    <div className="w-full">

      {/* Assessor read-only banner */}
      {isAssessor && (
        <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <Shield className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span>You are viewing as <strong>Assessor</strong> — all fields are read-only.</span>
        </div>
      )}

      {/* ── Sticky header: control ID + title + save ── */}
      <div className="sticky top-0 z-20 -mx-5 px-5 py-2.5 mb-4 bg-white/95 backdrop-blur-sm border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-lg font-bold text-[var(--color-navy-primary)]">{record.controlId}</span>
              <StatusBadge status={record.implementationStatus} />
              {record.monitoringCadence && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  <Clock className="h-2.5 w-2.5" />{record.monitoringCadence}
                </span>
              )}
              {record.satisfiedByHybrid ? (
                <span className="inline-flex items-center rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-medium text-teal-800">Hybrid</span>
              ) : (
                <>
                  {record.satisfiedByOs && <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">OS</span>}
                  {record.satisfiedByCloud && <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">Cloud</span>}
                  {record.satisfiedByGovernance && <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-800">Governance</span>}
                </>
              )}
              {sctmOptimized?.scoring && (
                <span className="inline-flex items-center rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                  SPRS {sctmOptimized.scoring.sprs}
                </span>
              )}
            </div>
            {displayTitle && (
              <h1 className="mt-0.5 text-sm font-semibold text-[var(--color-gray-900)] leading-tight">{displayTitle}</h1>
            )}
          </div>
          {!isAssessor && (
            <button
              type="button"
              onClick={saveAll}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving…" : "Save adjudication"}
            </button>
          )}
        </div>
      </div>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">

        <div className="space-y-3 min-w-0">

          {/* Requirement */}
          <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-3.5 w-3.5 text-[var(--color-gray-400)]" />
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)]">Requirement</h3>
            </div>
            {requirementText ? (
              <p className="text-sm leading-relaxed text-[var(--color-gray-800)] whitespace-pre-wrap">{requirementText}</p>
            ) : (
              <p className="text-sm text-[var(--color-gray-400)] italic">Requirement text will appear here once loaded.</p>
            )}
          </section>

          {/* C3PAO Focus */}
          {intel && (intel.c3paoExaminerNote || intel.conmonTrigger) && (
            <section className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
              {intel.c3paoExaminerNote && (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Eye className="h-3.5 w-3.5 text-indigo-500" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">What the examiner will do</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-[var(--color-gray-800)]">{intel.c3paoExaminerNote}</p>
                </>
              )}
              {intel.conmonTrigger && (
                <div className={intel.c3paoExaminerNote ? "mt-3 pt-3 border-t border-indigo-200/60" : ""}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-700">Re-adjudication trigger</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-[var(--color-gray-700)]">{intel.conmonTrigger}</p>
                </div>
              )}
            </section>
          )}

          {/* Metadata grid */}
          {intel && (
            <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Disposition</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${dispositionColorClass(intel.disposition)}`}>
                    {dispositionLabel(intel.disposition)}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Lanes</p>
                  <div className="flex flex-wrap gap-1">
                    {intel.evidenceLanes.map((lane) => (
                      <span key={lane} className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${LANE_COLORS[lane]}`}>
                        {LANE_LABELS[lane]}
                      </span>
                    ))}
                    {intel.evidenceLanes.length === 0 && <span className="text-[10px] text-[var(--color-gray-400)] italic">None</span>}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Cadence</p>
                  <span className="text-xs font-medium text-[var(--color-gray-800)]">{cadenceLabel(intel.cadenceType)}</span>
                </div>
              </div>
              {intel.registerRequired && intel.registerSchemaId && intel.registerKey && (
                <Link
                  href={`/dashboard/evidence-engine/registers/${intel.registerSchemaId}`}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-700 hover:underline"
                >
                  <ClipboardList className="h-3 w-3" />
                  Required register: {intel.registerKey}
                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                </Link>
              )}
              {intel.naRationale && (
                <p className="mt-2 text-xs text-[var(--color-gray-600)] italic leading-relaxed">{intel.naRationale}</p>
              )}
            </section>
          )}

          {/* Dual-evidence status (if applicable) */}
          {(record.policyDocRequired || (record.technicalStatus && record.technicalStatus !== "not_started")) && (
            <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
              <div className="flex items-center gap-2 mb-2">
                <ListChecks className="h-3.5 w-3.5 text-[var(--color-gray-400)]" />
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)]">Dual-evidence status</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {record.technicalStatus && record.technicalStatus !== "not_started" && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
                    record.technicalStatus === "satisfied" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
                    record.technicalStatus === "failed" ? "bg-red-50 border-red-200 text-red-700" :
                    "bg-slate-50 border-slate-200 text-slate-500"
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
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${
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
              </div>
            </section>
          )}
        </div>

        <div className="space-y-3 min-w-0">

          {/* Status selector */}
          <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-2">Implementation status</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {STATUS_OPTIONS.map((opt) => {
                const isSelected = localStatus === opt.value;
                const colors = STATUS_COLORS[opt.value];
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={isAssessor}
                    onClick={() => setLocalStatus(opt.value)}
                    className={`rounded-lg border px-2 py-1.5 text-xs text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] disabled:cursor-not-allowed disabled:opacity-60 ${
                      isSelected ? colors.active : colors.base
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            {localStatus && (
              <p className="mt-2 text-[11px] italic text-[var(--color-gray-500)] leading-relaxed">
                {STATUS_CONSEQUENCE[localStatus]}
              </p>
            )}
          </section>

          {/* Narrative */}
          <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)]">Implementation narrative</h3>
              <div className="flex items-center gap-2">
                {!isAssessor && !narrative.trim() && vaultNarrative && (
                  <button
                    type="button"
                    onClick={() => setNarrative(vaultNarrative)}
                    className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 hover:bg-indigo-100"
                  >
                    <Lightbulb className="h-3 w-3" />
                    Load Vault narrative
                  </button>
                )}
                {narrative.trim().length > 0 && (
                  <span className={`text-[10px] font-medium ${strength.toneClass}`}>
                    {strength.label} · {narrative.trim().length} chars
                  </span>
                )}
              </div>
            </div>
            <textarea
              id="sctm-narrative"
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              disabled={isAssessor}
              rows={10}
              className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-gray-900)] placeholder:text-[var(--color-gray-400)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 disabled:bg-[var(--color-gray-50)] disabled:text-[var(--color-gray-500)] disabled:cursor-not-allowed resize-y font-sans leading-relaxed"
              placeholder="Describe how this control is satisfied — what is in place, how it is enforced, and how it is verified."
            />
          </section>

          {/* Validation + Cadence */}
          <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Validation method</h3>
                <select
                  value={localValidationMethod}
                  onChange={(e) => setLocalValidationMethod(e.target.value)}
                  disabled={isAssessor}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-gray-900)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 disabled:bg-[var(--color-gray-50)] disabled:cursor-not-allowed"
                >
                  <option value="">— Not set</option>
                  {VALIDATION_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Review cadence</h3>
                <select
                  id="sctm-cadence"
                  value={localCadence}
                  onChange={(e) => setLocalCadence(e.target.value)}
                  disabled={isAssessor}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1.5 text-xs text-[var(--color-gray-900)] focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 disabled:bg-[var(--color-gray-50)] disabled:cursor-not-allowed"
                >
                  <option value="">— Not set</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Annual">Annual</option>
                </select>
              </div>
            </div>
            {record.lastValidationDate && (
              <p className="mt-2 text-[10px] text-[var(--color-gray-500)]">Last validated: {formatDate(String(record.lastValidationDate))}</p>
            )}
          </section>
        </div>
      </div>

      {/* ── Tabs: reference material + tracking ── */}
      <div className="border-t border-[var(--color-border)] pt-3">
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] mb-4 -mb-px">
          {([
            { id: "guide", label: "Guide" },
            ...(record.policyDocRequired ? [{ id: "policy" as const, label: "Policy", alert: policyStatus === "missing" || policyStatus === "required" }] : []),
            { id: "evidence", label: `Evidence${evidenceLinks.length > 0 ? ` (${evidenceLinks.length})` : ""}` },
            { id: "poam", label: "POA&M" },
            { id: "history", label: `History${history.length > 0 ? ` (${history.length})` : ""}` },
          ] as { id: typeof activeTab; label: string; alert?: boolean }[]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] ${
                activeTab === tab.id
                  ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "border-transparent text-[var(--color-gray-500)] hover:text-[var(--color-gray-800)] hover:border-[var(--color-gray-300)]"
              }`}
            >
              {tab.label}
              {tab.alert && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />}
            </button>
          ))}
        </div>

        {activeTab === "guide" && (
          <div className="space-y-3">
            {(sctmOptimized?.objectives?.length ?? 0) > 0 && (
              <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-2 flex items-center gap-1.5">
                  <ListChecks className="h-3 w-3" />
                  Assessment objectives
                </h3>
                <ul className="space-y-1.5" role="list">
                  {(sctmOptimized?.objectives ?? []).map((obj) => (
                    <li key={obj.id} className="flex gap-2 text-sm leading-relaxed text-[var(--color-gray-800)]">
                      <span className="font-mono text-xs text-[var(--color-gray-500)] shrink-0 mt-0.5">{obj.id.split("-").pop()}</span>
                      <span>{obj.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {sctmOptimized?.onboarding_tips && (
              <section className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3 w-3" />
                  Onboarding guidance
                </h3>
                <div className="text-sm leading-relaxed text-[var(--color-gray-700)] whitespace-pre-wrap break-words [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
                  <TextWithBold text={sctmOptimized.onboarding_tips} />
                </div>
              </section>
            )}

            {sctmOptimized?.nist_guidance && (
              <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-3 w-3" />
                  NIST guidance
                </h3>
                <div className="text-sm leading-relaxed text-[var(--color-gray-700)] whitespace-pre-wrap [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
                  <TextWithBold text={sctmOptimized.nist_guidance} />
                </div>
              </section>
            )}

            {assessmentGuideSections.length > 0 && (
              <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-2 flex items-center gap-1.5">
                  <BookOpen className="h-3 w-3" />
                  Assessor detail
                </h3>
                <div className="space-y-2">
                  {assessmentGuideSections.map((section, i) => (
                    <CollapsibleSection key={`${section.label}-${i}`} section={section} defaultOpen={false} />
                  ))}
                </div>
              </section>
            )}

            {(!assessmentGuideSections.length && nist?.nistDiscussionGuidance) && (
              <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-2 flex items-center gap-1.5">
                  <FileText className="h-3 w-3" />
                  Discussion
                </h3>
                <div className="text-sm leading-relaxed text-[var(--color-gray-700)] whitespace-pre-wrap">
                  <TextWithBold text={cleanDisplayText(nist.nistDiscussionGuidance)} />
                </div>
              </section>
            )}

            {record.satisfiedByHybrid && hybridLabels && (
              <section className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-teal-700 mb-2 flex items-center gap-1.5">
                  <ListChecks className="h-3 w-3" />
                  Hybrid satisfaction criteria
                </h3>
                <p className="text-xs text-teal-700 mb-3">Mark each criterion when satisfied.</p>
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={technicalSatisfied}
                      onChange={handleTechnicalToggle}
                      disabled={savingHybrid || isAssessor}
                      className="h-4 w-4 mt-0.5 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-teal-900 group-hover:text-teal-800">{hybridLabels.technical}</span>
                      {technicalSatisfied && <span className="ml-2 text-xs text-teal-600">Satisfied</span>}
                      {enclaveEntry && enclaveEntry.evidence_files?.length > 0 && (
                        <p className="mt-0.5 text-xs text-teal-700"><span className="font-medium">Evidence files:</span> {enclaveEntry.evidence_files.join(", ")}</p>
                      )}
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={governanceSatisfied}
                      onChange={handleGovernanceToggle}
                      disabled={savingHybrid || isAssessor}
                      className="h-4 w-4 mt-0.5 rounded border-teal-300 text-teal-600 focus:ring-teal-500"
                    />
                    <div>
                      <span className="text-sm font-medium text-teal-900 group-hover:text-teal-800">{hybridLabels.governance}</span>
                      {governanceSatisfied && <span className="ml-2 text-xs text-teal-600">Satisfied</span>}
                      {hybridArtifacts.governance.length > 0 && (
                        <p className="mt-0.5 text-xs text-teal-700"><span className="font-medium">Required:</span> {hybridArtifacts.governance.join("; ")}</p>
                      )}
                    </div>
                  </label>
                </div>
              </section>
            )}

            {!sctmOptimized?.onboarding_tips && !sctmOptimized?.nist_guidance && !assessmentGuideSections.length && !nist?.nistDiscussionGuidance && (sctmOptimized?.objectives?.length ?? 0) === 0 && (
              <p className="text-sm text-[var(--color-gray-400)] italic py-6 text-center">No assessment guide material available for this control.</p>
            )}
          </div>
        )}

        {activeTab === "policy" && record.policyDocRequired && (
          <section className={`rounded-xl border p-4 ${policyStatus === "satisfied" ? "border-[var(--color-border)] bg-white" : "border-amber-200 bg-amber-50/20"}`}>
            <p className="text-xs text-[var(--color-gray-600)] leading-relaxed mb-3">
              This control requires both a <strong>technical evidence</strong> file from your enclave AND a <strong>policy document</strong> on file.
            </p>
            {!isAssessor && (
              <div className="mb-3">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Policy status</h3>
                <div className="flex gap-2">
                  {[
                    { value: "missing", label: "Missing", activeClass: "bg-amber-100 border-amber-500 text-amber-800 font-semibold", baseClass: "border-amber-200 text-amber-600 hover:bg-amber-50" },
                    { value: "satisfied", label: "Satisfied", activeClass: "bg-emerald-100 border-emerald-500 text-emerald-800 font-semibold", baseClass: "border-emerald-200 text-emerald-700 hover:bg-emerald-50" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPolicyStatus(opt.value)}
                      className={`rounded-lg border px-3 py-1 text-xs transition-colors ${policyStatus === opt.value ? opt.activeClass : opt.baseClass}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)] mb-1.5">Policy document reference</h3>
              {isAssessor ? (
                <p className="text-sm text-[var(--color-gray-700)] leading-relaxed whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)] px-3 py-2 min-h-[60px]">
                  {policyNarrative || <span className="italic text-[var(--color-gray-400)]">No policy document recorded.</span>}
                </p>
              ) : (
                <textarea
                  value={policyNarrative}
                  onChange={(e) => setPolicyNarrative(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 resize-y"
                  placeholder="e.g. MAC-SOP-246 v1.0 — Media Sanitization Procedure. SHA-256: d411540..."
                />
              )}
            </div>
            {policyStatus === "satisfied" && record.policyDocLinkedAt && (
              <p className="mt-2 text-xs text-emerald-700">Marked satisfied on {formatDate(record.policyDocLinkedAt)}.</p>
            )}
            {!isAssessor && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => savePolicyLane()}
                  disabled={savingPolicy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
                >
                  <Save className="h-3 w-3" />
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
          </section>
        )}

        {activeTab === "evidence" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 px-3 py-2 text-xs text-blue-800 leading-relaxed">
              <strong>Metadata only.</strong> CUI evidence artifacts never leave the enclave — link by providing the RunId, file path, and SHA-256.
            </div>
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
                              <button type="button" onClick={() => deleteLink(link.id)} className="text-[var(--color-gray-400)] hover:text-red-500" title="Remove link">
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
              <p className="text-sm text-[var(--color-gray-400)] text-center py-6">No evidence linked yet.</p>
            )}
            {!isAssessor && (
              <div>
                {!showLinkForm ? (
                  <button
                    type="button"
                    onClick={() => setShowLinkForm(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                  >
                    <Plus className="h-3 w-3" />
                    Link evidence
                  </button>
                ) : (
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)]/60 p-3 space-y-2">
                    <p className="text-xs font-medium text-[var(--color-gray-800)]">Link enclave evidence</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input type="text" value={linkForm.runId} onChange={(e) => setLinkForm((f) => ({ ...f, runId: e.target.value }))} placeholder="Run ID *" className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs" />
                      <input type="text" value={linkForm.source} onChange={(e) => setLinkForm((f) => ({ ...f, source: e.target.value }))} placeholder="Source" className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs" />
                    </div>
                    <input type="text" value={linkForm.filePath} onChange={(e) => setLinkForm((f) => ({ ...f, filePath: e.target.value }))} placeholder="File path *" className="w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-mono" />
                    <input type="text" value={linkForm.sha256Hash} onChange={(e) => setLinkForm((f) => ({ ...f, sha256Hash: e.target.value }))} placeholder="SHA-256 hash *" className="w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs font-mono" />
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input type="text" value={linkForm.description} onChange={(e) => setLinkForm((f) => ({ ...f, description: e.target.value }))} placeholder="Description" className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs" />
                      <input type="date" value={linkForm.expiresAt} onChange={(e) => setLinkForm((f) => ({ ...f, expiresAt: e.target.value }))} className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 text-xs" />
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={saveLinkEvidence} disabled={savingLink || !linkForm.runId || !linkForm.filePath || !linkForm.sha256Hash} className="rounded-lg bg-[var(--color-primary)] px-3 py-1 text-xs font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60">
                        {savingLink ? "Linking…" : "Link"}
                      </button>
                      <button type="button" onClick={() => { setShowLinkForm(false); setLinkForm({ runId: "", filePath: "", sha256Hash: "", description: "", source: "", expiresAt: "" }); }} className="text-xs text-[var(--color-gray-500)] hover:text-[var(--color-gray-700)]">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "poam" && (
          <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            {poamEntry === undefined ? (
              <p className="text-sm text-[var(--color-gray-400)]">Loading…</p>
            ) : poamEntry !== null ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    poamEntry.status === "closed" ? "bg-emerald-100 text-emerald-700" :
                    poamEntry.status === "risk_accepted" ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {poamEntry.status === "open" ? "Open" : poamEntry.status === "closed" ? "Closed" : "Risk accepted"}
                  </span>
                  {poamEntry.scheduledCompletionDate && (
                    <span className="text-xs text-[var(--color-gray-500)]">Due: {poamEntry.scheduledCompletionDate}</span>
                  )}
                </div>
                {poamEntry.weaknessDescription && (
                  <p className="text-sm text-[var(--color-gray-700)] leading-relaxed">{poamEntry.weaknessDescription}</p>
                )}
                <Link href="/dashboard/poam" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-blue-accent)] hover:underline">
                  <ExternalLink className="h-3 w-3" />
                  Open POA&M dashboard
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {poamWarrantsCreation && !isAssessor ? (
                  <>
                    <p className="text-sm text-[var(--color-gray-600)]">
                      This control is <strong>{localStatus === "not_started" ? "not started" : "in progress"}</strong> — consider opening a POA&M entry.
                    </p>
                    <button
                      type="button"
                      onClick={createPoamEntry}
                      disabled={creatingPoam}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)] disabled:opacity-60"
                    >
                      <Plus className="h-3 w-3" />
                      {creatingPoam ? "Creating…" : "Add to POA&M"}
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-gray-400)]">
                    No POA&M entry for this control.
                    {!isAssessor && (
                      <>
                        {" "}
                        <button type="button" onClick={createPoamEntry} disabled={creatingPoam} className="font-medium text-[var(--color-blue-accent)] hover:underline">
                          Create one
                        </button>
                      </>
                    )}
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {activeTab === "history" && (
          <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
            {loadingHistory ? (
              <p className="text-sm text-[var(--color-gray-400)]">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-[var(--color-gray-400)] text-center py-4">No changes recorded yet.</p>
            ) : (
              <ol className="relative border-l border-[var(--color-border)] ml-2 space-y-3">
                {history.map((entry) => {
                  const fieldLabel = HISTORY_FIELD_LABELS[entry.fieldName] ?? entry.fieldName;
                  return (
                    <li key={entry.id} className="ml-4">
                      <div className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full border border-[var(--color-border)] bg-white" />
                      <time className="block text-[10px] text-[var(--color-gray-400)] mb-0.5">{formatDate(entry.createdAt)}</time>
                      <p className="text-xs text-[var(--color-gray-700)]">
                        <span className="font-medium text-[var(--color-gray-800)]">{fieldLabel}</span> changed
                        {entry.oldValue != null && (
                          <> from <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 text-[10px]">{entry.oldValue}</code></>
                        )}
                        {entry.newValue != null && (
                          <> to <code className="rounded bg-[var(--color-blue-accent)]/10 px-1 py-0.5 text-[10px] text-[var(--color-blue-accent)]">{entry.newValue}</code></>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}
      </div>

    </div>
  );
}
