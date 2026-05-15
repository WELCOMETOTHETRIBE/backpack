"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function NewIntakeForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
      clientCode: String(formData.get("clientCode") ?? ""),
      projectCode: String(formData.get("projectCode") ?? ""),
      expectedClassification: String(formData.get("expectedClassification") ?? "UNKNOWN"),
      authorizationBasis: String(formData.get("authorizationBasis") ?? ""),
      senderName: String(formData.get("senderName") ?? ""),
      senderEmail: String(formData.get("senderEmail") ?? ""),
      senderOrganization: String(formData.get("senderOrganization") ?? ""),
      identityVerificationMethod: String(
        formData.get("identityVerificationMethod") ?? "email_domain_validation",
      ),
      uploadMethod: String(formData.get("uploadMethod") ?? "ENTRA_B2B"),
    };

    const response = await fetch("/api/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
      item?: { id: string };
    };
    if (!response.ok || !data.item) {
      setError(data.error ?? "Failed to create intake request");
      setSubmitting(false);
      return;
    }
    router.push(`/dashboard/intake/${encodeURIComponent(data.item.id)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--color-gray-700)]">Title</span>
          <input
            name="title"
            required
            className="w-full rounded border border-[var(--color-border)] px-3 py-2"
            placeholder="Inbound package for HOMEPORT solicitation"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--color-gray-700)]">Expected Classification</span>
          <select
            name="expectedClassification"
            defaultValue="UNKNOWN"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2"
          >
            <option value="CUI">CUI</option>
            <option value="FCI">FCI</option>
            <option value="EXPORT_CONTROLLED">Export Controlled</option>
            <option value="UNKNOWN">Unknown</option>
            <option value="NOT_CONTROLLED">Not Controlled</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--color-gray-700)]">Client Code</span>
          <input
            name="clientCode"
            required
            defaultValue="CLIENT"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2 font-mono"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--color-gray-700)]">Project Code</span>
          <input
            name="projectCode"
            required
            defaultValue="PROJECT"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2 font-mono"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--color-gray-700)]">Sender Name</span>
          <input
            name="senderName"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--color-gray-700)]">Sender Email</span>
          <input
            name="senderEmail"
            type="email"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--color-gray-700)]">Sender Organization</span>
          <input
            name="senderOrganization"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="font-medium text-[var(--color-gray-700)]">Upload Method</span>
          <select
            name="uploadMethod"
            defaultValue="ENTRA_B2B"
            className="w-full rounded border border-[var(--color-border)] px-3 py-2"
          >
            <option value="ENTRA_B2B">Entra B2B (Preferred)</option>
            <option value="USER_DELEGATION_SAS">User Delegation SAS (Fallback)</option>
          </select>
        </label>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-[var(--color-gray-700)]">Authorization Basis</span>
        <textarea
          name="authorizationBasis"
          required
          rows={3}
          className="w-full rounded border border-[var(--color-border)] px-3 py-2"
          placeholder="Contract clause and authorized data exchange basis."
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-[var(--color-gray-700)]">Description</span>
        <textarea
          name="description"
          rows={3}
          className="w-full rounded border border-[var(--color-border)] px-3 py-2"
          placeholder="Scope, expected files, and handling notes."
        />
      </label>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {submitting ? "Creating..." : "Create Intake Request"}
      </button>
    </form>
  );
}
