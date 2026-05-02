"use client";

import { useEffect, useState } from "react";
import { X, FileSignature, Hash, Calendar, User, Shield, Loader2, ExternalLink } from "lucide-react";
import Link from "next/link";

/**
 * AttestationReceiptModal -- read-only inspection of a signed attestation.
 *
 * Opens from the artifacts page when the user clicks View on a SIGNED row.
 * Surfaces the same legal text the customer accepted at signing time, the
 * signatory identity + timestamp, and the SHA-256 dataHash that binds the
 * signature to the canonical statement (so a C3PAO can verify the
 * declaration hasn't been edited after the fact).
 */

type Receipt = {
  completionId: string;
  controlId: string;
  templateId: string;
  templateName: string;
  attestationStatement: string;
  conditions: string[];
  fallbackIfConditionFails: {
    description: string;
    revertedDisposition: string;
    actionRequired: string;
  } | null;
  signatory: {
    name: string | null;
    email: string | null;
    comment: string | null;
  };
  attestedAt: string;
  dataHash: string | null;
  signatureCrypto: string | null;
};

export function AttestationReceiptModal({
  completionId,
  onClose,
}: {
  completionId: string;
  onClose: () => void;
}) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hashCopied, setHashCopied] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/adjudication/attest/receipt/${encodeURIComponent(completionId)}`,
          { signal: ac.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(await res.text());
        setReceipt((await res.json()) as Receipt);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Failed to load receipt");
      } finally {
        setLoading(false);
      }
    })();
    return () => ac.abort();
  }, [completionId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function copyHash() {
    if (!receipt?.dataHash) return;
    navigator.clipboard.writeText(receipt.dataHash).then(() => {
      setHashCopied(true);
      setTimeout(() => setHashCopied(false), 1500);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="receipt-title"
      >
        <header className="flex items-start gap-3 border-b border-slate-200 px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100">
            <FileSignature className="h-5 w-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 id="receipt-title" className="text-base font-semibold text-slate-900">
              Signed attestation receipt
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Immutable record of the customer&apos;s declaration. The SHA-256
              hash binds the signature to the exact text below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="ml-2 text-sm">Loading receipt…</span>
            </div>
          ) : error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </p>
          ) : receipt ? (
            <div className="space-y-5 text-sm">
              {/* Headline metadata */}
              <div className="grid grid-cols-2 gap-3">
                <Meta
                  icon={<Shield className="h-3.5 w-3.5" />}
                  label="Control"
                  value={receipt.controlId}
                  mono
                />
                <Meta
                  icon={<FileSignature className="h-3.5 w-3.5" />}
                  label="Template"
                  value={receipt.templateName}
                />
                <Meta
                  icon={<User className="h-3.5 w-3.5" />}
                  label="Signed by"
                  value={
                    receipt.signatory.name
                      ? `${receipt.signatory.name}${receipt.signatory.email ? ` · ${receipt.signatory.email}` : ""}`
                      : (receipt.signatory.email ?? "(unknown)")
                  }
                />
                <Meta
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Signed at"
                  value={new Date(receipt.attestedAt).toLocaleString()}
                />
              </div>

              {/* Attestation statement -- the legal text the customer accepted */}
              <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Attestation statement
                </h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-800">
                  {receipt.attestationStatement || "(no statement recorded)"}
                </p>
              </section>

              {/* Conditions the customer accepted individually */}
              {receipt.conditions.length > 0 && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Conditions accepted
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {receipt.conditions.map((c, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                          ✓
                        </span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Fallback consequence if the asserted condition becomes false */}
              {receipt.fallbackIfConditionFails && (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <h3 className="font-semibold">If a condition becomes false later</h3>
                  <p className="mt-1">{receipt.fallbackIfConditionFails.description}</p>
                  <p className="mt-1">
                    Reverts to: <strong>{receipt.fallbackIfConditionFails.revertedDisposition}</strong>{" "}
                    · then: {receipt.fallbackIfConditionFails.actionRequired}
                  </p>
                </section>
              )}

              {/* Optional comment captured at signing time */}
              {receipt.signatory.comment && (
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Signing comment
                  </h3>
                  <p className="mt-2 whitespace-pre-line rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    {receipt.signatory.comment}
                  </p>
                </section>
              )}

              {/* Immutable hash -- proves the signature is bound to the exact statement */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Immutable hash
                </h3>
                <div className="mt-2 flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                  <Hash className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <code className="flex-1 break-all font-mono text-[11px] text-slate-800">
                    {receipt.dataHash ?? "(no hash recorded)"}
                  </code>
                  {receipt.dataHash && (
                    <button
                      type="button"
                      onClick={copyHash}
                      className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      {hashCopied ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  SHA-256 over (templateId, statement, conditions, controlId, signatory, date).
                  If any one of those is altered, the recomputed hash won&apos;t match this value.
                </p>
              </section>
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-3">
          {receipt && (
            <Link
              href={`/dashboard/controls/${encodeURIComponent(receipt.controlId)}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline"
            >
              View control {receipt.controlId}
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-full border border-slate-300 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}

function Meta({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {label}
      </div>
      <div
        className={`mt-0.5 text-sm text-slate-900 ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}
