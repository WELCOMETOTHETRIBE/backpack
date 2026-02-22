import Link from "next/link";

interface FamilyData {
  code: string;
  name: string;
  implemented: number;
  total: number;
}

interface ControlFamilyHeatMapProps {
  families: FamilyData[];
}

const FAMILY_NAMES: Record<string, string> = {
  AC: "Access Control",
  AT: "Awareness and Training",
  AU: "Audit and Accountability",
  CM: "Configuration Management",
  IA: "Identification and Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PE: "Physical and Environmental Protection",
  PL: "Planning",
  PS: "Personnel Security",
  RA: "Risk Assessment",
  SA: "System and Services Acquisition",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
};

export default function ControlFamilyHeatMap({ families }: ControlFamilyHeatMapProps) {
  const getColor = (percentage: number) => {
    if (percentage >= 90) return "bg-[#10B981]"; // green
    if (percentage >= 70) return "bg-[#3B82F6]"; // blue
    if (percentage >= 50) return "bg-[#F59E0B]"; // amber
    return "bg-[#EF4444]"; // red
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">Control Family Status</h3>
      <div className="grid grid-cols-3 gap-3">
        {families.map((family) => {
          const percentage = family.total > 0 ? Math.round((family.implemented / family.total) * 100) : 0;
          return (
            <Link
              key={family.code}
              href={`/dashboard/controls?family=${family.code}`}
              className="group rounded-lg border border-gray-200 p-3 transition-all hover:border-[#3B82F6] hover:shadow-md"
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{family.code}</div>
                  <div className="text-xs text-gray-600">{FAMILY_NAMES[family.code] || family.name}</div>
                </div>
                <div className="text-sm font-medium text-gray-700">{percentage}%</div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full transition-all ${getColor(percentage)}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {family.implemented}/{family.total} implemented
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
