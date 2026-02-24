"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getGovernanceAnalysis,
  isGovernance18Control,
} from "@/lib/compliance/governance-18-analysis";
import { getRequiredUploadArtifactLabels } from "@/lib/artifact-guide";
import { FileUploadWidget } from "@/components/governance-wizard/FileUploadWidget";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { ArrowLeft, FileText } from "lucide-react";

type ControlRecord = {
  id: string;
  controlId: string;
  implementationStatus: string;
  governanceNarrative: string | null;
};

type NistRow = { controlId: string; title: string | null };

export default function GovernanceControlPage() {
  const params = useParams();
  const controlId = typeof params.controlId === "string" ? params.controlId : "";

  const [record, setRecord] = useState<ControlRecord | null>(null);
  const [nistTitle, setNistTitle] = useState<string | null>(null);
  const [uploadedLabels, setUploadedLabels] = useState<Set<string>>(new Set());
  const [narrative, setNarrative] = useState("");
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [loading, setLoading] = useState(true);

  const analysis = controlId ? getGovernanceAnalysis(controlId) : undefined;
  const requiredLabels = controlId ? getRequiredUploadArtifactLabels(controlId) : [];

  const fetchData = useCallback(async () => {
    if (!controlId) return;
    setLoading(true);
    try {
      const [recRes, nistRes] = await Promise.all([
        fetch("/api/control-records"),
        fetch("/api/controls/nist"),
      ]);
      let recordId: string | null = null;
      if (recRes.ok) {
        const list: ControlRecord[] = await recRes.json();
        const r = list.find((x) => x.controlId === controlId) ?? null;
        setRecord(r);
        if (r) {
          setNarrative(r.governanceNarrative ?? "");
          recordId = r.id;
        }
      }
      if (nistRes.ok) {
        const nistList: NistRow[] = await nistRes.json();
        const n = nistList.find((x) => x.controlId === controlId);
        setNistTitle(n?.title ?? null);
      }
      if (recordId) {
        const artRes = await fetch(`/api/artifacts?controlRecordId=${recordId}`);
        if (artRes.ok) {
          const arts: { artifactLabel: string }[] = await artRes.json();
          setUploadedLabels(new Set(arts.map((a) => a.artifactLabel)));
        }
      }
    } finally {
      setLoading(false);
    }
  }, [controlId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function saveNarrative() {
    if (!record?.id || savingNarrative) return;
    setSavingNarrative(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ governanceNarrative: narrative || null }),
      });
      if (res.ok) fetchData();
    } finally {
      setSavingNarrative(false);
    }
  }

  if (!controlId || !isGovernance18Control(controlId)) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-slate-600">Control not found or not a governance control.</p>
        <Link
          href="/dashboard/adjudication/governance"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to 18 Governance Controls
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center p-8">
        <p className="text-sm text-slate-600">Loading…</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-slate-600">Control record not found for this organization.</p>
        <Link
          href="/dashboard/adjudication/governance"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to 18 Governance Controls
        </Link>
      </div>
    );
  }

  const title = analysis?.title ?? nistTitle ?? controlId;

  return (
    <div className="min-h-0 space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/adjudication/governance"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          18 Governance Controls
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {controlId} — {title}
          </h1>
          {nistTitle && analysis?.title !== nistTitle && (
            <p className="mt-0.5 text-sm text-slate-500">{nistTitle}</p>
          )}
        </div>
        <StatusBadge status={record.implementationStatus} />
      </div>

      {analysis && (
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">Overview</h2>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              NIST requirement
            </h3>
            <p className="mt-1 text-sm text-slate-700">{analysis.nistRequirement}</p>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Primary governance documents required
            </h3>
            <ul className="mt-3 space-y-4">
              {analysis.primaryDocuments.map((doc) => (
                <li key={doc.name} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                  <p className="font-medium text-slate-800">{doc.name}</p>
                  <p className="mt-1 text-xs text-slate-500">What this document must address:</p>
                  <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-slate-700">
                    {doc.whatMustAddress.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Evidence records required
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-slate-700">
              {analysis.evidenceRecordsRequired.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="text-xs font-medium uppercase tracking-wider text-slate-500">
              C3PAO verification focus
            </h3>
            <ul className="mt-2 list-inside list-disc space-y-0.5 text-sm text-slate-700">
              {analysis.c3paoVerificationFocus.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800">
          <FileText className="h-4 w-4" />
          Upload documents to satisfy this control
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Upload each required document below. When all required uploads and the narrative are
          complete, the control will be marked Implemented.
        </p>
        <div className="space-y-4">
          {requiredLabels.map((label) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 bg-slate-50/50 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-medium text-slate-800">{label}</span>
                {uploadedLabels.has(label) && (
                  <span className="text-xs font-medium text-green-700">Uploaded</span>
                )}
              </div>
              <FileUploadWidget
                controlRecordId={record.id}
                artifactLabel={label}
                onUploaded={fetchData}
              />
            </div>
          ))}
          {requiredLabels.length === 0 && (
            <p className="text-sm text-slate-500">No upload artifacts defined for this control.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-slate-800">
          Governance narrative (required for Implemented)
        </h2>
        <p className="mb-3 text-xs text-slate-500">
          Briefly describe how this control is implemented. Required for the control to be marked
          Implemented.
        </p>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          onBlur={saveNarrative}
          rows={4}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
          placeholder="Describe how this control is implemented…"
          disabled={savingNarrative}
        />
        {savingNarrative && <p className="mt-1 text-xs text-slate-500">Saving…</p>}
      </div>
    </div>
  );
}
