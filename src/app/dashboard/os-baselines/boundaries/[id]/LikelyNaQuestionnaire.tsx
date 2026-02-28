"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import {
  LIKELY_NA_CONTROL_DEFS,
  LIKELY_NA_RATIONALE_OPTIONS,
  type LikelyNaControlId,
} from "@/lib/compliance/likely-na-controls";

export type InitialRecord = {
  controlId: string;
  implementationStatus: string;
  governanceNarrative: string | null;
};

export function LikelyNaQuestionnaire({
  boundaryId: _boundaryId,
  initialRecords,
}: {
  boundaryId: string;
  initialRecords: InitialRecord[];
}) {
  const router = useRouter();
  const recordsByControlId = Object.fromEntries(
    initialRecords.map((r) => [r.controlId, r])
  );
  const [ensured, setEnsured] = useState(false);
  const ensuringRef = useRef(false);

  const [answer, setAnswer] = useState<Record<string, "yes" | "no">>({});
  const [rationale, setRationale] = useState<Record<string, string>>({});
  const [rationaleOther, setRationaleOther] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [reverting, setReverting] = useState<string | null>(null);

  async function ensureControlRecords() {
    if (ensured || ensuringRef.current) return;
    ensuringRef.current = true;
    try {
      const res = await fetch("/api/control-records/ensure", { method: "POST" });
      if (res.ok) setEnsured(true);
    } finally {
      ensuringRef.current = false;
    }
  }

  async function markAsNa(controlId: LikelyNaControlId) {
    const selected = rationale[controlId] ?? LIKELY_NA_RATIONALE_OPTIONS[0];
    const other = (rationaleOther[controlId] ?? "").trim();
    const governanceNarrative = other ? `${selected}\n${other}` : selected;

    setSaving(controlId);
    try {
      await ensureControlRecords();
      const res = await fetch(`/api/governance/controls/${controlId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          implementationStatus: "not_applicable",
          governanceNarrative,
        }),
      });
      if (res.ok) {
        setRationale((prev) => ({ ...prev, [controlId]: selected }));
        setRationaleOther((prev) => ({ ...prev, [controlId]: "" }));
        router.refresh();
      }
    } finally {
      setSaving(null);
    }
  }

  async function revertToNotStarted(controlId: string) {
    setReverting(controlId);
    try {
      const res = await fetch(`/api/governance/controls/${controlId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          implementationStatus: "not_started",
          governanceNarrative: null,
        }),
      });
      if (res.ok) {
        setAnswer((prev) => {
          const next = { ...prev };
          delete next[controlId];
          return next;
        });
        router.refresh();
      }
    } finally {
      setReverting(null);
    }
  }

  const cardClass =
    "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

  return (
    <section className={cardClass}>
      <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
        Controls that may not apply
      </h2>
      <p className="mt-1 text-sm text-[var(--color-gray-600)]">
        Answer below for this system boundary. If a control doesn’t apply,
        choose a reason and mark it N/A.
      </p>
      <ul className="mt-5 space-y-5">
        {LIKELY_NA_CONTROL_DEFS.map((def) => {
          const record = recordsByControlId[def.controlId];
          const isNa = record?.implementationStatus === "not_applicable";
          const answeredNo = answer[def.controlId] === "no";

          return (
            <li
              key={def.controlId}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-gray-50)]/50 p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-sm font-medium text-[var(--color-gray-700)]">
                  {def.controlId}
                </span>
                <span className="text-sm text-[var(--color-gray-600)]">
                  {def.title}
                </span>
                {isNa && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                    Marked N/A
                  </span>
                )}
              </div>

              {isNa ? (
                <div className="mt-3">
                  {record.governanceNarrative && (
                    <p className="text-sm text-[var(--color-gray-600)]">
                      {record.governanceNarrative.split("\n")[0]}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => revertToNotStarted(def.controlId)}
                    disabled={reverting === def.controlId}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--color-gray-600)] hover:underline disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {reverting === def.controlId ? "Reverting…" : "Revert to not started"}
                  </button>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm font-medium text-[var(--color-gray-800)]">
                    {def.question}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setAnswer((prev) => ({ ...prev, [def.controlId]: "yes" }))
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-medium ${
                        answer[def.controlId] === "yes"
                          ? "border-green-500 bg-green-50 text-green-800"
                          : "border-[var(--color-border)] bg-white text-[var(--color-gray-700)] hover:border-green-300"
                      }`}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Yes
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAnswer((prev) => ({ ...prev, [def.controlId]: "no" }))
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 text-sm font-medium ${
                        answer[def.controlId] === "no"
                          ? "border-amber-500 bg-amber-100 text-amber-800"
                          : "border-[var(--color-border)] bg-white text-[var(--color-gray-700)] hover:border-amber-300"
                      }`}
                    >
                      <XCircle className="h-4 w-4" /> No
                    </button>
                  </div>

                  {answeredNo && (
                    <div className="mt-4 space-y-3 border-t border-[var(--color-border)] pt-4">
                      <div>
                        <label
                          htmlFor={`reason-${def.controlId}`}
                          className="mb-1 block text-sm font-medium text-[var(--color-gray-700)]"
                        >
                          Why doesn’t this control apply?
                        </label>
                        <select
                          id={`reason-${def.controlId}`}
                          value={rationale[def.controlId] ?? LIKELY_NA_RATIONALE_OPTIONS[0]}
                          onChange={(e) =>
                            setRationale((prev) => ({
                              ...prev,
                              [def.controlId]: e.target.value,
                            }))
                          }
                          className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-gray-800)]"
                        >
                          {LIKELY_NA_RATIONALE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`other-${def.controlId}`}
                          className="mb-1 block text-sm font-medium text-[var(--color-gray-700)]"
                        >
                          Additional details (optional)
                        </label>
                        <textarea
                          id={`other-${def.controlId}`}
                          rows={2}
                          value={rationaleOther[def.controlId] ?? ""}
                          onChange={(e) =>
                            setRationaleOther((prev) => ({
                              ...prev,
                              [def.controlId]: e.target.value,
                            }))
                          }
                          placeholder="e.g. No wireless in this enclave."
                          className="w-full max-w-md rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-gray-800)] placeholder:text-[var(--color-gray-400)]"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => markAsNa(def.controlId)}
                        disabled={saving === def.controlId}
                        className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                      >
                        {saving === def.controlId ? "Saving…" : "Mark as N/A"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
