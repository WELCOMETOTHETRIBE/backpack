"use client";

import Link from "next/link";
import { GovernanceWizard } from "@/components/governance-wizard/GovernanceWizard";
import { CheckCircle2, FileText } from "lucide-react";

export type DocumentStats = {
  outstanding: string[];
  uploaded: string[];
  requiredByLabel: Record<string, string[]>;
};

export function GovernanceView({ documentStats }: { documentStats: DocumentStats }) {
  const { outstanding, uploaded, requiredByLabel } = documentStats;

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="text-[14px] font-medium text-slate-600 transition-colors hover:text-[#0F172A]"
          >
            ← Dashboard
          </Link>
          <h1 className="text-base font-semibold tracking-tight text-[#0F172A] sm:text-lg">
            Governance
          </h1>
          <Link
            href="/dashboard/governance-wizard"
            className="text-[14px] font-medium text-slate-600 transition-colors hover:text-[#0F172A]"
          >
            Full hub
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
        <p className="mb-8 text-[15px] text-slate-600">
          Adjudicate and validate your NIST SP 800-171 control compliance. Open a control in the matrix below to answer assessment questions, attach governance evidence, and record your implementation status.
        </p>
      </div>

      <GovernanceWizard skipIntroDefault showReviewButton />

      {/* Governance documents section */}
      <section className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Governance documents
          </h2>
          <p className="mb-6 text-[14px] text-slate-600">
            Policy and procedure documents required by your controls. Upload and link them when you open each control above.
          </p>

          {outstanding.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-slate-800">
                <FileText className="h-4 w-4 text-amber-600" aria-hidden />
                Outstanding ({outstanding.length})
              </h3>
              <ul className="space-y-2">
                {outstanding.map((label) => (
                  <li
                    key={label}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3"
                  >
                    <span className="font-medium text-slate-900">{label}</span>
                    <span className="text-[13px] text-slate-600">
                      Required by: {(requiredByLabel[label] ?? []).slice(0, 5).join(", ")}
                      {(requiredByLabel[label]?.length ?? 0) > 5 && " …"}
                    </span>
                    <Link
                      href="/dashboard/governance-wizard"
                      className="ml-auto shrink-0 text-[13px] font-medium text-[#0F172A] hover:underline"
                    >
                      Open control →
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-slate-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              Uploaded ({uploaded.length})
            </h3>
            {uploaded.length === 0 ? (
              <p className="rounded-xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 text-[14px] text-slate-500">
                No required governance documents uploaded yet. Open a control above to upload evidence.
              </p>
            ) : (
              <ul className="space-y-2">
                {uploaded.map((label) => (
                  <li
                    key={label}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-[0_1px_2px_0_rgba(0,0,0,0.04)]"
                  >
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="font-medium text-slate-900">{label}</span>
                    <span className="text-[13px] text-slate-500">
                      Required by: {(requiredByLabel[label] ?? []).slice(0, 5).join(", ")}
                      {(requiredByLabel[label]?.length ?? 0) > 5 && " …"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
