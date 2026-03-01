"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

type BaselineProfile = {
  id: string;
  name: string;
  version: string;
  role: string;
  osFamily: string;
  osVersion: string;
};

export function EditAssetForm({
  assetId,
  initialHostname,
  initialOsFamily,
  initialOsVersion,
  initialRole,
  initialBaselineProfileId,
}: {
  assetId: string;
  initialHostname: string;
  initialOsFamily: string;
  initialOsVersion: string;
  initialRole: string;
  initialBaselineProfileId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<BaselineProfile[]>([]);
  const [hostname, setHostname] = useState(initialHostname);
  const [osFamily, setOsFamily] = useState(initialOsFamily);
  const [osVersion, setOsVersion] = useState(initialOsVersion);
  const [role, setRole] = useState(initialRole);
  const [baselineProfileId, setBaselineProfileId] = useState(initialBaselineProfileId ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/os-baselines/baseline-profiles")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: BaselineProfile[]) => setProfiles(Array.isArray(list) ? list : []))
      .catch(() => {});
  }, []);

  const matchingProfiles = profiles.filter(
    (p) => p.osFamily === osFamily && p.osVersion === osVersion && p.role === role
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hostname.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/os-baselines/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hostname: hostname.trim(),
          os_family: osFamily,
          os_version: osVersion,
          role,
          baseline_profile_id: baselineProfileId || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update");
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
      >
        <Pencil className="h-4 w-4" />
        Edit asset
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--color-gray-900)]">Edit asset</h3>
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--color-gray-700)]">Hostname</label>
                <input
                  type="text"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--color-gray-700)]">OS family</label>
                  <select
                    value={osFamily}
                    onChange={(e) => setOsFamily(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  >
                    <option value="windows_server">Windows Server</option>
                    <option value="windows_client">Windows Client</option>
                    <option value="linux">Linux</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--color-gray-700)]">OS version</label>
                  <input
                    type="text"
                    value={osVersion}
                    onChange={(e) => setOsVersion(e.target.value)}
                    className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-gray-700)]">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <option value="member_server">Member server</option>
                  <option value="domain_controller">Domain controller</option>
                  <option value="workstation">Workstation</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-gray-700)]">Baseline profile</label>
                <select
                  value={matchingProfiles.some((p) => p.id === baselineProfileId) ? baselineProfileId : ""}
                  onChange={(e) => setBaselineProfileId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
                >
                  <option value="">— None —</option>
                  {matchingProfiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} v{p.version}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !hostname.trim()}
                  className="rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
