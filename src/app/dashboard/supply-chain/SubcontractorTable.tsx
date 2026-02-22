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

interface SubcontractorTableProps {
  subcontractors: Subcontractor[];
}

export default function SubcontractorTable({ subcontractors }: SubcontractorTableProps) {
  const [statuses, setStatuses] = useState<Record<string, any>>({});

  useEffect(() => {
    // Fetch status for each subcontractor that has an organization
    subcontractors
      .filter((s) => s.subOrganization?.id)
      .forEach(async (sub) => {
        try {
          const res = await fetch(`/api/supply-chain/status/${sub.subOrganization!.id}`);
          if (res.ok) {
            const data = await res.json();
            setStatuses((prev) => ({ ...prev, [sub.subOrganization!.id]: data }));
          }
        } catch (err) {
          // Silently fail - status will show as unavailable
        }
      });
  }, [subcontractors]);

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
              Compliance Score
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Open POA&Ms
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Certification Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {subcontractors.map((sub) => {
            const status = statuses[sub.subOrganization?.id || ""];
            const companyName = sub.subOrganization?.name || sub.inviteEmail || "Pending";
            const isPending = sub.status === "Pending";

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
                  {sub.contract?.cmmcLevelRequired || "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {status?.complianceScore !== undefined ? `${status.complianceScore}%` : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {status?.openPoams !== undefined ? status.openPoams : "—"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {status?.certificationStatus || "—"}
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
