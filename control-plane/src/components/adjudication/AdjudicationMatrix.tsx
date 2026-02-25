"use client";

import { useState, useEffect, useCallback } from "react";
import {
  buildBinningMatrix,
  CONTROL_FAMILY_CODES,
  BIN_COLUMNS,
  type AdjudicationBin,
  type ControlRecordForBin,
} from "@/lib/compliance/adjudication-bins";
import { CONTROL_FAMILIES } from "@/components/governance-wizard/constants";
import { AdjudicationBinModal } from "./AdjudicationBinModal";
import type { NistControl } from "@/components/governance-wizard/GovernanceWizard";
import type { Role } from "@/components/governance-wizard/GovernanceWizard";

const familyNameByCode = Object.fromEntries(
  CONTROL_FAMILIES.map((f) => [f.code, f.name])
);

export function AdjudicationMatrix() {
  const [records, setRecords] = useState<ControlRecordForBin[]>([]);
  const [boundaryTech, setBoundaryTech] = useState<string[]>([]);
  const [nistControls, setNistControls] = useState<NistControl[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [uploadedLabels, setUploadedLabels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCell, setOpenCell] = useState<{
    familyCode: string;
    bin: AdjudicationBin;
    records: ControlRecordForBin[];
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [recRes, boundaryRes, nistRes, rolesRes, labelsRes] = await Promise.all([
        fetch("/api/control-records"),
        fetch("/api/boundary-profile"),
        fetch("/api/controls/nist"),
        fetch("/api/roles"),
        fetch("/api/governance-documents/uploaded-labels"),
      ]);
      if (recRes.ok) setRecords(await recRes.json());
      if (boundaryRes.ok) {
        const b = await boundaryRes.json();
        setBoundaryTech(b.selectedTechnologies ?? []);
      }
      if (nistRes.ok) setNistControls(await nistRes.json());
      if (rolesRes.ok) setRoles(await rolesRes.json());
      if (labelsRes.ok) {
        const d = await labelsRes.json().catch(() => ({}));
        setUploadedLabels(d.uploadedLabels ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const matrix = buildBinningMatrix(records, boundaryTech);
  const nistByControlId = Object.fromEntries(
    nistControls.map((n) => [n.controlId, n])
  );

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-white p-8">
        <p className="text-sm text-slate-600">Loading controls…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">
          Control Adjudication by satisfaction type
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Click a cell to adjudicate all controls in that family and bin.
        </p>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-slate-200 bg-slate-50 px-3 py-2 text-left font-medium text-slate-700">
                Family
              </th>
              {BIN_COLUMNS.map((bin) => (
                <th
                  key={bin}
                  className="border border-slate-200 bg-slate-50 px-3 py-2 text-center font-medium text-slate-700"
                >
                  {bin}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CONTROL_FAMILY_CODES.map((code) => (
              <tr key={code}>
                <td className="border border-slate-200 px-3 py-2 font-medium text-slate-800">
                  {code} — {familyNameByCode[code] ?? code}
                </td>
                {BIN_COLUMNS.map((bin) => {
                  const list = matrix.get(code)?.get(bin) ?? [];
                  return (
                    <td
                      key={bin}
                      className="border border-slate-200 px-3 py-2 text-center"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          list.length > 0 &&
                          setOpenCell({ familyCode: code, bin, records: list })
                        }
                        disabled={list.length === 0}
                        className={`min-w-[3rem] rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                          list.length > 0
                            ? "bg-slate-100 text-slate-800 hover:bg-slate-200"
                            : "cursor-default bg-slate-50 text-slate-400"
                        }`}
                      >
                        {list.length}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openCell && (
        <AdjudicationBinModal
          familyCode={openCell.familyCode}
          bin={openCell.bin}
          records={openCell.records}
          nistByControlId={nistByControlId}
          roles={roles}
          orgUploadedLabels={uploadedLabels}
          onClose={() => setOpenCell(null)}
          onSaved={fetchData}
        />
      )}
    </div>
  );
}
