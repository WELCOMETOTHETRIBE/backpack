"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const DEFAULT_BOUNDARY_JSON = `{
  "hosting_model": "IaaS",
  "provider": "Azure",
  "environment": "Government",
  "services_enabled": {},
  "gate_answers": {}
}`;

interface BoundaryResponse {
  current_boundary: Record<string, unknown> | null;
  boundary_id: string | null;
  allocation_hash_current: string | null;
  latest_snapshot: {
    created_at: string;
    allocation_hash: string;
    counts: { inherited: number; shared: number; customer: number; notApplicable: number } | null;
    assurance_context: { provider_assurance_target?: string; customer_must_confirm_scope?: boolean } | null;
    warnings: { sensitivity_warnings: unknown[]; secondary_layer_warnings: unknown[] };
  } | null;
  provider_capability_matrix: {
    inherited_layer_count: number;
    services_for_shared: Array<{
      service_key: string;
      display_name: string;
      required_gate_count: number;
      optional_gate_count: number;
      coverage_layer_count: number;
    }>;
    configured_but_not_creditable_risks?: Array<{
      service_key: string;
      display_name?: string;
      missing_required_gates: string[];
    }>;
  } | null;
}

interface EvidenceRun {
  id: string;
  runId: string;
  systemId: string;
  collectedAt: string;
  collectorName: string;
  collectorVersion: string;
  source: string | null;
}

interface AllocationItem {
  control_id: string;
  status: string;
  layer: string;
  rationale?: { rule?: string; contributing_services?: string[] };
}

interface FindingItem {
  control_id: string;
  pass: boolean;
  observed: string;
  expected: string;
  evidence_hint: string;
  evidence_files_used: string[];
  provider_or_customer: string;
  layer: string | null;
  collected_at: string;
  source: string | null;
  run_id: string;
  freshness_status?: "fresh" | "stale" | "unknown";
  freshness_days?: number | null;
  freshness_cutoff_utc?: string | null;
}

interface FreshnessSummary {
  fresh: number;
  stale: number;
  unknown: number;
  top_stale_layers?: string[];
}

interface PutResponse {
  boundary_id?: string;
  allocation_hash?: string;
  assurance_context?: unknown;
  counts?: { inherited: number; shared: number; customer: number; notApplicable: number };
  sensitivity_warnings?: unknown[];
  secondary_layer_warnings?: unknown[];
  configured_but_not_creditable_risks?: Array<{
    service_key: string;
    display_name?: string;
    missing_required_gates: string[];
  }>;
  drift?: { drifted: boolean; reason: string };
  error?: string;
}

interface ControlStatusRow {
  control_id: string;
  allocation_status: string;
  latest_evidence_status: string;
  freshness_status: "fresh" | "stale" | "unknown";
  synthesized_status: string;
}

interface ControlStatusResponse {
  boundary_id: string;
  allocation_hash_current: string | null;
  latest_snapshot_created_at: string | null;
  latest_evidence_runs: Array<{ source: string; run_id: string; created_at: string }>;
  rows: ControlStatusRow[];
  error?: string;
}

export default function BoundaryPage() {
  const [data, setData] = useState<BoundaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [textarea, setTextarea] = useState(DEFAULT_BOUNDARY_JSON);
  const [saving, setSaving] = useState(false);
  const [putResult, setPutResult] = useState<PutResponse | null>(null);
  const [evidenceRuns, setEvidenceRuns] = useState<EvidenceRun[]>([]);
  const [allocations, setAllocations] = useState<AllocationItem[]>([]);
  const [controlLookupId, setControlLookupId] = useState("");
  const [controlFindings, setControlFindings] = useState<FindingItem[] | null>(null);
  const [controlLookupLoading, setControlLookupLoading] = useState(false);
  const [freshnessSummary, setFreshnessSummary] = useState<FreshnessSummary | null>(null);
  const [controlStatusData, setControlStatusData] = useState<ControlStatusResponse | null>(null);
  const [controlStatusLoading, setControlStatusLoading] = useState(false);
  const [controlStatusError, setControlStatusError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/boundary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setData(d ?? null);
        if (d?.current_boundary) {
          setTextarea(JSON.stringify(d.current_boundary, null, 2));
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/boundary/evidence/runs")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((d) => setEvidenceRuns(d.runs ?? []));
  }, []);

  useEffect(() => {
    fetch("/api/boundary/allocation")
      .then((r) => (r.ok ? r.json() : { allocations: [] }))
      .then((d) => setAllocations(d.allocations ?? []));
  }, []);

  useEffect(() => {
    fetch("/api/boundary/evidence/freshness-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setFreshnessSummary(d ?? null));
  }, []);

  function fetchControlStatus() {
    setControlStatusLoading(true);
    setControlStatusError(null);
    fetch("/api/boundary/control-status")
      .then((r) => r.json().then((d: ControlStatusResponse & { error?: string }) => {
        if (!r.ok) throw new Error(d?.error ?? "Failed to load");
        return d;
      }))
      .then((d: ControlStatusResponse) => setControlStatusData(d))
      .catch((e) => setControlStatusError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setControlStatusLoading(false));
  }

  function doControlLookup() {
    const id = controlLookupId.trim();
    if (!id) return;
    setControlLookupLoading(true);
    setControlFindings(null);
    fetch(`/api/boundary/evidence/findings?control_id=${encodeURIComponent(id)}`)
      .then((r) => (r.ok ? r.json() : { findings: [] }))
      .then((d) => {
        setControlFindings(d.findings ?? []);
      })
      .finally(() => setControlLookupLoading(false));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setPutResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(textarea);
    } catch {
      setPutResult({ error: "Invalid JSON" });
      setSaving(false);
      return;
    }
    fetch("/api/boundary", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boundary: parsed }),
    })
      .then((r) => r.json())
      .then((res) => {
        setPutResult(res);
        if (!res.error) {
          return fetch("/api/boundary").then((r) => r.json());
        }
        return null;
      })
      .then((d) => {
        if (d) {
          setData(d);
          setTextarea(JSON.stringify(d.current_boundary ?? {}, null, 2));
        }
      })
      .finally(() => setSaving(false));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <p className="text-slate-600">Loading boundary…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Boundary (allocation)</h1>
          <Link
            href="/boundary/history"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Snapshot history
          </Link>
        </div>

        <p className="text-slate-600">
          One boundary per account. Submit a single-provider BoundaryInput (e.g. Azure Government IaaS).
          Allocation snapshots are stored on each save.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Boundary JSON</label>
            <textarea
              className="mt-1 w-full rounded-md border border-slate-300 p-3 font-mono text-sm"
              rows={14}
              value={textarea}
              onChange={(e) => setTextarea(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save boundary"}
          </button>
        </form>

        {putResult?.error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {putResult.error}
          </div>
        )}

        {putResult && !putResult.error && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Last save result</h2>
            {putResult.drift && (
              <p className="mt-2 text-sm">
                Drift: {putResult.drift.drifted ? "Yes (" + putResult.drift.reason + ")" : "None"}
              </p>
            )}
            {putResult.counts && (
              <p className="mt-1 text-sm text-slate-600">
                Counts — Inherited: {putResult.counts.inherited}, Shared: {putResult.counts.shared},
                Customer: {putResult.counts.customer}, N/A: {putResult.counts.notApplicable}
              </p>
            )}
            {putResult.assurance_context != null && (
              <pre className="mt-2 overflow-auto rounded bg-slate-100 p-2 text-xs">
                {JSON.stringify(putResult.assurance_context, null, 2)}
              </pre>
            )}
            {(putResult.configured_but_not_creditable_risks?.length ?? 0) > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-slate-700">Configured but not creditable</p>
                <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                  {putResult.configured_but_not_creditable_risks!.map((r) => (
                    <li key={r.service_key}>
                      {r.display_name ?? r.service_key}: missing gates —{" "}
                      {r.missing_required_gates.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {data?.provider_capability_matrix && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Provider capability matrix</h2>
            <p className="mt-1 text-sm text-slate-600">
              Inherited layers: {data.provider_capability_matrix.inherited_layer_count}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-700">Services for shared coverage</p>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              {data.provider_capability_matrix.services_for_shared.map((s) => (
                <li key={s.service_key}>
                  {s.display_name} — required gates: {s.required_gate_count}, optional:{" "}
                  {s.optional_gate_count}, layers: {s.coverage_layer_count}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data?.latest_snapshot && !putResult && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Latest snapshot</h2>
            <p className="mt-1 text-sm text-slate-600">
              {new Date(data.latest_snapshot.created_at).toLocaleString()} — hash:{" "}
              {data.latest_snapshot.allocation_hash?.slice(0, 16)}…
            </p>
            {data.latest_snapshot.counts && (
              <p className="mt-1 text-sm">
                Inherited: {data.latest_snapshot.counts.inherited}, Shared:{" "}
                {data.latest_snapshot.counts.shared}, Customer: {data.latest_snapshot.counts.customer}
              </p>
            )}
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Latest evidence runs</h2>
          <p className="mt-1 text-sm text-slate-600">
            Runs for this boundary (azure_entra, windows_server_hardening).
          </p>
          {freshnessSummary != null &&
            (freshnessSummary.fresh + freshnessSummary.stale + freshnessSummary.unknown) > 0 && (
              <p className="mt-2 text-sm text-slate-600">
                Freshness:{" "}
                {freshnessSummary.stale === 0
                  ? "All fresh"
                  : `${Math.round(
                      (freshnessSummary.stale /
                        (freshnessSummary.fresh + freshnessSummary.stale + freshnessSummary.unknown)) *
                        100
                    )}% stale`}
                {freshnessSummary.stale > 0 &&
                  freshnessSummary.top_stale_layers?.length &&
                  ` (e.g. ${freshnessSummary.top_stale_layers.slice(0, 3).join(", ")})`}
              </p>
            )}
          {evidenceRuns.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No evidence runs for this boundary yet.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {evidenceRuns.slice(0, 10).map((r) => (
                <li key={r.id} className="flex flex-wrap gap-x-2 gap-y-0">
                  <span className="font-mono text-slate-700">{r.runId}</span>
                  <span className="text-slate-500">
                    {new Date(r.collectedAt).toLocaleString()} — {r.collectorName} {r.collectorVersion}
                  </span>
                  {r.source && r.source !== "legacy" && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {r.source}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Control status</h2>
          <p className="mt-1 text-sm text-slate-600">
            Synthesized status per control (allocation + evidence + freshness).
          </p>
          <button
            type="button"
            onClick={fetchControlStatus}
            disabled={controlStatusLoading}
            className="mt-3 rounded-md bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
          >
            {controlStatusLoading ? "Loading…" : "Load control status"}
          </button>
          {controlStatusError && (
            <p className="mt-2 text-sm text-red-600">{controlStatusError}</p>
          )}
          {controlStatusData && !controlStatusError && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full border-collapse border border-slate-200 text-sm">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-200 px-2 py-1.5 text-left font-medium text-slate-700">
                      Control ID
                    </th>
                    <th className="border border-slate-200 px-2 py-1.5 text-left font-medium text-slate-700">
                      Allocation
                    </th>
                    <th className="border border-slate-200 px-2 py-1.5 text-left font-medium text-slate-700">
                      Evidence
                    </th>
                    <th className="border border-slate-200 px-2 py-1.5 text-left font-medium text-slate-700">
                      Freshness
                    </th>
                    <th className="border border-slate-200 px-2 py-1.5 text-left font-medium text-slate-700">
                      Synthesized Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {controlStatusData.rows.map((row) => (
                    <tr key={row.control_id} className="bg-white">
                      <td className="border border-slate-200 px-2 py-1.5 font-mono text-slate-800">
                        {row.control_id}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                        {row.allocation_status}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5 text-slate-700">
                        {row.latest_evidence_status}
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5">
                        <span
                          className={
                            row.freshness_status === "stale"
                              ? "text-amber-700"
                              : row.freshness_status === "fresh"
                                ? "text-green-700"
                                : "text-slate-500"
                          }
                        >
                          {row.freshness_status}
                        </span>
                      </td>
                      <td className="border border-slate-200 px-2 py-1.5">
                        <span
                          className={
                            row.synthesized_status === "Compliant"
                              ? "text-green-700 font-medium"
                              : row.synthesized_status === "Non-Compliant"
                                ? "text-red-700 font-medium"
                                : row.synthesized_status === "Stale"
                                  ? "text-amber-700"
                                  : "text-slate-600"
                          }
                        >
                          {row.synthesized_status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Control lookup</h2>
          <p className="mt-1 text-sm text-slate-600">
            Allocation status and latest evidence findings for a control (e.g. SC.L2-3.13.11).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Control ID"
              className="rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm"
              value={controlLookupId}
              onChange={(e) => setControlLookupId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doControlLookup()}
            />
            <button
              type="button"
              onClick={doControlLookup}
              disabled={controlLookupLoading || !controlLookupId.trim()}
              className="rounded-md bg-slate-700 px-3 py-1.5 text-sm text-white hover:bg-slate-600 disabled:opacity-50"
            >
              {controlLookupLoading ? "Loading…" : "Look up"}
            </button>
          </div>
          {(controlLookupId.trim() || controlFindings !== null) && controlLookupId.trim() && (
            <div className="mt-4 space-y-4">
              {allocations.length > 0 && (() => {
                const id = controlLookupId.trim();
                const alloc = allocations.find(
                  (a) => a.control_id === id || a.control_id === id.replace(/^[A-Z]+\.L2-/, "")
                );
                if (!alloc) return null;
                return (
                  <div>
                    <h3 className="text-sm font-medium text-slate-700">Allocation</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Status: <strong>{alloc.status}</strong> — Layer: {alloc.layer}
                      {alloc.rationale?.rule && ` — Rule: ${alloc.rationale.rule}`}
                    </p>
                  </div>
                );
              })()}
              {controlFindings !== null && (
                <div>
                  <h3 className="text-sm font-medium text-slate-700">Latest evidence findings</h3>
                  {controlFindings.length === 0 ? (
                    <p className="mt-1 text-sm text-slate-500">No findings for this control.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {controlFindings.map((f, i) => (
                        <li
                          key={i}
                          className="rounded-md border border-slate-200 bg-slate-50/50 p-3 text-sm"
                        >
                          <span className={f.pass ? "text-green-700" : "text-red-700"}>
                            {f.pass ? "PASS" : "FAIL"}
                          </span>
                          {f.freshness_status && f.freshness_status !== "unknown" && (
                            <span className="ml-2 text-slate-600">
                              ({f.freshness_status})
                            </span>
                          )}
                          {f.freshness_status === "stale" && f.freshness_days != null && (
                            <span className="ml-2 text-amber-700">
                              Stale: re-run within {f.freshness_days} days policy
                            </span>
                          )}
                          <span className="ml-2 text-slate-600">Source: {f.source ?? "—"}</span>
                          {f.layer && (
                            <span className="ml-2 text-slate-500">Layer: {f.layer}</span>
                          )}
                          <p className="mt-1 text-slate-700">Observed: {f.observed}</p>
                          <p className="text-slate-600">Expected: {f.expected}</p>
                          <p className="text-slate-500">Hint: {f.evidence_hint}</p>
                          {f.evidence_files_used?.length > 0 && (
                            <p className="mt-1 text-xs text-slate-500">
                              Files: {f.evidence_files_used.join(", ")}
                            </p>
                          )}
                          <p className="text-xs text-slate-400">
                            {f.provider_or_customer} — {new Date(f.collected_at).toLocaleString()}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
