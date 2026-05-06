/**
 * Renders an entry's §1 `lifecycle_state` (per the Register-Automation v1.1
 * brief) as a colored pill. The raw field is a flat string, so this component
 * standardizes the visual treatment everywhere lifecycle_state appears: entry
 * detail header, registers list, manifest detail entry rows.
 *
 * Allowed values come from the schema enum on the Pattern A entry types
 * (privileged_grant_acknowledgment / change_drift_acknowledgment /
 * defender_alert_acknowledgment) plus the verbosity-helper defaults
 * ("auto_recorded" for Pattern B entries; "auto_recorded_legacy" for entries
 * backfilled by migration 0057).
 */

const TONES: Record<string, { bg: string; text: string; label?: string }> = {
  draft: { bg: "bg-amber-100", text: "text-amber-800", label: "Draft" },
  admin_signed: { bg: "bg-blue-100", text: "text-blue-800", label: "Admin Signed" },
  isso_verified: { bg: "bg-emerald-100", text: "text-emerald-800", label: "ISSO Verified" },
  escalated: { bg: "bg-red-100", text: "text-red-800", label: "Escalated" },
  disputed: { bg: "bg-purple-100", text: "text-purple-800", label: "Disputed" },
  resolved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Resolved" },
  void: { bg: "bg-gray-100", text: "text-gray-600", label: "Void" },
  auto_recorded: { bg: "bg-gray-100", text: "text-gray-700", label: "Auto-recorded" },
  auto_recorded_legacy: {
    bg: "bg-gray-50",
    text: "text-gray-600",
    label: "Auto-recorded (legacy)",
  },
  isso_flagged: { bg: "bg-amber-100", text: "text-amber-800", label: "ISSO Flagged" },
  admin_resolved: { bg: "bg-blue-100", text: "text-blue-800", label: "Admin Resolved" },
};

export function LifecycleStateBadge({
  state,
  size = "sm",
}: {
  state: string | null | undefined;
  size?: "xs" | "sm";
}) {
  if (!state) return null;
  const tone = TONES[state] ?? {
    bg: "bg-gray-100",
    text: "text-gray-700",
    label: state,
  };
  const padding = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium uppercase tracking-wide ${tone.bg} ${tone.text} ${padding}`}
      title={`lifecycle_state: ${state}`}
    >
      {tone.label ?? state}
    </span>
  );
}
