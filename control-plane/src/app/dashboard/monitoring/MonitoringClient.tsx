"use client";

import Link from "next/link";
import { CalendarCheck, FileWarning } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";

type ControlDueRow = {
  id: string;
  controlId: string;
  lastValidated: string;
  cadence: string;
  link: string;
};

type EvidenceExpiringRow = {
  id: string;
  evidenceId: string;
  artifactFilename: string;
  retainUntil: string;
};

export function MonitoringClient({
  controlsDue,
  evidenceExpiring,
}: {
  controlsDue: ControlDueRow[];
  evidenceExpiring: EvidenceExpiringRow[];
}) {
  const controlColumns: DataTableColumn<ControlDueRow>[] = [
    { key: "controlId", label: "Control", sortable: true },
    { key: "lastValidated", label: "Last validated", sortable: true },
    { key: "cadence", label: "Cadence", sortable: true },
  ];

  const evidenceColumns: DataTableColumn<EvidenceExpiringRow>[] = [
    { key: "evidenceId", label: "Evidence ID", sortable: true },
    { key: "artifactFilename", label: "Artifact", sortable: true },
    { key: "retainUntil", label: "Retain until", sortable: true },
  ];

  const controlsEmpty = (
    <EmptyState
      icon={CalendarCheck}
      title="No controls due for review"
      description="Controls whose last validation plus cadence falls in the next 30 days will appear here."
    />
  );

  const evidenceEmpty = (
    <EmptyState
      icon={FileWarning}
      title="No evidence expiring soon"
      description="Evidence with retention date in the next 30 days will appear here."
    />
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Controls due for review</h2>
        <p className="mb-4 text-sm text-gray-500">
          Controls whose last validation + cadence is in the past or within 30 days.
        </p>
        <DataTable
          columns={controlColumns}
          data={controlsDue}
          searchPlaceholder="Search controls…"
          emptyState={controlsEmpty}
          getRowHref={(row) => row.link}
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">Evidence expiring soon</h2>
        <p className="mb-4 text-sm text-gray-500">
          Evidence metadata with retention date in the next 30 days or already passed.
        </p>
        <DataTable
          columns={evidenceColumns}
          data={evidenceExpiring}
          searchPlaceholder="Search evidence…"
          emptyState={evidenceEmpty}
        />
      </div>
    </div>
  );
}
