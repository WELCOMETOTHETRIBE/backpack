"use client";

import { FileText } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";

export type EvidenceRow = {
  id: string;
  evidenceId: string;
  artifactFilename: string;
  storageLocation: string;
  sha256Preview: string;
};

export function EvidenceTableClient({ rows }: { rows: EvidenceRow[] }) {
  const columns: DataTableColumn<EvidenceRow>[] = [
    { key: "evidenceId", label: "Evidence ID", sortable: true },
    { key: "artifactFilename", label: "Artifact", sortable: true },
    { key: "storageLocation", label: "Storage", sortable: true },
    {
      key: "sha256Preview",
      label: "SHA-256",
      sortable: false,
      render: (_, value) =>
        value ? <span className="font-mono text-xs text-slate-400">{String(value)}</span> : "—",
    },
  ];

  const emptyState = (
    <EmptyState
      icon={FileText}
      title="No evidence registered yet"
      description="Use the form above to register evidence metadata (RunId, path, SHA-256, and link to controls)."
    />
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search evidence…"
      emptyState={emptyState}
    />
  );
}
