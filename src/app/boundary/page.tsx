"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CUI_VAULT_MACTECH_PRESET } from "@/data/boundary-presets";

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
    coverage_hash?: string | null;
    coverage_run_fingerprint?: string | null;
    coverage_collected_at?: string | null;
    snapshot_signature?: string | null;
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
  /** Report integrity hash (Azure/Entra validation report); for auditor verification */
  report_sha256?: string | null;
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

interface TechnicalRationale {
  satisfied_by: "evidenceFinding";
  source?: string;
  run_collected_at?: string;
  run_fingerprint?: string;
  freshness_status?: "fresh" | "stale" | "unknown";
  freshness_days?: number | null;
  freshness_cutoff_utc?: string | null;
  ok: boolean;
  reason?: string;
}

interface ControlStatusRow {
  control_id: string;
  allocation_status: string;
  latest_evidence_status: string;
  freshness_status: "fresh" | "stale" | "unknown";
  synthesized_status: string;
  technical_rationale?: TechnicalRationale;
}

interface ControlStatusResponse {
  boundary_id: string;
  allocation_hash_current: string | null;
  latest_snapshot_created_at: string | null;
  latest_evidence_runs: Array<{ source: string; run_id: string; run_fingerprint?: string; created_at: string }>;
  rows: ControlStatusRow[];
  error?: string;
}

interface EnclaveCoverageSummary {
  source: string;
  evidence_run_id: string;
  run_fingerprint: string;
  collected_at: string;
  totals: {
    enclave_controls: number;
    pass_fresh: number;
    pass_stale: number;
    pass_unknown_layer: number;
    fail: number;
    no_finding: number;
  };
  rows: Array<{ control_id: string; bucket: string; remediation_hint?: string }>;
  top_gaps: {
    unknown_layer: string[];
    stale: string[];
    failed: string[];
    no_finding: string[];
  };
}

