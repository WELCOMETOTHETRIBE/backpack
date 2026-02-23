"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyncPoamFromControlsButton } from "./SyncPoamFromControlsButton";
import { AddPoamButton } from "./AddPoamButton";

export type PoamRow = {
  id: string;
  source: string;
  controlId: string;
  description: string;
  status: string;
  date: string;
  link: string;
};

export function PoamTableClient({
  rows,
  overdueCount,
}: {
  rows: PoamRow[];
  overdueCount: number;
}) {
  const columns: DataTableColumn<PoamRow>[] = [
    { key: "source", label: "Source", sortable: true },
    { key: "controlId", label: "Control ID", sortable: true },
    { key: "description", label: "Description / Title", sortable: true },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (_, value) => (
        <span
          className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${
            value === "closed" || value === "Closed"
              ? "bg-green-100 text-green-800"
              : String(value).toLowerCase().includes("high") || String(value).toLowerCase().includes("critical")
                ? "bg-red-100 text-red-800"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {String(value)}
        </span>
      ),
    },
    { key: "date", label: "Date", sortable: true },
  ];

  const emptyState = (
    <EmptyState
      icon={ClipboardList}
      title="No Action Items Yet"
      description="Create POA&M entries from controls marked Not started or In progress, or add items from the Compliance Hub."
      callToAction={
        <div className="flex flex-wrap items-center justify-center gap-2">
          <SyncPoamFromControlsButton />
          <AddPoamButton />
        </div>
      }
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <SyncPoamFromControlsButton />
          <AddPoamButton />
        </div>
      </div>
      {overdueCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-sm font-medium text-amber-800">Overdue ({overdueCount})</h3>
          <p className="mt-1 text-sm text-amber-700">
            <Link href="/dashboard/poam" className="hover:underline">
              {overdueCount} item{overdueCount === 1 ? "" : "s"} past target completion. Review in the table below.
            </Link>
          </p>
        </div>
      )}
      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="Search POA&M items…"
        emptyState={emptyState}
        getRowHref={(row) => row.link}
      />
    </div>
  );
}
