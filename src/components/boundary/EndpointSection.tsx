"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Server, Pencil, Save, X } from "lucide-react";

/**
 * EndpointSection — inline single-VM management.
 *
 * Every CUI Vault customer runs ONE Win 2025 VM. This component shows that
 * one endpoint and lets the customer set/edit hostname + role + baseline
 * profile assignment without leaving the page. No add-multiple, no delete —
 * the architecture says one VM, so the surface is one VM.
 *
 * Uses existing API routes (/api/os-baselines/* — kept server-side) so the
 * shape of data didn't have to change for this UX consolidation.
 */

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

const DEFAULT_OS_FAMILY = "windows_server";
const DEFAULT_OS_VERSION = "2025";
const DEFAULT_ROLE = "member_server";

export function EndpointSection({ boundaryId }: { boundaryId: string }) {
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [profiles, setProfiles] = useState<BaselineProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [hostname, setHostname] = useState("");
  const [role, setRole] = useState(DEFAULT_ROLE);
  const [baselineProfileId, setBaselineProfileId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetsRes, profilesRes] = await Promise.all([
        fetch(`/api/os-baselines/boundaries/${boundaryId}/assets`),
        fetch(`/api/os-baselines/baseline-profiles`),
      ]);
      if (assetsRes.ok) {
        const list = (await assetsRes.json()) as Asset[];
        const first = Array.isArray(list) ? list[0] : undefined;
        if (first) {
          setAsset(first);
          setHostname(first.hostname);
          setRole(first.role ?? DEFAULT_ROLE);
          setBaselineProfileId(first.baselineProfileId ?? "");
        } else {
          setAsset(null);
        }
      }
      if (profilesRes.ok) {
        const list = (await profilesRes.json()) as BaselineProfile[];
        setProfiles(Array.isArray(list) ? list : []);
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

  const matchingProfiles = profiles.filter(
    (p) =>
      p.osFamily === DEFAULT_OS_FAMILY &&
      p.osVersion === DEFAULT_OS_VERSION &&
      p.role === role
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!hostname.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Role + baseline are constants of the Vault architecture -- always
      // member_server, always the canonical Win 2025 CUI baseline. We pick
      // the profile by name pattern with version + first-match fallbacks
      // so we don't break if the profile name evolves.
      const canonical =
        profiles.find(
          (p) =>
            p.osFamily === DEFAULT_OS_FAMILY &&
            p.osVersion === DEFAULT_OS_VERSION &&
            p.role === DEFAULT_ROLE &&
            p.name?.toLowerCase().includes("cui baseline"),
        ) ??
        profiles.find(
          (p) =>
            p.osFamily === DEFAULT_OS_FAMILY &&
            p.osVersion === DEFAULT_OS_VERSION &&
            p.role === DEFAULT_ROLE,
        ) ??
        null;
      const baselineId = canonical?.id ?? null;

      if (asset) {
        const res = await fetch(`/api/os-baselines/assets/${asset.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hostname: hostname.trim(),
            role: DEFAULT_ROLE,
            baseline_profile_id: baselineId,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch(
          `/api/os-baselines/boundaries/${boundaryId}/assets`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hostname: hostname.trim(),
              os_family: DEFAULT_OS_FAMILY,
              os_version: DEFAULT_OS_VERSION,
              role: DEFAULT_ROLE,
              baseline_profile_id: baselineId,
            }),
          },
        );
        if (!res.ok) throw new Error(await res.text());
      }
      await loadData();
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    if (asset) {
      setHostname(asset.hostname);
      setRole(asset.role ?? DEFAULT_ROLE);
      setBaselineProfileId(asset.baselineProfileId ?? "");
    } else {
      setHostname("");
      setRole(DEFAULT_ROLE);
      setBaselineProfileId("");
    }
    setEditing(false);
    setError(null);
  }

  if (loading) {
    return (
      <p className="text-sm text-[var(--color-gray-500)]">Loading endpoint…</p>
    );
  }

  // No asset yet — show one-time setup form
  if (!asset && !editing) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-gray-50)]/50 p-4">
        <div className="flex items-start gap-3">
          <Server className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gray-400)]" />
          <div className="flex-1">
            <p className="text-sm font-medium text-[var(--color-gray-800)]">
              Register your CUI Vault VM
            </p>
            <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
              Add the hostname of your Windows Server 2025 Datacenter VM so OS
              evidence runs can be attributed to it.
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            >
              Register VM
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Editing or creating. Hostname is the only thing that varies per
  // customer -- role and baseline are constants of the CUI Vault platform.
  // Auto-pick the canonical Win 2025 baseline if available; fall back to
  // first match. Role is hard-coded to member_server (the only valid role
  // for a Vault VM -- Domain Controller / Bastion / App Server are not
  // part of the Vault architecture).
  const canonicalProfile =
    matchingProfiles.find((p) => p.name?.toLowerCase().includes("cui baseline")) ??
    matchingProfiles.find((p) => p.osVersion === "2025") ??
    matchingProfiles[0];
  if (editing) {
    return (
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--color-gray-700)]">
            VM hostname
          </label>
          <input
            type="text"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="e.g. cui-win-pilot-0"
            required
            className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]"
          />
          <p className="mt-1 text-[11px] text-[var(--color-gray-500)]">
            The hostname your Win 2025 VM reports (run{" "}
            <code className="rounded bg-[var(--color-gray-100)] px-1 py-0.5 font-mono text-[10px]">
              hostname
            </code>{" "}
            on the VM, or check the Azure portal). Used to attribute OS
            evidence runs to this endpoint.
          </p>
        </div>
        {/* Role + baseline are constants of the Vault architecture. Surface
            them read-only so the customer sees what's being applied, but
            don't ask for input. */}
        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/60 px-3 py-2">
            <div className="font-medium text-[var(--color-gray-500)]">Role</div>
            <div className="mt-0.5 text-sm text-[var(--color-gray-800)]">Member server</div>
            <div className="mt-0.5 text-[10px] text-[var(--color-gray-500)]">
              Fixed for Vault VMs (no DC, no Bastion -- Bastion is Azure-managed)
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/60 px-3 py-2">
            <div className="font-medium text-[var(--color-gray-500)]">OS baseline</div>
            <div className="mt-0.5 text-sm text-[var(--color-gray-800)]">
              {canonicalProfile
                ? `${canonicalProfile.name} (v${canonicalProfile.version})`
                : "Windows Server 2025 CUI Baseline"}
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--color-gray-500)]">
              DISA STIG hardened by MacTech, validated by Test-CuiHardening v2
            </div>
          </div>
        </div>
        {error && <p className="text-xs text-rose-700">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || !hostname.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-blue-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving…" : asset ? "Save changes" : "Register VM"}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // Asset exists, read-only view
  if (!asset) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
      <Server className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-gray-500)]" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-[var(--color-gray-900)]">
          {asset.hostname}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
          {asset.osFamily ?? "windows_server"} {asset.osVersion ?? "2025"} ·{" "}
          {(asset.role ?? "member_server").replace(/_/g, " ")}
        </p>
        {asset.baselineProfileId && (
          <p className="mt-0.5 text-xs text-[var(--color-gray-500)]">
            Baseline:{" "}
            {profiles.find((p) => p.id === asset.baselineProfileId)?.name ??
              asset.baselineProfileId}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
      >
        <Pencil className="h-3 w-3" />
        Edit
      </button>
    </div>
  );
}