function formatTechnicalEvidenceSummary(row: ControlStatusRow): string {
  const r = row.technical_rationale;
  if (!r) return "—";
  if (r.reason === "no_finding") return "—";
  const source = r.source ?? "enclave";
  const date = r.run_collected_at ? new Date(r.run_collected_at).toLocaleDateString() : "—";
  const fp = r.run_fingerprint ? `fp:${r.run_fingerprint.slice(0, 8)}…` : "";
  if (r.reason === "unknown_layer_freshness") {
    return `PASS found but NOT creditable (missing layer mapping) — ${source} ${date}`;
  }
  if (r.reason === "stale_evidence") {
    return `PASS found but stale — rerun required — ${source} ${date} ${fp}`;
  }
  if (r.ok && r.freshness_status === "fresh") {
    return `${source}: PASS (fresh) — ${date} ${fp}`.trim();
  }
  return `${source} — ${date} ${fp}`.trim() || "—";
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
  const [controlArtifactsData, setControlArtifactsData] = useState<{
    control_id: string;
    control_record_id: string;
    required: Array<{ label: string; type: string }>;
    upload_labels: string[];
    completions: Array<{ artifact_label: string; artifact_type: string; value_text?: string; attested_at?: string }>;
  } | null>(null);
  const [artifactSaving, setArtifactSaving] = useState(false);
  const [coverageSummary, setCoverageSummary] = useState<EnclaveCoverageSummary | null>(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageError, setCoverageError] = useState<string | null>(null);
  const [selectedCoverageRunId, setSelectedCoverageRunId] = useState<string | null>(null);
  const [windowsRuns, setWindowsRuns] = useState<Array<{ evidence_run_id: string; collected_at: string; run_fingerprint: string }>>([]);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    reason?: string;
    stored?: { coverageHash: string };
    computed?: { coverageHash: string };
  } | null>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

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

  useEffect(() => {
    fetch("/api/boundary/evidence/runs?source=windows_server_hardening")
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((d) => setWindowsRuns((d.runs ?? []).map((r: { evidence_run_id?: string; id?: string; collected_at?: string; collectedAt?: string; run_fingerprint?: string }) => ({
        evidence_run_id: r.evidence_run_id ?? r.id ?? "",
        collected_at: r.collected_at ?? r.collectedAt ?? "",
        run_fingerprint: r.run_fingerprint ?? "",
      }))));
  }, []);

  useEffect(() => {
    setCoverageLoading(true);
    setCoverageError(null);
    const url = selectedCoverageRunId
      ? `/api/boundary/evidence/coverage?evidence_run_id=${encodeURIComponent(selectedCoverageRunId)}&source=windows_server_hardening`
      : "/api/boundary/evidence/coverage/latest?source=windows_server_hardening";
    fetch(url)
      .then((r) => r.json())
      .then((d: { ok?: boolean; summary?: EnclaveCoverageSummary; error?: string }) => {
        if (!d.ok) {
          setCoverageSummary(null);
          setCoverageError(d.error ?? "No run");
          return;
        }
        setCoverageSummary(d.summary ?? null);
        setCoverageError(null);
      })
      .catch((e) => {
        setCoverageError(e instanceof Error ? e.message : "Failed to load coverage");
        setCoverageSummary(null);
      })
      .finally(() => setCoverageLoading(false));
  }, [selectedCoverageRunId]);

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

  function doControlLookup(overrideId?: string) {
    const id = (overrideId ?? controlLookupId).trim();
    if (!id) return;
    if (overrideId) setControlLookupId(overrideId);
    setControlLookupLoading(true);
    setControlFindings(null);
    setControlArtifactsData(null);
    const nistId = id.replace(/^[A-Z]+\.L2-/, "") || id;
    Promise.all([
      fetch(`/api/boundary/evidence/findings?control_id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : { findings: [] })),
      fetch(`/api/control-records/artifacts?control_id=${encodeURIComponent(nistId)}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([findingsRes, artifactsRes]) => {
        const d = findingsRes as { findings?: FindingItem[] };
        setControlFindings(d.findings ?? []);
        if (artifactsRes && !(artifactsRes as { error?: string }).error) {
          setControlArtifactsData(artifactsRes as NonNullable<typeof controlArtifactsData>);
        } else {
          setControlArtifactsData(null);
        }
      })
      .catch(() => setControlArtifactsData(null))
      .finally(() => setControlLookupLoading(false));
  }

  async function saveArtifactCompletion(
    controlId: string,
    artifactLabel: string,
    artifactType: string,
    valueText?: string
  ) {
    setArtifactSaving(true);
    try {
      const res = await fetch("/api/control-records/artifacts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          control_id: controlId,
          artifact_label: artifactLabel,
          artifact_type: artifactType,
          value_text: valueText ?? (artifactType === "ATTESTATION" ? undefined : ""),
        }),
      });
      if (res.ok && controlLookupId.trim()) doControlLookup();
    } finally {
      setArtifactSaving(false);
    }
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
            <label className="block text-sm font-medium text-slate-700">Load preset</label>
            <select
              className="mt-1 block w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              value=""
              onChange={(e) => {
                const value = e.target.value;
                if (value === "cui_vault_mactech") {
                  setTextarea(JSON.stringify(CUI_VAULT_MACTECH_PRESET, null, 2));
                }
                e.target.value = "";
              }}
            >
              <option value="">— None —</option>
              <option value="cui_vault_mactech">CUI-Vault by MacTech (Windows Server 2025, Azure Gov, full stack)</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Loads preset into the JSON below; click Save to persist.</p>
          </div>
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
                <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="font-mono text-slate-700">{r.runId}</span>
                  <span className="text-slate-500">
                    {new Date(r.collectedAt).toLocaleString()} — {r.collectorName} {r.collectorVersion}
                  </span>
                  {r.source && r.source !== "legacy" && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                      {r.source}
                    </span>
                  )}
                  {r.report_sha256 && (
                    <span className="font-mono text-xs text-slate-500" title={r.report_sha256}>
                      report_sha256: {r.report_sha256.slice(0, 16)}…
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Enclave Evidence Coverage (Windows Hardening)</h2>
          <p className="mt-1 text-sm text-slate-600">
            73-enclave control set: PASS/FAIL/STALE/UNKNOWN-LAYER/NO-FINDING and actionable gaps.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="coverage-run-select" className="text-sm text-slate-600">Select run:</label>
            <select
              id="coverage-run-select"
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              value={selectedCoverageRunId ?? ""}
              onChange={(e) => setSelectedCoverageRunId(e.target.value || null)}
            >
              <option value="">Latest run</option>
              {windowsRuns.map((r) => (
                <option key={r.evidence_run_id} value={r.evidence_run_id}>
                  {new Date(r.collected_at).toLocaleString()}
                </option>
              ))}
            </select>
          </div>
          {coverageLoading && <p className="mt-2 text-sm text-slate-500">Loading coverage…</p>}
          {coverageError && <p className="mt-2 text-sm text-red-600">{coverageError}</p>}
          {coverageSummary && !coverageLoading && (
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span className="text-green-700">PASS (Fresh): {coverageSummary.totals.pass_fresh}</span>
                <span className="text-amber-700">PASS (Stale): {coverageSummary.totals.pass_stale}</span>
                <span className="text-slate-600">PASS (Unknown Layer): {coverageSummary.totals.pass_unknown_layer}</span>
                <span className="text-red-700">FAIL: {coverageSummary.totals.fail}</span>
                <span className="text-slate-500">NO FINDING: {coverageSummary.totals.no_finding}</span>
              </div>
              <p className="text-sm text-slate-600">
                Coverage:{" "}
                {coverageSummary.totals.pass_fresh +
                  coverageSummary.totals.pass_stale +
                  coverageSummary.totals.pass_unknown_layer +
                  coverageSummary.totals.fail}{" "}
                / {coverageSummary.totals.enclave_controls} controls have findings. Run:{" "}
                {new Date(coverageSummary.collected_at).toLocaleString()}
              </p>
              {(() => {
                const snap = data?.latest_snapshot;
                const attestedRun =
                  snap?.coverage_hash &&
                  snap?.coverage_run_fingerprint != null &&
                  snap?.coverage_collected_at != null &&
                  coverageSummary.run_fingerprint === snap.coverage_run_fingerprint &&
                  coverageSummary.collected_at === snap.coverage_collected_at;
                return (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    {attestedRun ? (
                      <>
                        <span className="font-medium text-green-700">Attested in latest snapshot</span>
                        {snap.coverage_hash && (
                          <span className="font-mono text-slate-600" title={snap.coverage_hash}>
                            coverage_hash: {snap.coverage_hash.slice(0, 16)}…
                          </span>
                        )}
                        {snap.snapshot_signature && (
                          <span className="font-mono text-slate-600" title={snap.snapshot_signature}>
                            signature: {snap.snapshot_signature.slice(0, 16)}…
                          </span>
                        )}
                        <button
                          type="button"
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
                          onClick={() => {
                            if (snap.coverage_hash) {
                              navigator.clipboard.writeText(snap.coverage_hash);
                            }
                          }}
                        >
                          Copy hash
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-amber-700">Not attested (coverage differs from snapshot)</span>
                        <button
                          type="button"
                          disabled={verifyLoading}
                          className="rounded bg-slate-700 px-2 py-1 text-white hover:bg-slate-600 disabled:opacity-50"
                          onClick={() => {
                            setVerifyLoading(true);
                            setVerifyResult(null);
                            fetch("/api/boundary/snapshot/verify-latest")
                              .then((r) => r.json())
                              .then((d) => setVerifyResult(d))
                              .catch(() => setVerifyResult({ ok: false, reason: "request_failed" }))
                              .finally(() => setVerifyLoading(false));
                          }}
                        >
                          {verifyLoading ? "Verifying…" : "Verify"}
                        </button>
                      </>
                    )}
                  </div>
                );
              })()}
              {verifyResult != null && (
                <p className={`text-sm ${verifyResult.ok ? "text-green-700" : "text-amber-700"}`}>
                  Verify: {verifyResult.reason ?? (verifyResult.ok ? "verified" : "failed")}
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-medium text-slate-700">Unknown layer mapping</h3>
                  <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-sm">
                    {coverageSummary.top_gaps.unknown_layer.length === 0 ? (
                      <li className="text-slate-500">None</li>
                    ) : (
                      coverageSummary.top_gaps.unknown_layer.map((cid) => (
                        <li key={cid}>
                          <button
                            type="button"
                            className="font-mono text-slate-700 underline hover:text-slate-900"
                            onClick={() => doControlLookup(cid)}
                          >
                            {cid}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-700">Stale (rerun required)</h3>
                  <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-sm">
                    {coverageSummary.top_gaps.stale.length === 0 ? (
                      <li className="text-slate-500">None</li>
                    ) : (
                      coverageSummary.top_gaps.stale.map((cid) => (
                        <li key={cid}>
                          <button
                            type="button"
                            className="font-mono text-amber-700 underline hover:text-amber-900"
                            onClick={() => doControlLookup(cid)}
                          >
                            {cid}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-700">Failed (remediate)</h3>
                  <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-sm">
                    {coverageSummary.top_gaps.failed.length === 0 ? (
                      <li className="text-slate-500">None</li>
                    ) : (
                      coverageSummary.top_gaps.failed.map((cid) => (
                        <li key={cid}>
                          <button
                            type="button"
                            className="font-mono text-red-700 underline hover:text-red-900"
                            onClick={() => doControlLookup(cid)}
                          >
                            {cid}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-700">No-finding (mapping gap)</h3>
                  <ul className="mt-1 flex flex-wrap gap-x-2 gap-y-0 text-sm">
                    {coverageSummary.top_gaps.no_finding.length === 0 ? (
                      <li className="text-slate-500">None</li>
                    ) : (
                      coverageSummary.top_gaps.no_finding.map((cid) => (
                        <li key={cid}>
                          <button
                            type="button"
                            className="font-mono text-slate-600 underline hover:text-slate-800"
                            onClick={() => doControlLookup(cid)}
                          >
                            {cid}
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
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
                    <th className="border border-slate-200 px-2 py-1.5 text-left font-medium text-slate-700">
                      Technical Evidence
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
                      <td className="border border-slate-200 px-2 py-1.5 text-slate-600 text-xs max-w-[220px]">
                        {formatTechnicalEvidenceSummary(row)}
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
              onClick={() => doControlLookup()}
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
              {controlStatusData?.rows && (() => {
                const id = controlLookupId.trim();
                const nistId = id.replace(/^[A-Z]+\.L2-/, "") || id;
                const row = controlStatusData.rows.find(
                  (r) => r.control_id === nistId || r.control_id === id
                );
                const r = row?.technical_rationale;
                if (!r || (r.reason === "no_finding" && !r.run_collected_at)) return null;
                return (
                  <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3">
                    <h3 className="text-sm font-medium text-slate-700">Evidence provenance</h3>
                    <p className="mt-1 text-xs text-slate-600">Source: {r.source ?? "—"}</p>
                    <p className="text-xs text-slate-600">Collected: {r.run_collected_at ? new Date(r.run_collected_at).toLocaleString() : "—"}</p>
                    {r.run_fingerprint && (
                      <p className="mt-1 text-xs font-mono text-slate-500 flex items-center gap-1">
                        Fingerprint: {r.run_fingerprint}
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(r.run_fingerprint ?? "")}
                          className="rounded px-1.5 py-0.5 text-slate-400 hover:bg-slate-200"
                          title="Copy"
                        >
                          Copy
                        </button>
                      </p>
                    )}
                    <p className="text-xs text-slate-600">Freshness: {r.freshness_status ?? "—"} {r.ok ? "(creditable)" : `— ${r.reason ?? ""}`}</p>
                  </div>
                );
              })()}
              {controlArtifactsData && controlArtifactsData.required.filter((a) => ["REFERENCE", "ATTESTATION", "SYSTEM_POINTER"].includes(a.type)).length > 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50/50 p-3 space-y-3">
                  <h3 className="text-sm font-medium text-slate-700">Governance artifact completions</h3>
                  {controlArtifactsData.required
                    .filter((a) => ["REFERENCE", "ATTESTATION", "SYSTEM_POINTER"].includes(a.type))
                    .map((spec) => {
                      const comp = controlArtifactsData.completions.find((c) => c.artifact_label === spec.label);
                      const isAttestation = spec.type === "ATTESTATION";
                      const isComplete = isAttestation ? Boolean(comp?.attested_at) : Boolean(comp?.value_text?.trim());
                      return (
                        <div key={spec.label} className="text-sm">
                          <label className="block font-medium text-slate-700">
                            {spec.label}
                            <span className="ml-1 text-slate-500">({spec.type})</span>
                            {isComplete && <span className="ml-1 text-green-600">Complete</span>}
                          </label>
                          {spec.type === "REFERENCE" && (
                            <div className="mt-1 flex gap-2">
                              <input
                                type="text"
                                placeholder="Paste ticket/link/reference"
                                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                                defaultValue={comp?.value_text ?? ""}
                                data-artifact={spec.label}
                              />
                              <button
                                type="button"
                                disabled={artifactSaving}
                                onClick={() => {
                                  const el = document.querySelector(`[data-artifact="${spec.label}"]`) as HTMLInputElement;
                                  const v = el?.value?.trim();
                                  if (v) saveArtifactCompletion(controlArtifactsData.control_id, spec.label, spec.type, v);
                                }}
                                className="rounded bg-slate-700 px-2 py-1 text-white text-xs disabled:opacity-50"
                              >
                                Save
                              </button>
                            </div>
                          )}
                          {spec.type === "SYSTEM_POINTER" && (
                            <div className="mt-1 flex gap-2">
                              <input
                                type="text"
                                placeholder="Path on enclave / notes"
                                className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                                defaultValue={comp?.value_text ?? ""}
                                data-artifact={spec.label}
                              />
                              <button
                                type="button"
                                disabled={artifactSaving}
                                onClick={() => {
                                  const el = document.querySelector(`[data-artifact="${spec.label}"]`) as HTMLInputElement;
                                  const v = el?.value?.trim();
                                  if (v) saveArtifactCompletion(controlArtifactsData.control_id, spec.label, spec.type, v);
                                }}
                                className="rounded bg-slate-700 px-2 py-1 text-white text-xs disabled:opacity-50"
                              >
                                Save
                              </button>
                            </div>
                          )}
                          {spec.type === "ATTESTATION" && (
                            <button
                              type="button"
                              disabled={artifactSaving || isComplete}
                              onClick={() => saveArtifactCompletion(controlArtifactsData.control_id, spec.label, spec.type)}
                              className="mt-1 rounded bg-slate-700 px-2 py-1 text-white text-xs disabled:opacity-50"
                            >
                              {isComplete ? "Attested" : "Attest complete"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
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
                          <p className="text-slate-500">Evidence artifacts for this control: {f.evidence_hint}</p>
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
