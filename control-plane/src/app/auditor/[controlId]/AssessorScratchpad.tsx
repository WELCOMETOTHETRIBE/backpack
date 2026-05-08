"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Phase 10 — Assessor scratchpad. Autosaves every 2 seconds of idle.
 * The auditor's recommended verdict is captured INDEPENDENTLY of the CAE
 * engine's verdict — this is the assessor's professional opinion after
 * walking the evidence.
 */

const VERDICTS = [
  { value: "satisfies", label: "Satisfies", tone: "bg-emerald-100 text-emerald-800" },
  { value: "partial", label: "Partial", tone: "bg-amber-100 text-amber-800" },
  { value: "gap", label: "Gap", tone: "bg-red-100 text-red-800" },
  { value: "not_applicable", label: "N/A", tone: "bg-gray-100 text-gray-700" },
] as const;

interface Props {
  assessmentId: string;
  controlId: string;
  initialNotes: string;
  initialVerdict: string | null;
}

export function AssessorScratchpad({
  assessmentId,
  controlId,
  initialNotes,
  initialVerdict,
}: Props) {
  const [notes, setNotes] = useState(initialNotes);
  const [verdict, setVerdict] = useState<string | null>(initialVerdict);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  function scheduleSave(nextNotes: string, nextVerdict: string | null) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving("saving");
      try {
        const res = await fetch("/api/auditor/scratchpad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assessment_id: assessmentId,
            control_id: controlId,
            notes: nextNotes,
            assessor_verdict: nextVerdict,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setSaving("saved");
        setTimeout(() => setSaving("idle"), 1500);
      } catch {
        setSaving("error");
      }
    }, 2000);
  }

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-amber-900">
          Assessor scratchpad
        </h2>
        <span className="text-[10px] uppercase tracking-wide text-amber-700">
          {saving === "saving"
            ? "saving…"
            : saving === "saved"
            ? "saved"
            : saving === "error"
            ? "save failed"
            : "autosaves on idle"}
        </span>
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-medium text-amber-800">
          Your recommended verdict (independent of engine)
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {VERDICTS.map((v) => {
            const active = verdict === v.value;
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => {
                  const next = active ? null : v.value;
                  setVerdict(next);
                  scheduleSave(notes, next);
                }}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  active
                    ? v.tone + " ring-2 ring-offset-1 ring-amber-300"
                    : "bg-white text-amber-800 ring-1 ring-amber-200 hover:ring-amber-300"
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      <textarea
        value={notes}
        onChange={(e) => {
          const next = e.target.value;
          setNotes(next);
          scheduleSave(next, verdict);
        }}
        placeholder="Notes from walking the evidence — gaps, follow-up questions, supporting findings, sign-off rationale. Autosaves on idle."
        rows={6}
        className="mt-3 block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm leading-relaxed text-amber-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
      />
    </div>
  );
}
