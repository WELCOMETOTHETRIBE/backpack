"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { BOUNDARY_TECHNOLOGY_OPTIONS } from "@/lib/compliance/technical_evidence_requirements";
import type { DiagramSpec } from "@/lib/boundary-diagram/types";
import { Check, Copy, Download, Sparkles, AlertTriangle } from "lucide-react";

type DiagramMode = "executive" | "assessor";

export function BoundaryDiagramCreator() {
  const [selectedTechnologies, setSelectedTechnologies] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [parsing, setParsing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [diagramMode, setDiagramMode] = useState<DiagramMode>("executive");
  const [controlOverlay, setControlOverlay] = useState(false);
  const [diagramData, setDiagramData] = useState<{
    spec: DiagramSpec | null;
    mermaid: string;
    error?: string;
  } | null>(null);
  const [diagramLoading, setDiagramLoading] = useState(true);
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

  const fetchDiagram = useCallback(async () => {
    setDiagramLoading(true);
    try {
      const overlayParam = controlOverlay ? "&overlay=on" : "";
      const res = await fetch(
        `/api/boundary/diagram?mode=${diagramMode}${overlayParam}`
      );
      const data = await res.json();
      setDiagramData({
        spec: data.spec ?? null,
        mermaid: data.mermaid ?? "",
        error: data.error,
      });
    } finally {
      setDiagramLoading(false);
    }
  }, [diagramMode, controlOverlay]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    fetchDiagram();
  }, [fetchDiagram]);

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

  const mermaidSource = diagramData?.mermaid ?? "";
  const spec = diagramData?.spec ?? null;
  const noBoundary = spec === null && diagramData !== null;

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

  const downloadJson = useCallback(() => {
    if (!spec) return;
    const blob = new Blob([JSON.stringify(spec, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "boundary-diagram-spec.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [spec]);

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
              Describe your environment or pick technologies to define your CUI boundary. The diagram is generated from your account boundary (Boundary page).
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
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
              CUI boundary diagram
            </p>
            <div className="flex items-center gap-2">
              <div
                className="inline-flex rounded-lg border border-slate-200 bg-slate-50/80 p-0.5"
                role="tablist"
                aria-label="Diagram mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={diagramMode === "executive"}
                  onClick={() => setDiagramMode("executive")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    diagramMode === "executive"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  Executive
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={diagramMode === "assessor"}
                  onClick={() => setDiagramMode("assessor")}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    diagramMode === "assessor"
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  Assessor
                </button>
              </div>
              <div
                className="inline-flex rounded-lg border border-slate-200 bg-slate-50/80 p-0.5"
                role="group"
                aria-label="Control overlay"
              >
                <button
                  type="button"
                  onClick={() => setControlOverlay(false)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    !controlOverlay
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  Overlay: Off
                </button>
                <button
                  type="button"
                  onClick={() => setControlOverlay(true)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    controlOverlay
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-600 hover:text-slate-800"
                  }`}
                >
                  Overlay: On
                </button>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={copyMermaidToClipboard}
                  disabled={!mermaidSource}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copySuccess ? "Copied" : "Copy Mermaid"}
                </button>
                <button
                  type="button"
                  onClick={downloadJson}
                  disabled={!spec}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download JSON
                </button>
              </div>
            </div>
          </div>
          {diagramMode === "assessor" && spec && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                This diagram is generated from boundary inputs and assumptions. Confirm administrative path and external connections.
              </p>
            </div>
          )}
          {diagramMode === "assessor" && spec && spec.creditable === false && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-100/90 px-3 py-2 text-xs font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Assessor diagram not creditable until required assumptions are confirmed.
              </p>
            </div>
          )}
          {diagramLoading ? (
            <div className="min-h-[280px] flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50/50">
              <p className="text-sm text-slate-600">Loading diagram…</p>
            </div>
          ) : noBoundary ? (
            <div className="min-h-[280px] flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-6 text-center">
              <p className="text-sm text-slate-600">
                Define your boundary on the Boundary page to generate the diagram.
              </p>
              <Link
                href="/boundary"
                className="text-sm font-medium text-slate-800 underline hover:no-underline"
              >
                Go to Boundary page
              </Link>
            </div>
          ) : (
            <div
              ref={diagramRef}
              className="min-h-[280px] rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/80 to-white p-5 [&_.mermaid]:flex [&_.mermaid]:justify-center [&_.mermaid_svg]:max-w-full"
            />
          )}
          {diagramMode === "assessor" && spec && spec.scope_strip && (
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                Scope
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    In Scope
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-700">
                    {spec.scope_strip.in_scope.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-slate-600">
                    Out of Scope
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-700">
                    {spec.scope_strip.out_of_scope.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                  {spec.scope_strip.explicit_exclusions &&
                    spec.scope_strip.explicit_exclusions.length > 0 && (
                      <div className="mt-2 rounded border border-amber-200 bg-amber-50/80 px-2 py-1.5">
                        <p className="text-xs font-semibold text-amber-900">
                          Explicit exclusions
                        </p>
                        <ul className="mt-0.5 list-inside list-disc text-xs text-amber-800">
                          {spec.scope_strip.explicit_exclusions.map(
                            (item, i) => (
                              <li key={i}>{item}</li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}
          {diagramMode === "assessor" && spec && spec.external_connections.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                External connections
              </h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="px-3 py-2 font-medium text-slate-700">Source</th>
                      <th className="px-3 py-2 font-medium text-slate-700">Destination</th>
                      <th className="px-3 py-2 font-medium text-slate-700">Purpose</th>
                      <th className="px-3 py-2 font-medium text-slate-700">Data Type</th>
                      <th className="px-3 py-2 font-medium text-slate-700">Protocol / Ports</th>
                      <th className="px-3 py-2 font-medium text-slate-700">Encryption</th>
                      <th className="px-3 py-2 font-medium text-slate-700">Auth</th>
                      <th className="px-3 py-2 font-medium text-slate-700">Approval</th>
                      <th className="px-3 py-2 font-medium text-slate-700">CUI leaves boundary?</th>
                      <th className="px-3 py-2 font-medium text-slate-700">Controls hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spec.external_connections.map((row) => (
                      <tr key={row.connection_id} className="border-b border-slate-100">
                        <td className="px-3 py-2 text-slate-600">{row.source_zone}</td>
                        <td className="px-3 py-2 text-slate-600">{row.dest_zone}</td>
                        <td className="px-3 py-2 text-slate-700">{row.purpose}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {row.data_type ?? "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{row.protocol_ports}</td>
                        <td className="px-3 py-2 text-slate-600">{row.encryption}</td>
                        <td className="px-3 py-2 text-slate-600">{row.auth}</td>
                        <td className="px-3 py-2 text-slate-600">
                          {row.approval_required ? "Yes" : "No"}
                        </td>
                        <td className="px-3 py-2">
                          {row.cui_crosses_boundary ? (
                            <span className="font-medium text-amber-700">YES</span>
                          ) : (
                            <span className="text-slate-600">NO</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">
                          {row.controls_hint.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {diagramMode === "assessor" && spec && spec.assumption_checks && spec.assumption_checks.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                Assumptions
              </h3>
              <p className="mb-2 text-xs text-slate-500">
                Confirm assumptions on /boundary by updating boundaryInput.assumption_confirmations.
              </p>
              <div className="space-y-2">
                {spec.assumption_checks.map((check) => (
                  <div
                    key={check.id}
                    className="flex items-start justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs"
                  >
                    <span className="text-slate-700">{check.statement}</span>
                    <span
                      className={
                        check.confirmed
                          ? "shrink-0 font-medium text-emerald-600"
                          : "shrink-0 font-medium text-slate-500"
                      }
                    >
                      {check.confirmed ? "Confirmed Yes" : "No"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {diagramMode === "assessor" && spec && !spec.assumption_checks?.length && spec.assumptions.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">
                Assumptions
              </h3>
              <ul className="list-inside list-disc space-y-1 text-xs text-slate-600">
                {spec.assumptions.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
