"use client";

import { useState, useEffect, useCallback } from "react";
import { getSpecForControl, type SatisfactionType } from "@/lib/artifact-guide";
import { CONTROL_FAMILIES } from "./constants";
import { WizardIntro } from "./WizardIntro";
import { WizardGauntlet } from "./WizardGauntlet";
import { WizardReview } from "./WizardReview";

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

type Step = "intro" | "gauntlet" | "review";

export function GovernanceWizard() {
  const [step, setStep] = useState<Step>("intro");
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [nistControls, setNistControls] = useState<NistControl[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFamily, setSelectedFamily] = useState<string>("AC");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, nistRes, rolesRes] = await Promise.all([
        fetch("/api/control-records"),
        fetch("/api/controls/nist"),
        fetch("/api/roles"),
      ]);
      if (recRes.ok) setRecords(await recRes.json());
      if (nistRes.ok) setNistControls(await nistRes.json());
      if (rolesRes.ok) setRoles(await rolesRes.json());
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

  if (loading && records.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-gray-600">Loading Governance Wizard…</p>
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
            onNext={() => setStep("gauntlet")}
          />
        )}
        {step === "gauntlet" && (
          <WizardGauntlet
            records={records}
            nistControls={nistControls}
            roles={roles}
            selectedFamily={selectedFamily}
            onSelectFamily={setSelectedFamily}
            onRefresh={fetchData}
            onReview={() => setStep("review")}
          />
        )}
        {step === "review" && (
          <WizardReview
            records={records}
            familyStats={familyStats}
            totalImplemented={totalImplemented}
            totalInProgress={totalInProgress}
            totalNotStarted={totalNotStarted}
            onBack={() => setStep("gauntlet")}
          />
        )}
      </div>
    </div>
  );
}

export { getSpecForControl };
export type { SatisfactionType };
