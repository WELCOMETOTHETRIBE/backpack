"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { ScopingPreset } from "@/lib/compliance/scoping-presets";

interface Props {
  presets: Pick<ScopingPreset, "id" | "label" | "description" | "controls">[];
}

interface ApplyResult {
  applied: number;
  skipped: number;
  applied_controls: string[];
  skipped_controls: string[];
}

export default function ScopingPresetsCard({ presets }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ApplyResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function applyPreset(presetId: string) {
    if (!confirm(`Apply "${presets.find((p) => p.id === presetId)?.label}" preset?\n\nThis will mark the listed controls as Not Applicable. Controls already set to Assessed, Inherited, or Implemented will not be changed.`)) {
      return;
    }
    setLoading(presetId);
    setErrors((e) => ({ ...e, [presetId]: "" }));
    try {
      const res = await fetch("/api/control-records/apply-scoping-preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset_id: presetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors((e) => ({ ...e, [presetId]: data.error ?? `Error ${res.status}` }));
        return;
      }
      setResults((r) => ({ ...r, [presetId]: data as ApplyResult }));
    } catch {
      setErrors((e) => ({ ...e, [presetId]: "Network error — please retry" }));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      {presets.map((preset) => {
        const result = results[preset.id];
        const error = errors[preset.id];
        const isExpanded = expanded === preset.id;
        const isLoading = loading === preset.id;

        return (
          <div key={preset.id} className="rounded-lg border border-slate-200 bg-slate-50">
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-800">{preset.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{preset.description}</p>

                {result && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Applied to {result.applied} control{result.applied !== 1 ? "s" : ""}
                      {result.skipped > 0 && ` · ${result.skipped} skipped (already at terminal status)`}
                    </span>
                  </div>
                )}

                {error && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setExpanded(isExpanded ? null : preset.id)}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  {preset.controls.length} controls
                </button>
                <button
                  onClick={() => applyPreset(preset.id)}
                  disabled={isLoading || !!result}
                  className="inline-flex items-center rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                >
                  {isLoading ? "Applying…" : result ? "Applied" : "Apply"}
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-slate-200 px-4 pb-4 pt-3">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Control</th>
                      <th className="pb-2 pr-4 font-medium">Title</th>
                      <th className="pb-2 font-medium">N/A Justification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preset.controls.map((c) => (
                      <tr key={c.controlId} className="align-top">
                        <td className="py-1.5 pr-4 font-mono text-slate-700 whitespace-nowrap">
                          {c.domain} {c.controlId}
                        </td>
                        <td className="py-1.5 pr-4 text-slate-600 whitespace-nowrap">{c.title}</td>
                        <td className="py-1.5 text-slate-500">{c.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
