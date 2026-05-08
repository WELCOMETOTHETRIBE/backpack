"use client";

/**
 * Unified status pill for the three distinct status enums in the codex.
 *
 * Pick the right `kind` for the data:
 * - `kind="implementation"` (default) — SCTM control implementation status:
 *   not_started | in_progress | implemented | assessed | inherited | not_applicable
 * - `kind="adjudication"` — Phase 7 CAE verdict for a control:
 *   satisfies | partial | gap | at_risk (optional `confidence` 0..1 renders a bar)
 * - `kind="lifecycle"` — §1 register-entry lifecycle_state:
 *   draft | admin_signed | isso_verified | escalated | disputed | resolved |
 *   void | auto_recorded | auto_recorded_legacy | isso_flagged | admin_resolved
 *
 * The three enums are intentionally independent — they describe different
 * subjects (a control's intent, a control's observed verdict, a single
 * register entry's review state). This component centralizes the visual
 * treatment so every surface renders them consistently.
 */

type Kind = "implementation" | "adjudication" | "lifecycle";

type Tone = { bg: string; text: string; ring?: string; label: string };

const IMPLEMENTATION_TONES: Record<string, Tone> = {
  not_started: { bg: "bg-gray-100", text: "text-gray-700", label: "NOT STARTED" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-800", label: "IN PROGRESS" },
  implemented: { bg: "bg-blue-100", text: "text-blue-800", label: "IMPLEMENTED" },
  assessed: { bg: "bg-green-100", text: "text-green-800", label: "ASSESSED" },
  inherited: { bg: "bg-slate-100", text: "text-slate-800", label: "INHERITED" },
  not_applicable: { bg: "bg-zinc-100", text: "text-zinc-700", label: "N/A" },
};

const ADJUDICATION_TONES: Record<string, Tone> = {
  satisfies: { bg: "bg-emerald-100", text: "text-emerald-800", ring: "ring-emerald-200", label: "Satisfies" },
  partial: { bg: "bg-amber-100", text: "text-amber-800", ring: "ring-amber-200", label: "Partial" },
  at_risk: { bg: "bg-blue-100", text: "text-blue-800", ring: "ring-blue-200", label: "At risk" },
  gap: { bg: "bg-red-100", text: "text-red-800", ring: "ring-red-200", label: "Gap" },
};

const LIFECYCLE_TONES: Record<string, Tone> = {
  draft: { bg: "bg-amber-100", text: "text-amber-800", label: "Draft" },
  admin_signed: { bg: "bg-blue-100", text: "text-blue-800", label: "Admin Signed" },
  isso_verified: { bg: "bg-emerald-100", text: "text-emerald-800", label: "ISSO Verified" },
  escalated: { bg: "bg-red-100", text: "text-red-800", label: "Escalated" },
  disputed: { bg: "bg-purple-100", text: "text-purple-800", label: "Disputed" },
  resolved: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Resolved" },
  void: { bg: "bg-gray-100", text: "text-gray-600", label: "Void" },
  auto_recorded: { bg: "bg-gray-100", text: "text-gray-700", label: "Auto-recorded" },
  auto_recorded_legacy: { bg: "bg-gray-50", text: "text-gray-600", label: "Auto-recorded (legacy)" },
  isso_flagged: { bg: "bg-amber-100", text: "text-amber-800", label: "ISSO Flagged" },
  admin_resolved: { bg: "bg-blue-100", text: "text-blue-800", label: "Admin Resolved" },
};

const TONE_TABLE: Record<Kind, Record<string, Tone>> = {
  implementation: IMPLEMENTATION_TONES,
  adjudication: ADJUDICATION_TONES,
  lifecycle: LIFECYCLE_TONES,
};

const FALLBACK: Tone = { bg: "bg-gray-100", text: "text-gray-700", label: "Unknown" };

export type StatusBadgeProps = {
  status: string | null | undefined;
  kind?: Kind;
  size?: "xs" | "sm" | "md";
  /** Adjudication-only: 0..1 confidence renders a small bar after the pill. */
  confidence?: number | null;
  /** Adjudication-only: hide the confidence bar even when provided. */
  showConfidence?: boolean;
};

export function StatusBadge({
  status,
  kind = "implementation",
  size = "sm",
  confidence,
  showConfidence = true,
}: StatusBadgeProps) {
  if (kind === "lifecycle" && !status) return null;

  const table = TONE_TABLE[kind];
  const matched = status ? table[status] : undefined;
  const tone: Tone = matched ?? { ...FALLBACK, label: status || FALLBACK.label };

  const padding =
    kind === "implementation"
      ? "rounded px-2 py-0.5 text-xs"
      : size === "xs"
      ? "rounded-full px-1.5 py-0.5 text-[9px]"
      : size === "md"
      ? "rounded-full px-2.5 py-1 text-xs"
      : "rounded-full px-2 py-0.5 text-[10px]";

  const casing = kind === "implementation" ? "" : "uppercase tracking-wide";

  const pill = (
    <span
      className={`inline-flex items-center font-medium ${tone.bg} ${tone.text} ${padding} ${casing}`}
      title={kind === "lifecycle" ? `lifecycle_state: ${status}` : undefined}
    >
      {tone.label}
    </span>
  );

  if (kind !== "adjudication" || !showConfidence || typeof confidence !== "number") {
    return pill;
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      {pill}
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
    </span>
  );
}
