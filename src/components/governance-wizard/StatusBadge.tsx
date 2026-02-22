"use client";

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  not_started: { bg: "bg-gray-100", text: "text-gray-700", label: "NOT STARTED" },
  in_progress: { bg: "bg-amber-100", text: "text-amber-800", label: "IN PROGRESS" },
  implemented: { bg: "bg-blue-100", text: "text-blue-800", label: "IMPLEMENTED" },
  assessed: { bg: "bg-green-100", text: "text-green-800", label: "ASSESSED" },
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.not_started;
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}
