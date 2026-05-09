"use client";

import { useState } from "react";
import { ExternalLink, ShieldCheck, X } from "lucide-react";

const QMS_BASE = "https://quality.mactechsolutionsllc.com";

const ROLE_STYLES: Record<string, string> = {
  Reviewer:
    "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  Approver:
    "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  "Quality Release":
    "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};

export interface QmsSignatureRef {
  signerName: string | null;
  signerEmail: string | null;
  signedAt: string | null;
  signatureMeaning: string | null;
  documentHash: string | null;
  signatureHash: string | null;
}

export interface DocControlSignatureModalProps {
  qmsDocumentNumber: string;
  qmsSubmissionId: string | null;
  releasedAt: string | null;
  qmsSha256: string | null;
  signatures: QmsSignatureRef[];
}

function shortHash(h: string | null | undefined, n = 16): string {
  if (!h) return "—";
  const cleaned = h.replace(/^sha256:/, "");
  return cleaned.length > n ? `${cleaned.slice(0, n)}…` : cleaned;
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

/**
 * "Open in Doc Control" button + modal for a released SSP.
 *
 * Shows the three QMS-side e-signatures (Reviewer / Approver / Quality
 * Release) with full hash provenance — what a C3PAO sees at the QMS-
 * controlled record. Deep-links to the live QMS read-only view at
 * quality.mactechsolutionsllc.com/documents/by-code/<docId>/view.
 */
export function DocControlSignatureModal({
  qmsDocumentNumber,
  qmsSubmissionId,
  releasedAt,
  qmsSha256,
  signatures,
}: DocControlSignatureModalProps) {
  const [open, setOpen] = useState(false);
  const sortedSigs = [...signatures].sort((a, b) => {
    const order = (m: string | null) =>
      m === "Reviewer" ? 0 : m === "Approver" ? 1 : m === "Quality Release" ? 2 : 3;
    return order(a.signatureMeaning) - order(b.signatureMeaning);
  });
  const qmsViewUrl = `${QMS_BASE}/documents/by-code/${encodeURIComponent(qmsDocumentNumber)}/view`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
      >
        <ShieldCheck className="h-3.5 w-3.5" />
        Open in Doc Control
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Doc Control Release — {qmsDocumentNumber}
                  </h2>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-800 ring-1 ring-emerald-200">
                    EFFECTIVE
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">
                  Released {fmtDateTime(releasedAt)} via QMS Reviewer →
                  Approver → Quality Release chain.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Provenance row */}
            <div className="grid grid-cols-1 gap-3 border-b border-gray-200 px-6 py-4 text-xs sm:grid-cols-3">
              <div>
                <div className="font-medium uppercase tracking-wider text-gray-500">
                  qms_submission_id
                </div>
                <div className="mt-0.5 break-all font-mono text-[11px] text-gray-700">
                  {qmsSubmissionId ?? "—"}
                </div>
              </div>
              <div>
                <div className="font-medium uppercase tracking-wider text-gray-500">
                  qms_sha256
                </div>
                <div
                  className="mt-0.5 font-mono text-[11px] text-gray-700"
                  title={qmsSha256 ?? undefined}
                >
                  {shortHash(qmsSha256, 24)}
                </div>
              </div>
              <div>
                <div className="font-medium uppercase tracking-wider text-gray-500">
                  source
                </div>
                <div className="mt-0.5 text-gray-700">
                  QMS document control
                </div>
              </div>
            </div>

            {/* Signature ledger */}
            <section className="px-6 py-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
                21 CFR Part 11 e-signatures · CMMC L2 release chain
              </h3>
              <p className="mt-1 text-[11px] text-gray-500">
                Three QMS-side signatures verify the document went through
                Reviewer → Approver → Quality Release with separation of
                duties enforced. Hashes are SHA-256 of the canonical
                signature payload at the moment of signing.
              </p>
              {sortedSigs.length === 0 ? (
                <p className="mt-3 italic text-gray-500">No signatures yet.</p>
              ) : (
                <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                          Role
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                          Signer
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                          Signed at
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                          signature_hash
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {sortedSigs.map((s, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2 align-top">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                ROLE_STYLES[s.signatureMeaning ?? ""] ??
                                "bg-gray-100 text-gray-700 ring-1 ring-gray-200"
                              }`}
                            >
                              {s.signatureMeaning ?? "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2 align-top text-gray-900">
                            {s.signerName ?? s.signerEmail ?? "—"}
                            {s.signerEmail && s.signerName ? (
                              <div className="text-[10px] text-gray-500">
                                {s.signerEmail}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 align-top whitespace-nowrap text-gray-700">
                            {fmtDateTime(s.signedAt)}
                          </td>
                          <td
                            className="px-4 py-2 align-top font-mono text-[10px] text-gray-500"
                            title={s.signatureHash ?? undefined}
                          >
                            {shortHash(s.signatureHash, 24)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-6 py-3">
              <p className="text-[11px] text-gray-500">
                Canonical record lives in QMS at{" "}
                <span className="font-mono">{qmsDocumentNumber}</span>.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
                <a
                  href={qmsViewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                >
                  Open beautiful QMS view
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
