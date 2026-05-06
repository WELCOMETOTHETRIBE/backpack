/**
 * Phase 7 — Control Adjudication Engine status badge.
 *
 * Renders the verdict { satisfies | partial | gap | at_risk } as a
 * colored pill alongside an optional confidence bar. Used on the SCTM
 * overview page, per-control detail pages, and the Phase 10 auditor view.
 */

const TONES: Record<
  string,
  { bg: string; text: string; label: string; ring: string }
> = {
  satisfies: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    ring: "ring-emerald-200",
    label: "Satisfies",
  },
  partial: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    ring: "ring-amber-200",
    label: "Partial",
  },
  at_risk: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    ring: "ring-blue-200",
    label: "At risk",
  },
  gap: {
    bg: "bg-red-100",
    text: "text-red-800",
    ring: "ring-red-200",
    label: "Gap",
  },
};

export function AdjudicationStatusBadge({
  status,
  confidence,
  size = "sm",
  showConfidence = true,
}: {
  status: string | null | undefined;
  confidence?: number | null;
  size?: "xs" | "sm" | "md";
  showConfidence?: boolean;
}) {
  const tone = TONES[status ?? ""] ?? {
    bg: "bg-gray-100",
    text: "text-gray-700",
    ring: "ring-gray-200",
    label: status ?? "Unknown",
  };
  const padding =
    size === "xs"
      ? "px-1.5 py-0.5 text-[9px]"
      : size === "md"
      ? "px-2.5 py-1 text-xs"
      : "px-2 py-0.5 text-[10px]";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center rounded-full font-medium uppercase tracking-wide ${tone.bg} ${tone.text} ${padding}`}
      >
        {tone.label}
      </span>
      {showConfidence && typeof confidence === "number" && (
        <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-gray-600)]">
          <span
            className="inline-block h-1 w-12 overflow-hidden rounded-full bg-[var(--color-gray-200)]"
            aria-label={`confidence ${Math.round(confidence * 100)}%`}
          >
            <span
              className={`block h-full ${tone.bg.replace("100", "500")}`}
              style={{ width: `${Math.round(confidence * 100)}%` }}
            />
          </span>
          {Math.round(confidence * 100)}%
        </span>
      )}
    </span>
  );
}
