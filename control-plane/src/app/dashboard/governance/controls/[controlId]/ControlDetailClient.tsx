"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

      {nist?.nistExactText && (
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">NIST 800-171</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-gray-700)]">{nist.nistExactText}</p>
        </div>
      )}

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Required artifacts</h3>
        <ul className="mt-2 list-inside list-disc text-sm text-[var(--color-gray-700)]">
          {(metadata?.requiredDocuments ?? []).length > 0 && (
            <li>Documents: {(metadata!.requiredDocuments as string[]).join(", ") || "—"}</li>
          )}
          {(metadata?.requiredRegisters ?? []).length > 0 && (
            <li>Registers: {(metadata!.requiredRegisters as string[]).join(", ") || "—"}</li>
          )}
          {(metadata?.requiredHybridEvidenceTypes ?? []).length > 0 && (
            <li>Evidence types: {(metadata!.requiredHybridEvidenceTypes as string[]).join(", ") || "—"}</li>
          )}
          {(!metadata?.requiredDocuments?.length && !metadata?.requiredRegisters?.length && !metadata?.requiredHybridEvidenceTypes?.length) && (
            <li>None specified</li>
          )}
        </ul>
        <p className="mt-2 text-sm text-[var(--color-gray-500)]">
          Linked: {docLinks.length} document(s), {registerLinks.length} register entry(ies), {evidenceLinks.length} evidence item(s).
        </p>
        <div className="mt-3 flex gap-2">
          <Link
            href="/dashboard/governance/documents"
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            Link document →
          </Link>
          <Link
            href="/dashboard/governance/registers"
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            Link register entry →
          </Link>
          <Link
            href="/dashboard/governance/evidence"
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            Link evidence →
          </Link>
        </div>
      </div>

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
