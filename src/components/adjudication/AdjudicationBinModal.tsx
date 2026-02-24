"use client";

import { useState } from "react";
import { ControlAdjudicationModal } from "@/components/governance-wizard/ControlAdjudicationModal";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { FriendlySuggestor } from "./FriendlySuggestor";
import type { AdjudicationBin } from "@/lib/compliance/adjudication-bins";
import type { ControlRecordForBin } from "@/lib/compliance/adjudication-bins";
import type { NistControl, Role } from "@/components/governance-wizard/GovernanceWizard";
import { ChevronRight, X } from "lucide-react";

export function AdjudicationBinModal({
  familyCode,
  bin,
  records,
  nistByControlId,
  roles,
  orgUploadedLabels,
  onClose,
  onSaved,
}: {
  familyCode: string;
  bin: AdjudicationBin;
  records: ControlRecordForBin[];
  nistByControlId: Record<string, NistControl>;
  roles: Role[];
  orgUploadedLabels: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [suggestorControlId, setSuggestorControlId] = useState<string | null>(null);

  const selectedRecord =
    selectedIndex !== null ? records[selectedIndex] : null;

  const recordForModal = selectedRecord
    ? {
        ...selectedRecord,
        governanceNarrative: selectedRecord.governanceNarrative ?? null,
      }
    : null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjudication-bin-title"
      >
        <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 id="adjudication-bin-title" className="text-lg font-semibold text-slate-800">
              {familyCode} — {bin} ({records.length} controls)
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-4 p-4">
            {bin === "N/A" && (
              <p className="text-sm text-slate-600">
                Use the quick check below for a control, or adjudicate it fully with the button.
              </p>
            )}
            <ul className="space-y-2">
              {records.map((record, idx) => (
                <li
                  key={record.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm font-medium text-slate-800">
                      {record.controlId}
                    </span>
                    <span className="ml-2 text-sm text-slate-600">
                      {nistByControlId[record.controlId]?.title ?? ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={record.implementationStatus} />
                    {bin === "N/A" && (
                      <button
                        type="button"
                        onClick={() =>
                          setSuggestorControlId(
                            suggestorControlId === record.id ? null : record.id
                          )
                        }
                        className="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
                      >
                        Not applicable?
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[#0F172A] px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
                    >
                      Adjudicate
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                  {suggestorControlId === record.id && (
                    <div className="w-full border-t border-slate-200 pt-3">
                      <FriendlySuggestor
                        controlRecordId={record.id}
                        controlId={record.controlId}
                        onApply={() => {
                          setSuggestorControlId(null);
                          onSaved();
                        }}
                        onCancel={() => setSuggestorControlId(null)}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {recordForModal && (
        <ControlAdjudicationModal
          record={{
            id: recordForModal.id,
            controlId: recordForModal.controlId,
            implementationStatus: recordForModal.implementationStatus,
            governanceNarrative: recordForModal.governanceNarrative ?? null,
            responsibleRoleId: recordForModal.responsibleRoleId ?? null,
            roleName: recordForModal.roleName ?? null,
            artifactCount: recordForModal.artifactCount ?? 0,
            sprs31311Condition: recordForModal.sprs31311Condition ?? null,
          }}
          nist={nistByControlId[recordForModal.controlId]}
          roles={roles}
          orgUploadedLabels={orgUploadedLabels}
          onClose={() => setSelectedIndex(null)}
          onSaved={() => {
            onSaved();
            setSelectedIndex(null);
          }}
          groupRecords={records.map((r) => ({
            id: r.id,
            controlId: r.controlId,
            implementationStatus: r.implementationStatus,
            governanceNarrative: null,
            responsibleRoleId: r.responsibleRoleId ?? null,
            roleName: r.roleName ?? null,
            artifactCount: r.artifactCount ?? 0,
            sprs31311Condition: r.sprs31311Condition ?? null,
          }))}
          currentIndex={selectedIndex ?? 0}
          onNavigate={(nextIndex) => {
            if (nextIndex >= 0 && nextIndex < records.length) setSelectedIndex(nextIndex);
          }}
        />
      )}
    </>
  );
}
