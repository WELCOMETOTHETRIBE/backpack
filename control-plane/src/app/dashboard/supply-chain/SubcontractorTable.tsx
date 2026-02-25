"use client";

import { useState, useEffect, useMemo } from "react";
import { Users } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import InviteSubcontractorButton from "./InviteSubcontractorButton";

interface Subcontractor {
  id: string;
  status: string;
  inviteEmail: string | null;
  subOrganization: {
    id: string;
    name: string;
  } | null;
  contract?: {
    id: string;
    contractName: string;
    contractNumber: string | null;
    cmmcLevelRequired: string;
  };
}

interface DashboardRow {
  relationshipId: string;
  subOrganizationId: string | null;
  subName: string | null;
  status: string;
  compliancePct: number;
  sprsScore: number | null;
  openPoams: number;
  lastActivity: string | null;
}

type TableRow = {
  id: string;
  companyName: string;
  cmmcLevelRequired: string;
  compliancePct: string;
  sprsScore: string;
  openPoams: string;
  lastActivity: string;
  status: string;
  link: string;
};

interface SubcontractorTableProps {
  subcontractors: Subcontractor[];
}

export default function SubcontractorTable({ subcontractors }: SubcontractorTableProps) {
  const [dashboard, setDashboard] = useState<DashboardRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/supply-chain/dashboard");
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.subcontractors)) {
          setDashboard(data.subcontractors);
        }
      } catch {
        // Keep dashboard null; table still shows subcontractors from server props
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: TableRow[] = useMemo(() => {
    return subcontractors.map((sub) => {
      const row = dashboard?.find((d) => d.relationshipId === sub.id);
      const companyName = sub.subOrganization?.name ?? row?.subName ?? sub.inviteEmail ?? "Pending";
      return {
        id: sub.id,
        companyName,
        cmmcLevelRequired: sub.contract?.cmmcLevelRequired ?? "—",
        compliancePct: row?.compliancePct !== undefined ? `${row.compliancePct}%` : "—",
        sprsScore: row?.sprsScore != null ? String(row.sprsScore) : "—",
        openPoams: row?.openPoams !== undefined ? String(row.openPoams) : "—",
        lastActivity: row?.lastActivity
          ? new Date(row.lastActivity).toLocaleDateString()
          : "—",
        status: sub.status,
        link: `/dashboard/supply-chain/${sub.id}`,
      };
    });
  }, [subcontractors, dashboard]);

  const columns: DataTableColumn<TableRow>[] = [
    { key: "companyName", label: "Company Name", sortable: true },
    { key: "cmmcLevelRequired", label: "CMMC Level Required", sortable: true },
    { key: "compliancePct", label: "Compliance %", sortable: true },
    { key: "sprsScore", label: "SPRS Score", sortable: true },
    { key: "openPoams", label: "Open POA&Ms", sortable: true },
    { key: "lastActivity", label: "Last Activity", sortable: true },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (_, value) => (
        <span
          className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
            value === "Active"
              ? "bg-[#10B981]/10 text-[#10B981]"
              : value === "Pending"
                ? "bg-[#F59E0B]/10 text-[#F59E0B]"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {String(value)}
        </span>
      ),
    },
  ];

  const emptyState = (
    <EmptyState
      icon={Users}
      title="No subcontractors yet"
      description="Invite your first subcontractor to get started."
      callToAction={<InviteSubcontractorButton />}
    />
  );

  return (
    <DataTable
      columns={columns}
      data={rows}
      searchPlaceholder="Search subcontractors…"
      emptyState={emptyState}
      getRowHref={(row) => row.link}
    />
  );
}
