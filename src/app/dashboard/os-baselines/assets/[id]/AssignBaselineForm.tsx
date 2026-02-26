"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type BaselineProfile = {
  id: string;
  name: string;
  version: string;
  role: string;
  osFamily: string;
  osVersion: string;
};

export function AssignBaselineForm({
  assetId,
  osFamily,
  osVersion,
  role,
}: {
  assetId: string;
  osFamily: string;
  osVersion: string;
  role: string;
}) {
  const router = useRouter();
  const [profiles, setProfiles] = useState<BaselineProfile[]>([]);
  const [baselineProfileId, setBaselineProfileId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/os-baselines/baseline-profiles")
      .then((r) => (r.ok ? r.json() : []))
      .then((list: BaselineProfile[]) =>
        setProfiles(Array.isArray(list) ? list : [])
      )
      .catch(() => {});
  }, []);

  const matchingProfiles = profiles.filter(
    (p) =>
      p.osFamily === osFamily && p.osVersion === osVersion && p.role === role
  );

  async function handleAssign() {
    if (!baselineProfileId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/os-baselines/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseline_profile_id: baselineProfileId }),
      });
      if (!res.ok) throw new Error("Failed to assign baseline");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (matchingProfiles.length === 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
        <p className="text-sm font-medium text-amber-800">
          No baseline profile for {osFamily} {osVersion} · {role}
        </p>
        <p className="mt-1 text-xs text-amber-700">
          Run: <code className="rounded bg-amber-100 px-1">npx tsx src/scripts/seed-baseline-windows-server-2025.ts</code> to add Windows Server 2025 Member Server, then refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[200px]">
        <label className="block text-sm font-medium text-[var(--color-gray-700)]">
          Baseline profile
        </label>
        <select
          value={baselineProfileId}
          onChange={(e) => setBaselineProfileId(e.target.value)}
          className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
        >
          <option value="">— Select —</option>
          {matchingProfiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} v{p.version}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={handleAssign}
        disabled={saving || !baselineProfileId}
        className="rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : "Assign baseline"}
      </button>
    </div>
  );
}
