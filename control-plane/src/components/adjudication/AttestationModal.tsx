"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSignature, Loader2, X, AlertTriangle, Info } from "lucide-react";
import type { AttestationTemplate } from "@/lib/compliance/attestation-templates";

/**
 * AttestationModal
 *
 * Captures a customer's signature on a specific attestation template. The
 * UX deliberately encourages careful reading:
 *
 *   1. The full attestation statement is shown verbatim (the same text that's
 *      hashed and bound to the signature server-side).
 *   2. The customer must check EVERY condition individually. Submit is disabled
 *      until all are checked.
 *   3. Signatory name + title are required (defaults pre-filled from session).
 *   4. The fallback action ("if a condition becomes false later, X happens")
 *      is shown so the customer understands the commitment isn't permanent
 *      and can be reverted.
 *   5. On success, a confirmation flash is shown and the page is refreshed
 *      so the wizard reflects the closed state.
 */
export function AttestationModal({
  template,
  controlId,
  defaultSignatoryName,
  onClose,
}: {
  template: AttestationTemplate;
  controlId: string;
  defaultSignatoryName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [acceptedConditions, setAcceptedConditions] = useState<Set<number>>(new Set());
  const [signatoryName, setSignatoryName] = useState(defaultSignatoryName);
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [comment, setComment] = useState("");

  const allConditionsAccepted = acceptedConditions.size === template.conditions.length;
  const formValid =
    allConditionsAccepted && signatoryName.trim().length > 0 && signatoryTitle.trim().length > 0;

  // ESC closes
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleCondition(idx: number) {
    setAcceptedConditions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/adjudication/attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.templateId,
          controlId,
          signatoryName: signatoryName.trim(),
          signatoryTitle: signatoryTitle.trim(),
          acceptedConditions: template.conditions, // we send the canonical list since UI checked all
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (HTTP ${res.status})`);
      }
      setSuccess(true);
      // Refresh so the wizard reflects closed state, then close after a beat
      startTransition(() => router.refresh());
      setTimeout(onClose, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record attestation");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="attestation-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-700">
              <FileSignature className="h-3.5 w-3.5" />
              Attestation · {controlId}
            </div>
            <h2 id="attestation-title" className="mt-0.5 text-lg font-semibold text-slate-900">
              {template.title}
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">{template.summary}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {success ? (
            <div className="flex flex-col items-center py-12 text-center">
              <CheckCircle2 className="h-14 w-14 text-emerald-500" />
              <h3 className="mt-3 text-lg font-semibold text-slate-900">Attestation recorded</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-600">
                Control {controlId} is now adjudicated. The signature has been bound to the
                canonical statement and audit-logged.
              </p>
            </div>
          ) : (
            <form id="attestation-form" onSubmit={handleSubmit} className="space-y-5">
              {/* The statement. The canonical text refers to "the date below"
                  — surface today's date so the assertion is truthful at the
                  moment of signing. The same date is bound into the receipt
                  hash server-side. */}
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Attestation Statement (verbatim)
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                  {template.attestationStatement}
                </p>
                <p className="mt-3 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Date:</span>{" "}
                  {new Date().toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </section>

              {/* Conditions checklist */}
              <section>
                <h3 className="text-sm font-semibold text-slate-900">
                  Affirm each of the {template.conditions.length} conditions:
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Check every box. If any condition does not apply to your environment, cancel and
                  use the register-based path instead — your signature would not be defensible.
                </p>
                <ul className="mt-3 space-y-2">
                  {template.conditions.map((c, i) => (
                    <li key={i}>
                      <label
                        className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition ${
                          acceptedConditions.has(i)
                            ? "border-emerald-300 bg-emerald-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={acceptedConditions.has(i)}
                          onChange={() => toggleCondition(i)}
                          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span className="flex-1 text-slate-800">{c}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Fallback warning */}
              <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div className="flex-1 text-xs text-amber-900">
                    <strong>If conditions change later:</strong>{" "}
                    {template.fallbackIfConditionFails.actionRequired} The control will revert to{" "}
                    <span className="font-mono font-semibold">
                      {template.fallbackIfConditionFails.fallbackDisposition}
                    </span>{" "}
                    and we&apos;ll notify your compliance owner.
                  </div>
                </div>
              </section>

              {/* C3PAO note */}
              <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <div className="flex items-start gap-2">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
                  <div className="flex-1 text-xs text-blue-900">
                    <strong>What a C3PAO examiner will ask:</strong>{" "}
                    {template.c3paoExaminerNote}
                  </div>
                </div>
              </section>

              {/* Signatory */}
              <section className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">Signatory name *</span>
                  <input
                    type="text"
                    value={signatoryName}
                    onChange={(e) => setSignatoryName(e.target.value)}
                    required
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-700">Signatory title *</span>
                  <input
                    type="text"
                    value={signatoryTitle}
                    onChange={(e) => setSignatoryTitle(e.target.value)}
                    required
                    placeholder="e.g. Compliance Officer"
                    className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </label>
              </section>

              {/* Optional comment */}
              <label className="block">
                <span className="text-xs font-medium text-slate-700">
                  Comment (optional, included in audit log)
                </span>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </label>

              {error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-6 py-3">
            <p className="text-xs text-slate-500">
              {acceptedConditions.size}/{template.conditions.length} conditions affirmed · Renews
              every {Math.round(template.renewalCadenceDays / 365)} year
              {template.renewalCadenceDays > 365 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="attestation-form"
                disabled={!formValid || submitting}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:bg-slate-300 enabled:hover:bg-blue-700"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Recording…
                  </>
                ) : (
                  <>
                    <FileSignature className="h-4 w-4" />
                    Sign &amp; record
                  </>
                )}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
