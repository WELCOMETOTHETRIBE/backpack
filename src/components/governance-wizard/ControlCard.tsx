"use client";

import { useState, useEffect } from "react";
import type { ControlRecord, NistControl, Role } from "./GovernanceWizard";
import { FileUploadWidget } from "./FileUploadWidget";
import { StatusBadge } from "./StatusBadge";

type EvidenceRequirements = {
  governance: { label: string; handling: string }[];
  technical: { id: string; title: string; description: string; type: string; inherited?: boolean; inheritedFrom?: string }[];
  sprsValue: number | null;
  satisfactionType: string | null;
};

type TechEvidenceRow = { id: string; requirementId: string | null; description: string | null; fileUrl: string | null; sourceUrl: string | null };

export function ControlCard({
  record,
  nist,
  roles,
  onRefresh,
}: {
  record: ControlRecord;
  nist: NistControl | undefined;
  roles: Role[];
  onRefresh: () => void;
}) {
  const [requirements, setRequirements] = useState<EvidenceRequirements | null>(null);
  const [techEvidence, setTechEvidence] = useState<TechEvidenceRow[]>([]);
  const [uploadedLabels, setUploadedLabels] = useState<Set<string>>(new Set());
  const [narrative, setNarrative] = useState(record.governanceNarrative ?? "");
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [responsibleRoleId, setResponsibleRoleId] = useState(record.responsibleRoleId ?? "");
  const [saving31311, setSaving31311] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState<string | null>(null);
  const [poamEntryId, setPoamEntryId] = useState<string | null>(null);
  const [addingPoam, setAddingPoam] = useState(false);

  useEffect(() => {
    fetch(`/api/poam/entries?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPoamEntryId(data?.id ?? null));
  }, [record.id]);

  useEffect(() => {
    setNarrative(record.governanceNarrative ?? "");
    setResponsibleRoleId(record.responsibleRoleId ?? "");
  }, [record.governanceNarrative, record.responsibleRoleId]);

  useEffect(() => {
    fetch(`/api/evidence-requirements?controlId=${record.controlId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setRequirements(data));
  }, [record.controlId]);

  function refetchTechEvidence() {
    fetch(`/api/technical-evidence?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TechEvidenceRow[]) => setTechEvidence(list));
  }

  useEffect(() => {
    refetchTechEvidence();
  }, [record.id, record.artifactCount]);

  useEffect(() => {
    fetch(`/api/artifacts?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { artifactLabel: string }[]) =>
        setUploadedLabels(new Set(list.map((a) => a.artifactLabel)))
      );
  }, [record.id, record.artifactCount]);

  const uploadArtifacts = (requirements?.governance ?? []).filter(
    (a) => a.handling === "UPLOAD" || a.handling === "NATIVE"
  );
  const satisfactionType = requirements?.satisfactionType ?? null;
  const sprsValue = requirements?.sprsValue ?? null;
  const technicalReqs = requirements?.technical ?? [];
  const loadingRequirements = requirements === null;

  async function saveNarrative() {
    if (savingNarrative) return;
    setSavingNarrative(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ governanceNarrative: narrative || null }),
      });
      if (res.ok) onRefresh();
    } finally {
      setSavingNarrative(false);
    }
  }

  const is31311 = record.controlId === "3.13.11";
  const show31311Prompt =
    is31311 &&
    record.implementationStatus !== "implemented" &&
    record.implementationStatus !== "assessed";

  async function setSprs31311Condition(value: "no_crypto" | "non_fips") {
    setSaving31311(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sprs31311Condition: value }),
      });
      if (res.ok) onRefresh();
    } finally {
      setSaving31311(false);
    }
  }

  async function deleteTechEvidence(evidenceId: string) {
    const res = await fetch(`/api/technical-evidence/${evidenceId}`, { method: "DELETE" });
    if (res.ok) {
      setTechEvidence((prev) => prev.filter((e) => e.id !== evidenceId));
      onRefresh();
    }
  }

  async function generateWithAI(artifactLabel: string) {
    setGeneratingLabel(artifactLabel);
    try {
      const res = await fetch("/api/ai/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlRecordId: record.id, artifactLabel }),
      });
      if (res.ok) onRefresh();
    } finally {
      setGeneratingLabel(null);
    }
  }

  async function addToPoam() {
    if (addingPoam || poamEntryId) return;
    setAddingPoam(true);
    try {
      const res = await fetch("/api/poam/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ controlRecordId: record.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.id) {
        setPoamEntryId(data.id);
        onRefresh();
      }
    } finally {
      setAddingPoam(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      {loadingRequirements && (
        <p className="text-sm text-gray-500">Loading requirements…</p>
      )}
      <div className={`grid gap-6 ${loadingRequirements ? "opacity-60" : ""} grid-cols-1 lg:grid-cols-[1fr,1.2fr]`}>
        {/* Left: Control information */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-[#0F172A]">Control {record.controlId}</h3>
            {satisfactionType && (
              <span
                className={`rounded px-2 py-0.5 text-xs font-medium ${
                  satisfactionType === "Governance-Centric"
                    ? "bg-blue-100 text-blue-800"
                    : satisfactionType === "Hybrid"
                      ? "bg-amber-100 text-amber-800"
                      : "bg-gray-100 text-gray-800"
                }`}
              >
                {satisfactionType}
              </span>
            )}
            {sprsValue != null && (
              <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                {sprsValue} pt{sprsValue !== 1 ? "s" : ""}
              </span>
            )}
            <StatusBadge status={record.implementationStatus} />
          </div>
          {nist?.nistExactText && (
            <p className="text-sm text-gray-700">{nist.nistExactText}</p>
          )}
          {nist?.nistDiscussionGuidance && (
            <p className="text-sm text-gray-600">What this means: {nist.nistDiscussionGuidance}</p>
          )}
          {show31311Prompt && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                Does your organization use any cryptography that is not FIPS-validated, or no cryptography at all?
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSprs31311Condition("no_crypto")}
                  disabled={saving31311 || record.sprs31311Condition === "no_crypto"}
                  className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-70"
                >
                  No cryptography at all (5 pt deduction)
                </button>
                <button
                  type="button"
                  onClick={() => setSprs31311Condition("non_fips")}
                  disabled={saving31311 || record.sprs31311Condition === "non_fips"}
                  className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-70"
                >
                  Cryptography used but mostly not FIPS-validated (3 pt deduction)
                </button>
              </div>
              {record.sprs31311Condition && (
                <p className="mt-2 text-xs text-amber-800">Your selection has been saved and applied to the SPRS score.</p>
              )}
            </div>
          )}
        </div>

        {/* Right: Evidence collection */}
        <div className="space-y-4">
          {/* Governance artifacts */}
          {uploadArtifacts.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600">Governance artifacts</label>
              <ul className="mt-2 space-y-2">
                {uploadArtifacts.map((a) => (
                  <li key={a.label}>
                    <span className="text-sm text-gray-700">{a.label}</span>
                    {uploadedLabels.has(a.label) ? (
                      <span className="ml-2 text-xs text-green-600">Uploaded</span>
                    ) : (
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => generateWithAI(a.label)}
                          disabled={generatingLabel !== null}
                          className="rounded border border-[#3B82F6] bg-white px-2 py-1 text-xs font-medium text-[#3B82F6] hover:bg-[#3B82F6]/10 disabled:opacity-50"
                        >
                          {generatingLabel === a.label ? "Generating…" : "Generate with AI"}
                        </button>
                        <FileUploadWidget
                          controlRecordId={record.id}
                          artifactLabel={a.label}
                          onUploaded={onRefresh}
                        />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Technical evidence */}
          {technicalReqs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600">Technical evidence</label>
              <ul className="mt-2 space-y-4">
                {technicalReqs.map((req) => (
                  <li key={req.id} className="rounded border border-gray-200 bg-gray-50/50 p-3">
                    <p className="font-medium text-gray-900">{req.title}</p>
                    <p className="mt-1 text-sm text-gray-600">{req.description}</p>
                    {req.inherited ? (
                      <p className="mt-2 text-sm text-green-700">
                        Satisfied by {req.inheritedFrom ?? "cloud provider"}
                      </p>
                    ) : (
                      <>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <div className="min-w-0 flex-1">
                            <FileUploadWidget
                              controlRecordId={record.id}
                              artifactLabel={`Technical: ${req.title}`}
                              onUploaded={() => {
                                refetchTechEvidence();
                                onRefresh();
                              }}
                              technicalEvidencePayload={{ requirementId: req.id, evidenceType: req.type }}
                            />
                          </div>
                        </div>
                        {techEvidence
                          .filter((e) => e.requirementId === req.id)
                          .map((e) => (
                            <div key={e.id} className="mt-2 flex items-center justify-between rounded bg-white px-2 py-1 text-sm">
                              <span className="truncate text-gray-700">
                                {e.sourceUrl ? (
                                  <a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                    {e.description || e.sourceUrl}
                                  </a>
                                ) : (
                                  e.description || "File uploaded"
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => deleteTechEvidence(e.id)}
                                className="ml-2 text-red-600 hover:underline"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600">SSP narrative</label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              onBlur={saveNarrative}
              rows={4}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Describe how this control is implemented…"
              disabled={savingNarrative}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600">Responsible role</label>
            <select
              value={responsibleRoleId}
              onChange={(e) => {
                setResponsibleRoleId(e.target.value);
                fetch(`/api/control-records/${record.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ responsibleRoleId: e.target.value || null }),
                }).then((res) => res.ok && onRefresh());
              }}
              className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              <option value="">— Select —</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>

          <div>
            {poamEntryId ? (
              <a
                href={`/dashboard/poam/entry/${poamEntryId}`}
                className="inline-block rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                View POA&M
              </a>
            ) : (
              <button
                type="button"
                onClick={addToPoam}
                disabled={addingPoam}
                className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-50"
              >
                {addingPoam ? "Adding…" : "Add to POA&M"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
