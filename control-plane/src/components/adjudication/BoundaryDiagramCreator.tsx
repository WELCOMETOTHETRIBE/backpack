"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateMermaidSource } from "@/lib/compliance/diagram-generator";
import { BOUNDARY_TECHNOLOGY_OPTIONS } from "@/lib/compliance/technical_evidence_requirements";
import { Check } from "lucide-react";

export function BoundaryDiagramCreator() {
  const [selectedTechnologies, setSelectedTechnologies] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const diagramRef = useRef<HTMLDivElement>(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/boundary-profile");
      if (res.ok) {
        const data = await res.json();
        setSelectedTechnologies(data.selectedTechnologies ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const persistProfile = useCallback(async (tech: string[]) => {
    setSaving(true);
    try {
      const res = await fetch("/api/boundary-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTechnologies: tech }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedTechnologies(data.selectedTechnologies ?? []);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  async function generateFromDescription() {
    if (!description.trim()) return;
    setParsing(true);
    try {
      const res = await fetch("/api/boundary/parse-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        const fromLlm = (data.selectedTechnologies ?? []) as string[];
        const merged = [...new Set([...selectedTechnologies, ...fromLlm])];
        await persistProfile(merged);
      }
    } finally {
      setParsing(false);
    }
  }

  function toggleTechnology(value: string) {
    const set = new Set(selectedTechnologies);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    persistProfile([...set]);
  }

  const mermaidSource = generateMermaidSource(selectedTechnologies);

  useEffect(() => {
    if (!diagramRef.current || !mermaidSource) return;
    const el = diagramRef.current;
    el.innerHTML = "";
    const pre = document.createElement("pre");
    pre.className = "mermaid";
    pre.textContent = mermaidSource;
    el.appendChild(pre);
    import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({ startOnLoad: false });
      mermaid.run({ nodes: [pre], suppressErrors: true }).catch(() => {});
    });
  }, [mermaidSource]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-slate-200 bg-white p-6">
        <p className="text-sm text-slate-600">Loading boundary…</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">
          AI Boundary Diagram Creator
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Describe your environment or pick technologies to define your CUI boundary.
        </p>
      </div>
      <div className="grid gap-6 p-4 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700">
              Describe your environment (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. We have Azure Government, 50 Windows laptops managed by Intune, Entra ID, and Microsoft Defender."
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#3B82F6] focus:outline-none focus:ring-1 focus:ring-[#3B82F6]"
            />
            <button
              type="button"
              onClick={generateFromDescription}
              disabled={parsing || !description.trim()}
              className="mt-2 rounded-lg bg-[#0F172A] px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {parsing ? "Parsing…" : "Generate from description"}
            </button>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-slate-700">
              Technology palette — click to add/remove
            </p>
            <div className="max-h-[240px] space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/50 p-2">
              {BOUNDARY_TECHNOLOGY_OPTIONS.map((group) => (
                <div key={group.category}>
                  <p className="text-xs font-semibold text-slate-500">
                    {group.category}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {group.options.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-1.5 rounded border border-slate-200 bg-white px-2 py-1 text-xs hover:border-slate-300"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTechnologies.includes(opt.value)}
                          onChange={() => toggleTechnology(opt.value)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-[#3B82F6]"
                        />
                        <span className="text-slate-800">{opt.label}</span>
                        {selectedTechnologies.includes(opt.value) && (
                          <Check className="h-3.5 w-3.5 text-[#3B82F6]" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {saving && (
              <p className="mt-1 text-xs text-slate-500">Saving…</p>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <p className="mb-2 text-xs font-medium text-slate-700">
            CUI boundary diagram
          </p>
          <div
            ref={diagramRef}
            className="min-h-[280px] rounded-lg border border-slate-200 bg-white p-4 [&_.mermaid]:flex [&_.mermaid]:justify-center"
          />
        </div>
      </div>
    </div>
  );
}
