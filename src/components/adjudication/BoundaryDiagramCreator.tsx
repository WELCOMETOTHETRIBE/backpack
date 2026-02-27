"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { generateMermaidSource } from "@/lib/compliance/diagram-generator";
import { BOUNDARY_TECHNOLOGY_OPTIONS } from "@/lib/compliance/technical_evidence_requirements";
import { Check, Copy, Sparkles } from "lucide-react";

export function BoundaryDiagramCreator() {
  const [selectedTechnologies, setSelectedTechnologies] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
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
      mermaid.initialize({
        startOnLoad: false,
        theme: "neutral",
        flowchart: { useMaxWidth: true, padding: 16 },
        securityLevel: "loose",
      });
      mermaid.run({ nodes: [pre], suppressErrors: true }).catch(() => {});
    });
  }, [mermaidSource]);

  const copyMermaidToClipboard = useCallback(() => {
    if (!mermaidSource) return;
    navigator.clipboard.writeText(mermaidSource).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
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
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lg shadow-slate-200/50">
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">
              CUI Boundary Diagram Creator
            </h2>
            <p className="text-xs text-slate-500">
              Describe your environment or pick technologies to define your CUI boundary. The diagram updates as you select.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-6 p-5 md:grid-cols-2">
        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-slate-500">
              Describe your environment (optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. We have Azure Government, 50 Windows laptops managed by Intune, Entra ID, and Microsoft Defender."
              rows={3}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
            <button
              type="button"
              onClick={generateFromDescription}
              disabled={parsing || !description.trim()}
              className="mt-2 rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:opacity-50"
            >
              {parsing ? "Parsing…" : "Generate from description"}
            </button>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              Technology palette — click to add/remove
            </p>
            <div className="max-h-[260px] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/30 p-3">
              {BOUNDARY_TECHNOLOGY_OPTIONS.map((group) => (
                <div key={group.category}>
                  <p className="text-xs font-semibold text-slate-600">
                    {group.category}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {group.options.map((opt) => (
                      <label
                        key={opt.value}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm transition hover:border-slate-300 hover:shadow"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTechnologies.includes(opt.value)}
                          onChange={() => toggleTechnology(opt.value)}
                          className="h-3.5 w-3.5 rounded border-slate-300 text-slate-700"
                        />
                        <span className="text-slate-800">{opt.label}</span>
                        {selectedTechnologies.includes(opt.value) && (
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {saving && (
              <p className="mt-2 text-xs text-slate-500">Saving…</p>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              CUI boundary diagram
            </p>
            <button
              type="button"
              onClick={copyMermaidToClipboard}
              disabled={!mermaidSource}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Copy className="h-3.5 w-3.5" />
              {copySuccess ? "Copied" : "Copy Mermaid"}
            </button>
          </div>
          <div
            ref={diagramRef}
            className="min-h-[280px] rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-5 [&_.mermaid]:flex [&_.mermaid]:justify-center [&_.mermaid_svg]:max-w-full"
          />
        </div>
      </div>
    </div>
  );
}
