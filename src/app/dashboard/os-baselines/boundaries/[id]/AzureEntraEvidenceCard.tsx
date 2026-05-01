"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload } from "lucide-react";
import { FileUploadWidget } from "@/components/governance-wizard/FileUploadWidget";
import {
  AZURE_ENTRA_7_CONTROL_IDS,
  AZURE_ENTRA_BASELINE,
} from "@/lib/compliance/azure-entra-controls";

type ControlRecord = {
  id: string;
  controlId: string;
  artifactCount: number;
};

const ARTIFACT_LABEL = "Azure/Entra evidence";

export function AzureEntraEvidenceCard({ boundaryId }: { boundaryId: string }) {
  const [records, setRecords] = useState<ControlRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setError(null);
    try {
      const controlIds = AZURE_ENTRA_7_CONTROL_IDS.join(",");
      const res = await fetch(`/api/control-records?controlIds=${encodeURIComponent(controlIds)}`);
      if (!res.ok) throw new Error("Failed to load control records");
      const data = (await res.json()) as ControlRecord[];
      setRecords(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const baselineByControlId = Object.fromEntries(
    AZURE_ENTRA_BASELINE.map((e) => [e.controlId, e])
  );

  const cardClass =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  if (loading) {
    return (
      <section className={cardClass}>
        <p className="text-sm text-[var(--color-gray-500)]">Loading Azure/Entra control records…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={cardClass}>
        <p className="text-sm text-[var(--color-status-red)]">{error}</p>
      </section>
    );
  }

  return (
    <section className={cardClass}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-gray-800)]">
        <Upload className="h-5 w-5 text-[var(--color-gray-500)]" aria-hidden />
        Upload Azure/Entra evidence
      </h2>
      <p className="mt-1 text-sm text-[var(--color-gray-600)]">
        Attach evidence for the 12 Azure/Entra controls validated by{" "}
        <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 text-[11px]">validate_azure_entra.py</code>{" "}
        v1.4+ (NSG, Key Vault, Conditional Access, Entra audit logs, storage TLS, etc.).
      </p>
      <div className="mt-4 space-y-4">
        {AZURE_ENTRA_7_CONTROL_IDS.map((controlId) => {
          const record = records.find((r) => r.controlId === controlId);
          const baseline = baselineByControlId[controlId];
          return (
            <div
              key={controlId}
              className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/50 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-medium text-[var(--color-gray-500)]">
                    {controlId}
                  </span>
                  <span className="ml-2 font-medium text-[var(--color-gray-900)]">
                    {baseline?.title ?? controlId}
                  </span>
                  <p className="mt-1 text-xs text-[var(--color-gray-600)]">
                    {record ? (
                      record.artifactCount > 0 ? (
                        <span>{record.artifactCount} file(s) uploaded</span>
                      ) : (
                        "No evidence yet"
                      )
                    ) : null}
                  </p>
                </div>
                {record ? (
                  <FileUploadWidget
                    controlRecordId={record.id}
                    artifactLabel={ARTIFACT_LABEL}
                    onUploaded={fetchRecords}
                    compact
                  />
                ) : (
                  <span className="text-xs text-[var(--color-gray-500)]">Control record not found</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
