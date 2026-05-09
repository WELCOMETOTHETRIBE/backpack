"use client";

/**
 * Phase 1 of "Send to Doc Control for SSP release."
 *
 * Admin-only CTA on each signed SSP version row. Calls
 * POST /api/ssp/:id/submit-to-doc-control which validates:
 *   - status='signed'
 *   - all three sign-offs present (AO / system_owner / ISSO)
 *   - drift-clean (topLevel === 'identical')
 *   - no in-flight submission already
 * and on success records a row in ssp_doc_control_submissions
 * (status='submitted'). Phase 2 will add the outbound HTTP call to
 * MacTech Quality; Phase 3 will link the released QMS doc back here.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";

interface Props {
  sspDocumentId: string;
  /** Pre-flight gates — used to disable the button + tooltip explain why. */
  canSubmit: boolean;
  blockedReason: string | null;
}

export function SubmitToDocControlButton({
  sspDocumentId,
  canSubmit,
  blockedReason,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (!canSubmit || busy || pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ssp/${sspDocumentId}/submit-to-doc-control`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  const disabled = !canSubmit || busy || pending;
  const title = blockedReason ?? "Submit this signed SSP to MacTech Quality for formal release.";

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={title}
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
          disabled
            ? "bg-gray-100 text-gray-400 ring-1 ring-inset ring-gray-200"
            : "bg-violet-600 text-white hover:bg-violet-700"
        }`}
      >
        <Send className="h-3 w-3" />
        {busy
          ? "Submitting…"
          : pending
            ? "Refreshing…"
            : "Submit to Doc Control"}
      </button>
      {error && (
        <p className="max-w-md text-[10px] text-rose-700">Error: {error}</p>
      )}
    </div>
  );
}
