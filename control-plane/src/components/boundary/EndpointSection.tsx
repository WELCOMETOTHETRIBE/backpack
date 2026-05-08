"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Server, Upload, CheckCircle2 } from "lucide-react";

/**
 * EndpointSection -- single-VM status, sourced from ingested evidence.
 *
 * The CUI Vault architecture is one Win 2025 Datacenter VM per customer, and
 * the codex already learns the hostname (and on-VM bundle path) from
 * meta/manifest.json on every OS evidence ingest. Asking the user to type
 * the hostname was redundant -- worse, it diverged when the user typed a
 * different name from what the VM actually reports. Now the hostname comes
 * from `evidenceRuns.manifest.computer_name` and the bundle path comes from
 * `evidenceRuns.bundleRoot`. No user input.
 *
 * If no OS evidence has been ingested yet, we show a CTA to upload a
 * manifest. Once a manifest lands, the v2/ingest route auto-creates the
 * `os_asset` row + auto-fills the EndpointSection from the manifest.
 */

type HistoryRow = {
  id: string;
  source: string;
  run_id: string;
  computer_name: string | null;
  bundle_root: string | null;
  collected_at: string | null;
  ingested_at: string;
};

type Asset = {
  id: string;
  hostname: string;
  osFamily: string | null;
  osVersion: string | null;
  role: string | null;
  baselineProfileId: string | null;
};

type BaselineProfile = {
  id: string;
  name: string;
  version: string;
  role: string;
  osFamily: string;
  osVersion: string;
};

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days <= 0) return d.toLocaleString();
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

export function EndpointSection({ boundaryId }: { boundaryId: string }) {
  const [latestRun, setLatestRun] = useState<HistoryRow | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [baseline, setBaseline] = useState<BaselineProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [historyRes, assetsRes, profilesRes] = await Promise.all([
        fetch("/api/evidence/v2/ingest/history", { cache: "no-store" }),
        fetch(`/api/os-baselines/boundaries/${boundaryId}/assets`),
        fetch(`/api/os-baselines/baseline-profiles`),
      ]);

      if (historyRes.ok) {
        const rows = (await historyRes.json()) as HistoryRow[];
        const osManifest = rows.find((r) => r.source === "cui_evidence_manifest");
        setLatestRun(osManifest ?? null);
      }
      if (assetsRes.ok) {
        const list = (await assetsRes.json()) as Asset[];
        setAsset(Array.isArray(list) ? list[0] ?? null : null);
      }
      if (profilesRes.ok) {
        const list = (await profilesRes.json()) as BaselineProfile[];
        const canonical =
          list.find(
            (p) =>
              p.osFamily === "windows_server" &&
              p.osVersion === "2025" &&
              p.role === "member_server" &&
              p.name?.toLowerCase().includes("cui baseline"),
          ) ??
          list.find(
            (p) =>
              p.osFamily === "windows_server" &&
              p.osVersion === "2025" &&
              p.role === "member_server",
          ) ??
          null;
        setBaseline(canonical);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load endpoint");
    } finally {
      setLoading(false);
    }
  }, [boundaryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <p className="text-sm text-[var(--color-gray-500)]">Loading endpoint…</p>;
  }

  if (error) {
    return <p className="text-sm text-rose-700">{error}</p>;
  }

  // No OS evidence has been ingested yet AND no asset has been auto-created.
  // Show the upload CTA -- the EndpointSection now self-populates from the
  // first manifest the user uploads (no hostname typing required).
  if (!latestRun && !asset) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-gray-50)]/50 p-4">
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gray-400)]" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--color-gray-800)]">
              No CUI Vault VM detected yet
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
              Run{" "}
              <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px]">
                Collect-Cui-Evidence-v2.ps1
              </code>{" "}
              on your Windows Server 2025 VM and upload{" "}
              <code className="rounded bg-white px-1 py-0.5 font-mono text-[10px]">
                meta/manifest.json
              </code>
              . The codex will derive the hostname and on-VM evidence path
              automatically -- no manual entry needed.
            </p>
            <Link
              href="/dashboard/evidence/upload-manifest"
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload first OS manifest
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Prefer the latest manifest's computer_name for the displayed hostname --
  // it's the source of truth (asset row is just a derived stub the v2/ingest
  // route writes for FK purposes).
  const hostname = latestRun?.computer_name ?? asset?.hostname ?? "(unknown)";
  const bundleRoot = latestRun?.bundle_root ?? null;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <Server className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gray-500)]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--color-gray-900)]">
              {hostname}
            </p>
            {latestRun && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">
                <CheckCircle2 className="h-3 w-3" />
                Auto-detected from evidence
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
            Windows Server 2025 · member server · DISA STIG hardened by MacTech
          </p>
          {baseline && (
            <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
              Baseline: {baseline.name} (v{baseline.version})
            </p>
          )}
        </div>
      </div>

      {bundleRoot && latestRun && (
        <div className="rounded-lg border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/60 p-3 text-xs">
          <div className="font-medium text-[var(--color-gray-500)]">
            Evidence files retained on VM
          </div>
          <code className="mt-0.5 block break-all font-mono text-[11px] text-[var(--color-gray-800)]">
            {bundleRoot}
          </code>
          <div className="mt-1 text-[10px] text-[var(--color-gray-500)]">
            From last run {formatRelativeDate(latestRun.collected_at ?? latestRun.ingested_at)}.
            The codex stores only the manifest + hashes; raw evidence stays on the VM.
          </div>
        </div>
      )}
    </div>
  );
}
