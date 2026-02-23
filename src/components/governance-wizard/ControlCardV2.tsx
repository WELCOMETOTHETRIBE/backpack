"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ControlRecord, NistControl, Role } from "./GovernanceWizard";
import { FileUploadWidget } from "./FileUploadWidget";
import { StatusBadge } from "./StatusBadge";
import { getAdjudicationQuestionsForControl } from "@/lib/compliance/control_adjudication_questions";
import { getRequiredUploadArtifactLabels, getFirstControlRequiringUploadLabel } from "@/lib/artifact-guide";
import { CheckCircle2, AlertCircle, XCircle, ChevronDown, ChevronUp, Wand2, FileText, Monitor } from "lucide-react";

type EvidenceRequirements = {
  governance: { label: string; handling: string }[];
  technical: {
    id: string;
    title: string;
    description: string;
    type: string;
    inherited?: boolean;
    inheritedFrom?: string;
  }[];
  sprsValue: number | null;
  satisfactionType: string | null;
};

type TechEvidenceRow = {
  id: string;
  requirementId: string | null;
  description: string | null;
  fileUrl: string | null;
  sourceUrl: string | null;
};

export function ControlCardV2({
  record,
  nist,
  roles,
  onRefresh,
  orgUploadedLabels = [],
}: {
  record: ControlRecord;
  nist: NistControl | undefined;
  roles: Role[];
  onRefresh: () => void;
  /** Org-level uploaded artifact labels (for document gating). */
  orgUploadedLabels?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [showNistText, setShowNistText] = useState(false);
  const [showAdvancedNarrative, setShowAdvancedNarrative] = useState(false);
  const [requirements, setRequirements] = useState<EvidenceRequirements | null>(null);
  const [techEvidence, setTechEvidence] = useState<TechEvidenceRow[]>([]);
  const [uploadedArtifactLabels, setUploadedArtifactLabels] = useState<Set<string>>(new Set());
  const [narrative, setNarrative] = useState(record.governanceNarrative ?? "");
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [saving31311, setSaving31311] = useState(false);
  const [generatingLabel, setGeneratingLabel] = useState<string | null>(null);
  const [poamEntryId, setPoamEntryId] = useState<string | null>(null);
  const [addingPoam, setAddingPoam] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [poamRemediation, setPoamRemediation] = useState("");
  const [poamDate, setPoamDate] = useState("");
  const [poamRoleId, setPoamRoleId] = useState("");
  const [augmentingPoam, setAugmentingPoam] = useState(false);
  const [questionAnswers, setQuestionAnswers] = useState<Record<number, "yes" | "no">>({});

  const requiredUploadLabels = useMemo(
    () => getRequiredUploadArtifactLabels(record.controlId),
    [record.controlId]
  );
  const missingRequiredLabels = useMemo(
    () => requiredUploadLabels.filter((l) => !orgUploadedLabels.includes(l)),
    [requiredUploadLabels, orgUploadedLabels]
  );
  const documentGateBlocked = missingRequiredLabels.length > 0;

  const adjudicationQuestions = useMemo(
    () => getAdjudicationQuestionsForControl(record.controlId, nist?.title),
    [record.controlId, nist?.title]
  );
  const allQuestionsAnswered =
    adjudicationQuestions.length > 0 &&
    adjudicationQuestions.every((_, i) => questionAnswers[i] === "yes" || questionAnswers[i] === "no");
  const derivedStatus = useMemo((): "not_started" | "in_progress" | "implemented" | null => {
    if (!allQuestionsAnswered) return null;
    const keyIndex = 0;
    const keyAnswer = questionAnswers[keyIndex];
    const anyKeyNo = keyAnswer === "no";
    const allKeyYes = keyAnswer === "yes";
    const nonKeyIndices = adjudicationQuestions.map((_, i) => i).filter((i) => i !== keyIndex);
    const someNonKeyNo = nonKeyIndices.some((i) => questionAnswers[i] === "no");
    if (anyKeyNo) return "not_started";
    if (allKeyYes && someNonKeyNo) return "in_progress";
    return "implemented";
  }, [allQuestionsAnswered, questionAnswers, adjudicationQuestions.length]);

  const isImplemented =
    record.implementationStatus === "implemented" ||
    record.implementationStatus === "assessed" ||
    record.implementationStatus === "inherited";
  const isInProgress = record.implementationStatus === "in_progress";
  const isNotStarted = record.implementationStatus === "not_started";
  const showEvidence = isImplemented || isInProgress;
  const showPoam = isInProgress || isNotStarted;

  useEffect(() => {
    fetch(`/api/poam/entries?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPoamEntryId(data?.id ?? null));
  }, [record.id]);

  useEffect(() => {
    setNarrative(record.governanceNarrative ?? "");
  }, [record.governanceNarrative]);

  useEffect(() => {
    const canUpdate =
      record.implementationStatus !== "inherited" && record.implementationStatus !== "assessed";
    if (
      allQuestionsAnswered &&
      derivedStatus !== null &&
      derivedStatus !== record.implementationStatus &&
      !savingStatus &&
      canUpdate
    ) {
      setStatus(derivedStatus);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run when answers/derived change; setStatus stable
  }, [allQuestionsAnswered, derivedStatus, record.implementationStatus]);

  useEffect(() => {
    fetch(`/api/evidence-requirements?controlId=${record.controlId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setRequirements(data));
  }, [record.controlId]);

  const refetchTechEvidence = useCallback(() => {
    fetch(`/api/technical-evidence?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: TechEvidenceRow[]) => setTechEvidence(list));
  }, [record.id]);

  useEffect(() => {
    refetchTechEvidence();
  }, [record.id, record.artifactCount, refetchTechEvidence]);

  useEffect(() => {
    fetch(`/api/artifacts?controlRecordId=${record.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: { artifactLabel: string }[]) =>
        setUploadedArtifactLabels(new Set(list.map((a) => a.artifactLabel)))
      );
  }, [record.id, record.artifactCount]);

  const uploadArtifacts = (requirements?.governance ?? []).filter(
    (a) => a.handling === "UPLOAD" || a.handling === "NATIVE"
  );
  const technicalReqs = requirements?.technical ?? [];
  const loadingRequirements = requirements === null;
  const plainExplanation =
    nist?.nistDiscussionGuidance ??
    "This control describes a security requirement. Select your implementation status below.";

  async function setStatus(newStatus: "not_started" | "in_progress" | "implemented") {
    if (savingStatus) return;
    setSavingStatus(true);
    try {
      const res = await fetch(`/api/control-records/${record.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ implementationStatus: newStatus }),
      });
      if (res.ok) {
        onRefresh();
        if ((newStatus === "not_started" || newStatus === "in_progress") && !poamEntryId) {
          const eRes = await fetch("/api/poam/entries", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ controlRecordId: record.id }),
          });
          const eData = await eRes.json().catch(() => ({}));
          if (eRes.ok && eData?.id) {
            setPoamEntryId(eData.id);
            onRefresh();
          }
        }
      }
    } finally {
      setSavingStatus(false);
    }
  }

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
    is31311 && !isImplemented;

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
        body: JSON.stringify({
          controlRecordId: record.id,
          weaknessDescription: poamRemediation || undefined,
          remediationPlan: poamRemediation || undefined,
          scheduledCompletionDate: poamDate || undefined,
          responsibleRoleId: poamRoleId || undefined,
        }),
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

  async function augmentPoam() {
    if (!poamRemediation.trim()) return;
    setAugmentingPoam(true);
    try {
      const res = await fetch("/api/onboarding/augment-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field: "cuiBoundary", text: poamRemediation }),
      });
      if (res.ok) {
        const { augmented } = await res.json();
        if (augmented) setPoamRemediation(augmented);
      }
    } finally {
      setAugmentingPoam(false);
    }
  }

  function statusIcon() {
    if (record.implementationStatus === "inherited" || record.implementationStatus === "assessed" || record.implementationStatus === "implemented")
      return <CheckCircle2 className="h-5 w-5 text-green-600" aria-hidden />;
    if (record.implementationStatus === "in_progress")
      return <AlertCircle className="h-5 w-5 text-amber-600" aria-hidden />;
    return <XCircle className="h-5 w-5 text-gray-400" aria-hidden />;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm transition-all duration-200">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-gray-50/50"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse control" : "Expand control"}
      >
        <span className="shrink-0">{statusIcon()}</span>
        <span className="font-mono text-sm font-medium text-gray-700">{record.controlId}</span>
        <span className="min-w-0 flex-1 truncate text-gray-900">
          {nist?.title ?? record.controlId}
        </span>
        <StatusBadge status={record.implementationStatus} />
        <span className="shrink-0 text-gray-400">
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-gray-200 px-6 py-6 space-y-6">
          {loadingRequirements && (
            <p className="text-sm text-gray-500">Loading requirements…</p>
          )}
          <div className={`space-y-6 ${loadingRequirements ? "opacity-60" : ""}`}>
            {/* Section A: What This Means */}
            <section aria-labelledby={`control-${record.controlId}-meaning`}>
              <h3 id={`control-${record.controlId}-meaning`} className="text-sm font-semibold text-gray-900">
                What this means
              </h3>
              <p className="mt-1 text-sm text-gray-700">{plainExplanation}</p>
              <button
                type="button"
                onClick={() => setShowNistText((b) => !b)}
                className="mt-2 text-sm text-blue-600 hover:underline"
              >
                {showNistText ? "Hide NIST text" : "Learn more"}
              </button>
              {showNistText && nist?.nistExactText && (
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  {nist.nistExactText}
                </div>
              )}
            </section>

            {/* Section B: Question-driven adjudication (gated by required documents) */}
            <section aria-labelledby={`control-${record.controlId}-have`}>
              <h3 id={`control-${record.controlId}-have`} className="text-sm font-semibold text-gray-900">
                Do you have a process for this control?
              </h3>
              {documentGateBlocked ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm text-amber-900">
                    This control requires{" "}
                    <strong>{missingRequiredLabels[0]}</strong>. Please upload this document for control{" "}
                    {getFirstControlRequiringUploadLabel(missingRequiredLabels[0]!) ?? record.controlId} before
                    proceeding.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-3 space-y-4">
                    {adjudicationQuestions.map((q, i) => (
                      <div key={i} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                        <p className="mb-2 text-sm font-medium text-gray-900">{q}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setQuestionAnswers((prev) => ({ ...prev, [i]: "yes" }));
                            }}
                            aria-pressed={questionAnswers[i] === "yes"}
                            className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium ${
                              questionAnswers[i] === "yes"
                                ? "border-green-500 bg-green-50 text-green-800"
                                : "border-gray-200 bg-white text-gray-700 hover:border-green-300 hover:bg-green-50/50"
                            }`}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Yes
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setQuestionAnswers((prev) => ({ ...prev, [i]: "no" }));
                            }}
                            aria-pressed={questionAnswers[i] === "no"}
                            className={`flex items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-sm font-medium ${
                              questionAnswers[i] === "no"
                                ? "border-amber-500 bg-amber-50 text-amber-800"
                                : "border-gray-200 bg-white text-gray-700 hover:border-amber-300 hover:bg-amber-50/50"
                            }`}
                          >
                            <XCircle className="h-4 w-4" />
                            No
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {savingStatus && allQuestionsAnswered && (
                    <p className="mt-2 text-xs text-gray-500">Saving assessment…</p>
                  )}
                </>
              )}
            </section>

            {/* 3.13.11 prompt */}
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
                    No cryptography (5 pt deduction)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSprs31311Condition("non_fips")}
                    disabled={saving31311 || record.sprs31311Condition === "non_fips"}
                    className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-70"
                  >
                    Cryptography but not FIPS (3 pt deduction)
                  </button>
                </div>
              </div>
            )}

            {/* Section C: Show Your Evidence */}
            {showEvidence && (
              <section aria-labelledby={`control-${record.controlId}-evidence`}>
                <h3 id={`control-${record.controlId}-evidence`} className="text-sm font-semibold text-gray-900">
                  Show your evidence
                </h3>
                <div className="mt-3 space-y-4">
                  {uploadArtifacts.map((a) => (
                    <div
                      key={a.label}
                      className="rounded-lg border border-gray-200 bg-gray-50/50 p-4"
                    >
                      <div className="flex items-start gap-2">
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900">{a.label}</p>
                          <p className="mt-1 text-xs text-gray-600">
                            Upload a document or generate a template with AI.
                          </p>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <FileUploadWidget
                              controlRecordId={record.id}
                              artifactLabel={a.label}
                              onUploaded={onRefresh}
                            />
                            <button
                              type="button"
                              onClick={() => generateWithAI(a.label)}
                              disabled={generatingLabel !== null}
                              className="rounded border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                            >
                              {generatingLabel === a.label ? "Generating…" : "Generate with AI"}
                            </button>
                          </div>
                          {uploadedArtifactLabels.has(a.label) && (
                            <p className="mt-2 text-xs text-green-600">Uploaded</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {technicalReqs
                    .filter((r) => !r.inherited)
                    .map((req) => (
                      <div
                        key={req.id}
                        className="rounded-lg border border-gray-200 bg-gray-50/50 p-4"
                      >
                        <div className="flex items-start gap-2">
                          <Monitor className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900">{req.title}</p>
                            <p className="mt-1 text-xs text-gray-600">{req.description}</p>
                            <div className="mt-3">
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
                        </div>
                      </div>
                    ))}
                  {technicalReqs.filter((r) => r.inherited).map((req) => (
                    <div key={req.id} className="rounded-lg border border-green-200 bg-green-50/50 p-3">
                      <p className="font-medium text-gray-900">{req.title}</p>
                      <p className="mt-1 text-sm text-green-700">
                        Satisfied by {req.inheritedFrom ?? "cloud provider"}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Section D: POA&M */}
            {showPoam && (
              <section aria-labelledby={`control-${record.controlId}-poam`}>
                <h3 id={`control-${record.controlId}-poam`} className="text-sm font-semibold text-gray-900">
                  Add to your action plan
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  We&apos;ll track this as something you need to fix. This is normal — most companies have items in their action plan.
                </p>
                {poamEntryId ? (
                  <p className="mt-3">
                    <a
                      href={`/dashboard/poam/entry/${poamEntryId}`}
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      View in POA&M
                    </a>
                  </p>
                ) : (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">
                        What&apos;s the plan to fix this?
                      </label>
                      <div className="mt-1 flex gap-2">
                        <textarea
                          value={poamRemediation}
                          onChange={(e) => setPoamRemediation(e.target.value)}
                          rows={2}
                          placeholder="Describe in a few words..."
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={augmentPoam}
                          disabled={!poamRemediation.trim() || augmentingPoam}
                          className="shrink-0 rounded-lg border border-gray-300 bg-white p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          aria-label="Expand with AI"
                        >
                          <Wand2 className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Target completion date</label>
                        <input
                          type="date"
                          value={poamDate}
                          onChange={(e) => setPoamDate(e.target.value)}
                          className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Who is responsible?</label>
                        <select
                          value={poamRoleId}
                          onChange={(e) => setPoamRoleId(e.target.value)}
                          className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        >
                          <option value="">— Select —</option>
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>{r.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={addToPoam}
                      disabled={addingPoam}
                      className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      {addingPoam ? "Adding…" : "Add to Action Plan"}
                    </button>
                  </div>
                )}
              </section>
            )}

            {/* Section E: Advanced SSP narrative */}
            <section>
              <button
                type="button"
                onClick={() => setShowAdvancedNarrative((b) => !b)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                aria-expanded={showAdvancedNarrative}
              >
                {showAdvancedNarrative ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                Advanced: Write your SSP narrative
              </button>
              {showAdvancedNarrative && (
                <div className="mt-2">
                  <textarea
                    value={narrative}
                    onChange={(e) => setNarrative(e.target.value)}
                    onBlur={saveNarrative}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Describe how this control is implemented…"
                    disabled={savingNarrative}
                    aria-label="SSP narrative"
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
