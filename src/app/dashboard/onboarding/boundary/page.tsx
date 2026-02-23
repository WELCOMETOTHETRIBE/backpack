"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, ArrowLeft } from "lucide-react";

const CATEGORIES: { label: string; options: { value: string; label: string }[] }[] = [
  {
    label: "Operating systems",
    options: [
      { value: "windows_11", label: "Windows 11 (client)" },
      { value: "windows_server", label: "Windows Server 2019 / 2022 / 2025" },
      { value: "rhel", label: "Red Hat Enterprise Linux 8/9 (CentOS/Rocky/Alma)" },
      { value: "macos", label: "macOS 13+ (Ventura/Sonoma) managed via MDM" },
    ],
  },
  {
    label: "Cloud platform",
    options: [
      { value: "azure_gov", label: "Microsoft Azure Government (FedRAMP High)" },
      { value: "aws_govcloud", label: "AWS GovCloud (US)" },
    ],
  },
  {
    label: "Identity provider",
    options: [
      { value: "entra_id", label: "Microsoft Entra ID (Azure AD)" },
      { value: "okta", label: "Okta Identity Platform" },
    ],
  },
  {
    label: "Endpoint management",
    options: [
      { value: "intune", label: "Microsoft Intune (Endpoint Manager)" },
      { value: "jamf", label: "JAMF Pro (macOS/iOS MDM)" },
    ],
  },
  {
    label: "Security & monitoring",
    options: [
      { value: "defender", label: "Microsoft Defender for Endpoint / Defender for Cloud" },
      { value: "crowdstrike", label: "CrowdStrike Falcon" },
      { value: "splunk", label: "Splunk Enterprise / Splunk Cloud" },
      { value: "tenable", label: "Tenable.io / Tenable.sc (Nessus)" },
      { value: "palo_alto", label: "Palo Alto NGFW / Prisma" },
      { value: "cisco_asa", label: "Cisco ASA / Firepower" },
    ],
  },
];

export default function BoundaryProfilePage() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/boundary-profile")
      .then((r) => (r.ok ? r.json() : { selectedTechnologies: [] }))
      .then((data) => setSelected(new Set((data.selectedTechnologies as string[]) ?? [])))
      .finally(() => setLoading(false));
  }, []);

  function toggle(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
    setMessage(null);
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/boundary-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedTechnologies: [...selected] }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: "success", text: "Boundary profile saved." });
      } else {
        setMessage({ type: "error", text: data.error ?? "Failed to save" });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-gray-600">Loading boundary profile…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/dashboard/onboarding"
          className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" /> Back to onboarding
        </Link>
      </div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#0F172A]">Technology boundary profile</h1>
        <p className="mt-1 text-gray-600">
          Declare the technologies in your CUI environment. The compliance wizard will show only the evidence
          requirements that apply to your stack.
        </p>
      </div>

      <div className="space-y-8">
        {CATEGORIES.map((cat) => (
          <section
            key={cat.label}
            className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
          >
            <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">{cat.label}</h2>
            <ul className="space-y-3">
              {cat.options.map((opt) => (
                <li key={opt.value}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md py-2 hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={selected.has(opt.value)}
                      onChange={() => toggle(opt.value)}
                      className="h-4 w-4 rounded border-gray-300 text-[#3B82F6] focus:ring-[#3B82F6]"
                    />
                    <span className="text-gray-900">{opt.label}</span>
                    {selected.has(opt.value) && (
                      <Check className="h-4 w-4 text-[#3B82F6]" aria-hidden />
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[#3B82F6] px-4 py-2 font-medium text-white hover:bg-[#2563EB] disabled:opacity-70"
        >
          {saving ? "Saving…" : "Save boundary profile"}
        </button>
        <Link
          href="/dashboard/governance-wizard"
          className="text-sm font-medium text-[#3B82F6] hover:underline"
        >
          Go to compliance wizard
        </Link>
        {message && (
          <p
            className={
              message.type === "success"
                ? "text-sm text-green-600"
                : "text-sm text-red-600"
            }
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
