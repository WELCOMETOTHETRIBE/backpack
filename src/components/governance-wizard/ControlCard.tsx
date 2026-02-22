"use client";

import { useState, useEffect } from "react";
import { getSpecForControl } from "@/lib/artifact-guide";
import type { ControlRecord, NistControl, Role } from "./GovernanceWizard";
import { FileUploadWidget } from "./FileUploadWidget";
import { StatusBadge } from "./StatusBadge";

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
  const spec = getSpecForControl(record.controlId);
  const [narrative, setNarrative] = useState(record.governanceNarrative ?? "");
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [responsibleRoleId, setResponsibleRoleId] = useState(record.responsibleRoleId ?? "");
  const [uploadedLabels, setUploadedLabels] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch(`/api/artifacts?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { artifactLabel: string }[]) =>
        setUploadedLabels(new Set(list.map((a) => a.artifactLabel)))
      );
  }, [record.id, record.artifactCount]);

  const isTechnicalCentric = spec?.satisfactionType === "Technical-Centric";

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

  if (isTechnicalCentric) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-[#0F172A]">Control {record.controlId}</h3>
          <StatusBadge status={record.implementationStatus} />
        </div>
        <p className="mt-2 text-sm text-gray-600">
          This control is satisfied through technical configuration. It will be addressed in the Technical Configuration Wizard.
        </p>
      </div>
    );
  }

  const requiredArtifacts = spec?.artifacts ?? [];
  const uploadArtifacts = requiredArtifacts.filter((a) => a.handling === "UPLOAD" || a.handling === "NATIVE");

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-[#0F172A]">Control {record.controlId}</h3>
        {spec && (
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              spec.satisfactionType === "Governance-Centric"
                ? "bg-blue-100 text-blue-800"
                : spec.satisfactionType === "Hybrid"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-gray-100 text-gray-800"
            }`}
          >
            {spec.satisfactionType}
          </span>
        )}
        <StatusBadge status={record.implementationStatus} />
      </div>

      {nist?.nistExactText && (
        <p className="mt-2 text-sm text-gray-700">{nist.nistExactText}</p>
      )}
      {nist?.nistDiscussionGuidance && (
        <p className="mt-1 text-sm text-gray-600">What this means: {nist.nistDiscussionGuidance}</p>
      )}

      <div className="mt-4">
        <label className="block text-xs font-medium text-gray-600">Required artifacts</label>
        <ul className="mt-2 space-y-2">
          {uploadArtifacts.map((a) => (
            <li key={a.label}>
              <span className="text-sm text-gray-700">{a.label}</span>
              {uploadedLabels.has(a.label) ? (
                <span className="ml-2 text-xs text-green-600">Uploaded</span>
              ) : (
                <div className="mt-1">
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

      <div className="mt-4">
        <label className="block text-xs font-medium text-gray-600">Governance narrative</label>
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

      <div className="mt-4">
        <label className="block text-xs font-medium text-gray-600">Responsible role</label>
        <select
          value={responsibleRoleId}
          onChange={(e) => {
            setResponsibleRoleId(e.target.value);
            setTimeout(() => {
              fetch(`/api/control-records/${record.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ responsibleRoleId: e.target.value || null }),
              }).then((res) => res.ok && onRefresh());
            }, 0);
          }}
          className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">— Select —</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
