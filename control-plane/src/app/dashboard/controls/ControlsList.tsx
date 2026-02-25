"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Network } from "lucide-react";
import { shouldShowControl } from "./ControlsFilter";

interface Control {
  id: string;
  status: string;
  control: {
    controlId: string;
    title: string;
    familyCode?: string;
    controlUuid?: string;
  } | null;
}

interface ControlsListProps {
  impls: Control[];
  byFamily: Record<string, Control[]>;
  familyOrder: string[];
  flowdownControlUuids: string[];
}

export default function ControlsList({
  impls,
  byFamily,
  familyOrder,
  flowdownControlUuids,
}: ControlsListProps) {
  const searchParams = useSearchParams();
  const filter = (searchParams.get("filter") || "all") as "all" | "technical" | "governance" | "inherited" | "na";

  // Filter controls based on selected filter
  const filteredByFamily = Object.entries(byFamily).reduce(
    (acc, [code, controls]) => {
      const filtered = controls.filter((c) => shouldShowControl(c, filter));
      if (filtered.length > 0) {
        acc[code] = filtered;
      }
      return acc;
    },
    {} as Record<string, Control[]>
  );

  if (Object.keys(filteredByFamily).length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
        <p className="text-gray-600">No controls match the selected filter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {familyOrder.filter((code) => filteredByFamily[code]?.length).map((code) => (
        <div key={code}>
          <h2 className="mb-2 text-lg font-medium text-gray-800">{code}</h2>
          <ul className="space-y-1">
            {(filteredByFamily[code] ?? []).map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/controls/${c.id}`}
                  className="flex items-center justify-between rounded border border-gray-200 bg-white px-3 py-2 text-sm transition-colors hover:border-[#3B82F6] hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-700">{c.control?.controlId}</span>
                    {c.control?.controlUuid && flowdownControlUuids.includes(c.control.controlUuid) && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#3B82F6]/10 px-2 py-0.5 text-xs font-medium text-[#3B82F6]">
                        <Network className="h-3 w-3" />
                        Flow-Down
                      </span>
                    )}
                  </div>
                  <span className="max-w-md truncate text-gray-600">{c.control?.title}</span>
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      c.status === "Implemented"
                        ? "bg-[#10B981]/10 text-[#10B981]"
                        : c.status === "POA&M"
                          ? "bg-[#F59E0B]/10 text-[#F59E0B]"
                          : c.status === "Inherited"
                            ? "bg-[#3B82F6]/10 text-[#3B82F6]"
                            : c.status === "Not Applicable"
                              ? "bg-gray-100 text-gray-600"
                              : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {c.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
