"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
        if (!cancelled && res.ok) {
          const data = await res.json();
          setDashboard(data.subcontractors ?? []);
        }
      } catch {
        // Silently fail
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (subcontractors.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <p className="text-gray-600">No subcontractors yet. Invite your first subcontractor to get started.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Company Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              CMMC Level Required
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Compliance %
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              SPRS Score
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Open POA&Ms
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Last Activity
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {subcontractors.map((sub) => {
            const row = dashboard?.find((d) => d.relationshipId === sub.id);
            const companyName = sub.subOrganization?.name ?? row?.subName ?? sub.inviteEmail ?? "Pending";

            const lastActivityFormatted = row?.lastActivity
              ? new Date(row.lastActivity).toLocaleDateString()
              : "—";

            return (
              <tr key={sub.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    href={`/dashboard/supply-chain/${sub.id}`}
                    className="text-sm font-medium text-[#3B82F6] hover:text-[#2563EB]"
                  >
                    {companyName}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {sub.contract?.cmmcLevelRequired ?? "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {row?.compliancePct !== undefined ? `${row.compliancePct}%` : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {row?.sprsScore != null ? row.sprsScore : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {row?.openPoams !== undefined ? row.openPoams : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {lastActivityFormatted}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                      sub.status === "Active"
                        ? "bg-[#10B981]/10 text-[#10B981]"
                        : sub.status === "Pending"
                          ? "bg-[#F59E0B]/10 text-[#F59E0B]"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {sub.status}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
