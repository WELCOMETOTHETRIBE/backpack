"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { ChevronDown, FileText, BookOpen } from "lucide-react";
import { CollapsibleBlock } from "@/app/dashboard/controls/CollapsibleBlock";
import { cleanDisplayText, parseAssessmentGuideSections, buildAssessmentGuideSections, type GuideSection } from "@/app/dashboard/controls/assessment-guide-sections";
import { getOptimizedByControlId, type SctmOptimizedControl } from "@/lib/sctm-optimized-types";
import { getPlatformHelpForControl } from "@/lib/compliance/platform-helps";

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

type Record = {
  id: string;
  controlId: string;
  cmmcRef: string;
  title: string;
  implementationStatus: string;
  governanceNarrative: string | null;
  roleName: string | null;
};
type Metadata = {
  classification: string;
  controlStatement: string | null;
  requiredDocuments: string[];
  requiredRegisters: string[];
  requiredHybridEvidenceTypes: string[];
} | null;
type Nist = { nistExactText: string | null; nistDiscussionGuidance: string | null } | null;
type LinkItem = { id: string; linkType: string; linkId: string };
type AuditItem = { id: string; action: string; resourceType: string; details: unknown; createdAt: string; userEmail: string | null; userName: string | null };

function GuideSectionBlock({ section, defaultOpen = false }: { section: GuideSection; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-[var(--color-border)]/60 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-[var(--color-blue-accent)]/20 focus-within:ring-offset-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--color-gray-800)] hover:bg-[var(--color-gray-50)]/80 focus:outline-none transition-colors duration-150"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-gray-100)] text-[var(--color-gray-500)]">
            <FileText className="h-4 w-4" />
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
            <div className="whitespace-pre-wrap text-sm text-[var(--color-gray-700)] leading-[1.7] [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
              <TextWithBold text={section.body} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ControlDetailClient({ controlId }: { controlId: string }) {
  const [data, setData] = useState<{
    record: Record;
    metadata: Metadata;
    nist: Nist;
    links: LinkItem[];
    auditTrail: AuditItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [narrative, setNarrative] = useState("");
  const [saving, setSaving] = useState(false);
  const [linkModal, setLinkModal] = useState<"document" | "evidence" | null>(null);
  const [linkOptions, setLinkOptions] = useState<{ id: string; title: string }[]>([]);
  const [linkOptionsLoading, setLinkOptionsLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);
  const [sctmOptimizedList, setSctmOptimizedList] = useState<SctmOptimizedControl[]>([]);

  const sctmOptimized = useMemo(() => {
    if (sctmOptimizedList.length === 0) return null;
    const byId = getOptimizedByControlId(sctmOptimizedList);
    return byId[controlId] ?? null;
  }, [sctmOptimizedList, controlId]);

  const refetch = useCallback(() => {
    fetch(`/api/governance/controls/${encodeURIComponent(controlId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((d) => {
        setData(d);
        setStatus(d.record?.implementationStatus ?? "");
        setNarrative(d.record?.governanceNarrative ?? "");
      })
      .catch((e) => setError(e.message));
  }, [controlId]);

  useEffect(() => {
    fetch(`/api/governance/controls/${encodeURIComponent(controlId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((d) => {
        setData(d);
        setStatus(d.record?.implementationStatus ?? "");
        setNarrative(d.record?.governanceNarrative ?? "");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [controlId]);

  useEffect(() => {
    Promise.all([
      fetch("/CMMC_SCTM_Ultimate_Onboarding_Data.json").catch(() => null),
      fetch("/CMMC_SCTM_UI_Optimized.json").catch(() => null),
    ]).then(([ultimateRes, fallbackRes]) => {
      const promise = ultimateRes?.ok ? ultimateRes.json() : fallbackRes?.ok ? fallbackRes.json() : null;
      if (promise) promise.then((arr: unknown) => Array.isArray(arr) && arr.length > 0 && setSctmOptimizedList(arr));
    });
  }, []);

  const handleSave = () => {
    setSaving(true);
    fetch(`/api/governance/controls/${encodeURIComponent(controlId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        implementationStatus: status,
        governanceNarrative: narrative || null,
      }),
    })
      .then((r) => (r.ok ? Promise.resolve() : r.json().then((e) => Promise.reject(new Error(e?.error ?? "Failed")))))
      .then(() => setSaving(false))
      .catch((e) => {
        setError(e.message);
        setSaving(false);
      });
  };

  const openLinkModal = (type: "document" | "evidence") => {
    setLinkModal(type);
    setLinkError(null);
    setLinkOptions([]);
    setLinkOptionsLoading(true);
    const url = type === "document" ? "/api/governance/documents?limit=100" : "/api/governance/evidence?limit=100";
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load"))))
      .then((res) => setLinkOptions((res.items ?? []).map((i: { id: string; title: string }) => ({ id: i.id, title: i.title || i.id }))))
      .catch(() => setLinkError("Failed to load list"))
      .finally(() => setLinkOptionsLoading(false));
  };

  const handleLinkSubmit = (linkType: "document" | "evidence", linkId: string) => {
    setLinkError(null);
    fetch(`/api/governance/controls/${encodeURIComponent(controlId)}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkType, linkId }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.error) throw new Error(res.error);
        setLinkModal(null);
        refetch();
      })
      .catch((e) => setLinkError(e.message ?? "Failed to link"));
  };

  const handleUnlink = (linkRowId: string) => {
    setUnlinkingId(linkRowId);
    fetch(`/api/governance/controls/${encodeURIComponent(controlId)}/links`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkId: linkRowId }),
    })
      .then((r) => (r.ok ? Promise.resolve() : r.json().then((e) => Promise.reject(new Error(e?.error ?? "Failed")))))
      .then(() => refetch())
      .finally(() => setUnlinkingId(null));
  };

  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-status-red)] bg-[var(--color-surface)] p-4 text-[var(--color-status-red)]">
        {error}
      </div>
    );
  }
  if (loading || !data) {
    return <p className="text-sm text-[var(--color-gray-500)]">Loading…</p>;
  }

  const { record, metadata, nist, links, auditTrail } = data;
  const docLinks = links.filter((l) => l.linkType === "document");
  const registerLinks = links.filter((l) => l.linkType === "register_entry");
  const evidenceLinks = links.filter((l) => l.linkType === "evidence");

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-gray-600)]">Control</h3>
        <p className="mt-1 font-mono font-semibold text-[var(--color-navy-primary)]">{record.cmmcRef}</p>
        <p className="mt-1 text-[var(--color-gray-900)]">{record.title}</p>
        {metadata && (
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">
            Classification: <span className="font-medium">{metadata.classification}</span>
          </p>
        )}
        {metadata?.controlStatement && (
          <p className="mt-2 text-sm text-[var(--color-gray-700)]">{metadata.controlStatement}</p>
        )}
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Status & implementation</h3>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium text-[var(--color-gray-700)]">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
          >
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="implemented">Implemented</option>
            <option value="assessed">Assessed</option>
            <option value="inherited">Inherited</option>
            <option value="not_applicable">Not applicable</option>
          </select>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        <label className="mt-4 block text-sm font-medium text-[var(--color-gray-700)]">Implementation statement / notes</label>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={5}
          className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          placeholder="Governance narrative, implementation statement, or notes (markdown supported in display)"
        />
      </div>

      {(nist?.nistExactText || nist?.nistDiscussionGuidance) && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm space-y-5">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)] flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[var(--color-blue-accent)]" aria-hidden />
            NIST 800-171 &amp; assessment guide
          </h3>
          {nist.nistExactText && (
            <CollapsibleBlock label="Requirement" defaultOpen={false} icon={BookOpen} contentClassName="bg-[var(--color-surface)]">
              <div className="whitespace-pre-wrap text-sm text-[var(--color-gray-700)] leading-[1.7] [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
                <TextWithBold text={cleanDisplayText(nist.nistExactText)} />
              </div>
            </CollapsibleBlock>
          )}
          {nist.nistDiscussionGuidance && (() => {
            const allSections = buildAssessmentGuideSections(
              controlId,
              nist.nistDiscussionGuidance,
              sctmOptimized,
              getPlatformHelpForControl
            );
            const parsedCount = parseAssessmentGuideSections(nist.nistDiscussionGuidance).length;
            return (
              <>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)] mb-2">Assessment guide</h4>
                  <div className="space-y-2">
                    {allSections.map((section, i) => (
                      <GuideSectionBlock key={`${section.label}-${i}`} section={section} defaultOpen={false} />
                    ))}
                  </div>
                </div>
                {parsedCount === 0 && (
                  <CollapsibleBlock label="Discussion &amp; guidance" defaultOpen={false} icon={FileText} contentClassName="bg-[var(--color-surface)]">
                    <div className="whitespace-pre-wrap text-sm text-[var(--color-gray-700)] leading-[1.7] [&_strong]:font-semibold [&_strong]:text-[var(--color-gray-800)]">
                      <TextWithBold text={cleanDisplayText(nist.nistDiscussionGuidance)} />
                    </div>
                  </CollapsibleBlock>
                )}
              </>
            );
          })()}
        </div>
      )}

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Required artifacts</h3>
        {(() => {
          const hasMetaArtifacts =
            (metadata?.requiredDocuments ?? []).length > 0 ||
            (metadata?.requiredRegisters ?? []).length > 0 ||
            (metadata?.requiredHybridEvidenceTypes ?? []).length > 0;
          const sctmArtifacts = sctmOptimized?.compliance_meta?.required_artifacts ?? [];
          const hasSctmArtifacts = sctmArtifacts.length > 0;
          return (
            <>
              {hasMetaArtifacts && metadata && (
                <ul className="mt-2 list-inside list-disc text-sm text-[var(--color-gray-700)]">
                  {(metadata.requiredDocuments ?? []).length > 0 && (
                    <li>Documents: {(metadata.requiredDocuments as string[]).join(", ") || "—"}</li>
                  )}
                  {(metadata.requiredRegisters ?? []).length > 0 && (
                    <li>Registers: {(metadata.requiredRegisters as string[]).join(", ") || "—"}</li>
                  )}
                  {(metadata.requiredHybridEvidenceTypes ?? []).length > 0 && (
                    <li>Evidence types: {(metadata.requiredHybridEvidenceTypes as string[]).join(", ") || "—"}</li>
                  )}
                </ul>
              )}
              {hasSctmArtifacts && (
                <div className="mt-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">
                    {hasMetaArtifacts ? "From assessment guide" : "Expected artifacts (from assessment guide)"}
                  </p>
                  <ul className="mt-1.5 space-y-1 text-sm text-[var(--color-gray-700)]">
                    {sctmArtifacts.map((a, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="font-medium">{a.name}</span>
                        {a.handling && <span className="text-[var(--color-gray-500)]">({a.handling})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!hasMetaArtifacts && !hasSctmArtifacts && (
                <p className="mt-2 text-sm text-[var(--color-gray-500)]">None specified</p>
              )}
            </>
          );
        })()}
        <p className="mt-2 text-sm text-[var(--color-gray-500)]">
          Linked: {docLinks.length} document(s), {registerLinks.length} register entry(ies), {evidenceLinks.length} evidence item(s).
        </p>
        {(docLinks.length > 0 || registerLinks.length > 0 || evidenceLinks.length > 0) && (
          <ul className="mt-2 space-y-1 text-sm">
            {docLinks.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <Link href={`/dashboard/governance/documents/${l.linkId}`} className="font-medium text-[var(--color-blue-accent)] hover:underline">
                  Document
                </Link>
                <button
                  type="button"
                  onClick={() => handleUnlink(l.id)}
                  disabled={unlinkingId === l.id}
                  className="text-[var(--color-gray-500)] hover:text-[var(--color-status-red)] disabled:opacity-50"
                  aria-label="Unlink"
                >
                  Unlink
                </button>
              </li>
            ))}
            {evidenceLinks.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <Link href={`/dashboard/governance/evidence/${l.linkId}`} className="font-medium text-[var(--color-blue-accent)] hover:underline">
                  Evidence
                </Link>
                <button
                  type="button"
                  onClick={() => handleUnlink(l.id)}
                  disabled={unlinkingId === l.id}
                  className="text-[var(--color-gray-500)] hover:text-[var(--color-status-red)] disabled:opacity-50"
                  aria-label="Unlink"
                >
                  Unlink
                </button>
              </li>
            ))}
            {registerLinks.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <Link href="/dashboard/governance/registers" className="font-medium text-[var(--color-blue-accent)] hover:underline">
                  Register entry
                </Link>
                <button
                  type="button"
                  onClick={() => handleUnlink(l.id)}
                  disabled={unlinkingId === l.id}
                  className="text-[var(--color-gray-500)] hover:text-[var(--color-status-red)] disabled:opacity-50"
                  aria-label="Unlink"
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openLinkModal("document")}
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            Link document →
          </button>
          <Link
            href={`/dashboard/governance/registers?linkToControl=${encodeURIComponent(controlId)}`}
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            Link register entry →
          </Link>
          <button
            type="button"
            onClick={() => openLinkModal("evidence")}
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            Link evidence →
          </button>
        </div>
      </div>

      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="link-modal-title">
          <div className="max-h-[80vh] w-full max-w-md rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg">
            <h3 id="link-modal-title" className="text-sm font-semibold text-[var(--color-navy-primary)]">
              Link {linkModal === "document" ? "document" : "evidence"} to this control
            </h3>
            {linkError && <p className="mt-2 text-sm text-[var(--color-status-red)]">{linkError}</p>}
            {linkOptionsLoading ? (
              <p className="mt-3 text-sm text-[var(--color-gray-500)]">Loading…</p>
            ) : linkOptions.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--color-gray-500)]">No {linkModal === "document" ? "documents" : "evidence items"} found. Create one first from the Governance section.</p>
            ) : (
              <ul className="mt-3 max-h-64 overflow-y-auto space-y-1 border border-[var(--color-border)] rounded-[var(--radius-md)] p-2">
                {linkOptions.map((opt) => (
                  <li key={opt.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-[var(--color-gray-900)]" title={opt.title}>{opt.title}</span>
                    <button
                      type="button"
                      onClick={() => handleLinkSubmit(linkModal, opt.id)}
                      className="shrink-0 rounded-[var(--radius-md)] bg-[var(--color-blue-accent)] px-2 py-1 text-xs font-medium text-white hover:opacity-90"
                    >
                      Link
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setLinkModal(null)}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {auditTrail.length > 0 && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Audit trail</h3>
          <ul className="mt-2 space-y-1 text-sm text-[var(--color-gray-600)]">
            {auditTrail.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.userName ?? a.userEmail ?? "System"}</span> — {a.action}{" "}
                <span className="text-[var(--color-gray-500)]">
                  {new Date(a.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
