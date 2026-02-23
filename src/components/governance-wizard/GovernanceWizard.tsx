"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getSpecForControl, type SatisfactionType } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "./constants";
import { WizardIntro } from "./WizardIntro";
import { WizardReview } from "./WizardReview";
import { ControlMatrix } from "./ControlMatrix";
import { ControlAdjudicationModal } from "./ControlAdjudicationModal";

export type ControlRecord = {
  id: string;
  controlId: string;
  implementationStatus: string;
  governanceNarrative: string | null;
  responsibleRoleId: string | null;
  roleName: string | null;
  artifactCount: number;
  sprs31311Condition?: string | null;
};

export type NistControl = {
  controlId: string;
  title: string | null;
  nistExactText: string | null;
  nistDiscussionGuidance: string | null;
};

export type Role = { id: string; name: string; description: string | null };

type Step = "intro" | "matrix" | "review";

export function GovernanceWizard() {
  const searchParams = useSearchParams();
  const skipIntro = searchParams.get("skipIntro") === "1";
  const [step, setStep] = useState<Step>(skipIntro ? "matrix" : "intro");
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [nistControls, setNistControls] = useState<NistControl[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadedLabels, setUploadedLabels] = useState<string[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ControlRecord | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, nistRes, rolesRes, labelsRes] = await Promise.all([
        fetch("/api/control-records"),
        fetch("/api/controls/nist"),
        fetch("/api/roles"),
        fetch("/api/governance-documents/uploaded-labels"),
      ]);
      if (recRes.ok) setRecords(await recRes.json());
      if (nistRes.ok) setNistControls(await nistRes.json());
      if (rolesRes.ok) setRoles(await rolesRes.json());
      if (labelsRes.ok) {
        const labelsData = await labelsRes.json().catch(() => ({}));
        setUploadedLabels(labelsData.uploadedLabels ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const familyStats = CONTROL_FAMILIES.map((f) => {
    const prefix = f.controlPrefix;
    const inFamily = records.filter((r) => r.controlId.startsWith(prefix));
    const implemented = inFamily.filter((r) => r.implementationStatus === "implemented" || r.implementationStatus === "assessed" || r.implementationStatus === "inherited").length;
    return { code: f.code, name: f.name, total: inFamily.length, implemented };
  });

  const familiesComplete = familyStats.filter((s) => s.total > 0 && s.implemented === s.total).length;
  const totalImplemented = records.filter((r) => r.implementationStatus === "implemented" || r.implementationStatus === "assessed" || r.implementationStatus === "inherited").length;
  const totalInProgress = records.filter((r) => r.implementationStatus === "in_progress").length;
  const totalNotStarted = records.filter((r) => r.implementationStatus === "not_started").length;

  const nistByControlId = Object.fromEntries(nistControls.map((n) => [n.controlId, n]));

  if (loading && records.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8">
        {step === "intro" && (
          <WizardIntro
            familiesComplete={familiesComplete}
            familyStats={familyStats}
            onNext={() => setStep("matrix")}
          />
        )}
        {step === "matrix" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-gray-900">Control matrix</h1>
              <button
                type="button"
                onClick={() => setStep("review")}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Review & finalize
              </button>
            </div>
            <ControlMatrix
              records={records}
              nistControls={nistControls}
              onSelectControl={(record) => setSelectedRecord(record)}
            />
          </div>
        )}
        {step === "review" && (
          <WizardReview
            records={records}
            familyStats={familyStats}
            totalImplemented={totalImplemented}
            totalInProgress={totalInProgress}
            totalNotStarted={totalNotStarted}
            onBack={() => setStep("matrix")}
          />
        )}
      </div>
      {selectedRecord && (
        <ControlAdjudicationModal
          record={records.find((r) => r.id === selectedRecord.id) ?? selectedRecord}
          nist={nistByControlId[selectedRecord.controlId]}
          roles={roles}
          orgUploadedLabels={uploadedLabels}
          onClose={() => setSelectedRecord(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}

export { getSpecForControl };
export type { SatisfactionType };
