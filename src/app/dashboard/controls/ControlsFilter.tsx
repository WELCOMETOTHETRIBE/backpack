"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

type FilterType = "all" | "technical" | "governance" | "inherited" | "na";

const GOVERNANCE_FAMILIES = ["PL", "PS", "RA"];

interface ControlsFilterProps {
  totalCount: number;
  technicalCount: number;
  governanceCount: number;
  inheritedCount: number;
  naCount: number;
}

export default function ControlsFilter({
  totalCount,
  technicalCount,
  governanceCount,
  inheritedCount,
  naCount,
}: ControlsFilterProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currentFilter = (searchParams.get("filter") as FilterType) || "all";

  function setFilter(filter: FilterType) {
    const params = new URLSearchParams(searchParams.toString());
    if (filter === "all") {
      params.delete("filter");
    } else {
      params.set("filter", filter);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const filters = [
    { id: "all" as FilterType, label: "All", count: totalCount },
    { id: "technical" as FilterType, label: "Technical", count: technicalCount },
    { id: "governance" as FilterType, label: "Governance", count: governanceCount },
    { id: "inherited" as FilterType, label: "Inherited", count: inheritedCount },
    { id: "na" as FilterType, label: "N/A", count: naCount },
  ];

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3">
      {filters.map((filter) => (
        <button
          key={filter.id}
          onClick={() => setFilter(filter.id)}
          className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
            currentFilter === filter.id
              ? "border-[#3B82F6] bg-[#3B82F6] text-white"
              : "border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50"
          }`}
        >
          <span>{filter.label}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              currentFilter === filter.id
                ? "bg-white/20 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {filter.count}
          </span>
        </button>
      ))}
    </div>
  );
}

export function shouldShowControl(
  control: { status: string; familyCode?: string },
  filter: FilterType
): boolean {
  if (filter === "all") return true;
  if (filter === "inherited") return control.status === "Inherited";
  if (filter === "na") return control.status === "Not Applicable";
  if (filter === "governance") {
    return GOVERNANCE_FAMILIES.includes(control.familyCode || "");
  }
  if (filter === "technical") {
    return !GOVERNANCE_FAMILIES.includes(control.familyCode || "") &&
           control.status !== "Inherited" &&
           control.status !== "Not Applicable";
  }
  return true;
}
