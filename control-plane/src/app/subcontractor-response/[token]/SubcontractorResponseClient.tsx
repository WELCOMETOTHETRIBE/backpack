"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface SubcontractorResponseClientProps {
  token: string;
  primeName: string;
}

export default function SubcontractorResponseClient({
  token,
  primeName,
}: SubcontractorResponseClientProps) {
  const router = useRouter();
  const [linking, setLinking] = useState(false);
  const [attesting, setAttesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [complianceStatus, setComplianceStatus] = useState("");
  const [notes, setNotes] = useState("");

  async function handleLink() {
    setLinking(true);
    setError(null);
    try {
      const res = await fetch("/api/supply-chain/respond-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to link");
      setSuccess(true);
      router.push("/dashboard/supply-chain/flowdowns");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to link workspace");
    } finally {
      setLinking(false);
    }
  }

  async function handleAttest(e: React.FormEvent) {
    e.preventDefault();
    setAttesting(true);
    setError(null);
    try {
      const res = await fetch("/api/supply-chain/respond-attest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          attestationData: { complianceStatus, notes },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to submit");
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit attestation");
    } finally {
      setAttesting(false);
    }
  }

  if (success) {
    return (
      <div className="mt-8 rounded-lg border border-green-200 bg-green-50 p-4 text-green-800">
        <p className="font-medium">Response recorded successfully.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-green-700 underline">
          Return home
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h2 className="text-lg font-semibold text-gray-900">Accept and link your workspace</h2>
        <p className="mt-1 text-sm text-gray-600">
          If you use CMMC OS, sign in and click below to link your organization to {primeName}. They will then see your live compliance status.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleLink}
            disabled={linking}
            className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white hover:bg-[#2563EB] disabled:opacity-50"
          >
            {linking ? "Linking..." : "I use CMMC OS — link my workspace"}
          </button>
          <Link
            href="/auth/signin"
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign in first
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-gray-50 p-6">
        <h2 className="text-lg font-semibold text-gray-900">Manual attestation</h2>
        <p className="mt-1 text-sm text-gray-600">
          If you do not use CMMC OS, you can submit a manual attestation below.
        </p>
        <form onSubmit={handleAttest} className="mt-4 space-y-4">
          <div>
            <label htmlFor="complianceStatus" className="block text-sm font-medium text-gray-700">
              Compliance status
            </label>
            <select
              id="complianceStatus"
              value={complianceStatus}
              onChange={(e) => setComplianceStatus(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
            >
              <option value="">Select...</option>
              <option value="C3PAO Certified">C3PAO Certified</option>
              <option value="Self-attested">Self-attested</option>
              <option value="In progress">In progress</option>
              <option value="Not started">Not started</option>
            </select>
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900"
              placeholder="Any additional information for your prime..."
            />
          </div>
          <button
            type="submit"
            disabled={attesting}
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {attesting ? "Submitting..." : "Submit attestation"}
          </button>
        </form>
      </section>
    </div>
  );
}
