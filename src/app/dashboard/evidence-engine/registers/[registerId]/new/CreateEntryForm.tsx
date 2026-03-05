"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RegisterSchema } from "@/data/cmmc/types";

type Props = {
  registerKey: string;
  registerName: string;
  schema: RegisterSchema;
  fieldLabels: Record<string, string>;
};

function isDateLikeKey(key: string): boolean {
  return /_at$|_date$|date|period_start|period_end|effective_date|completed_at|reviewed_at|approved_at|created_at/i.test(key);
}

export function CreateEntryForm({ registerKey, registerName, schema, fieldLabels }: Props) {
  const router = useRouter();
  const [selectedEntryType, setSelectedEntryType] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const entryTypeSchema = selectedEntryType
    ? schema.entry_types.find((et) => et.type === selectedEntryType)
    : null;
  const allFields = entryTypeSchema
    ? [...entryTypeSchema.required, ...entryTypeSchema.optional]
    : [];

  const handleSelectType = (type: string) => {
    setSelectedEntryType(type);
    setFormData({});
    setError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryTypeSchema) return;
    setError(null);
    setFieldErrors({});
    setSubmitting(true);
    const entryData: Record<string, unknown> = {};
    for (const key of allFields) {
      const v = formData[key];
      if (v !== undefined && v !== "") entryData[key] = v;
    }
    const missing = entryTypeSchema.required.filter(
      (k) => entryData[k] === undefined || String(entryData[k]).trim() === ""
    );
    if (missing.length > 0) {
      setError(`Missing required: ${missing.map((k) => fieldLabels[k] ?? k).join(", ")}`);
      setSubmitting(false);
      return;
    }
    try {
      const res = await fetch(`/api/evidence-engine/registers/${encodeURIComponent(registerKey)}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_type: selectedEntryType, entryData }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to create entry");
        if (data.fields && typeof data.fields === "object") {
          setFieldErrors(data.fields as Record<string, string>);
        }
        setSubmitting(false);
        return;
      }
      router.push(`/dashboard/evidence-engine/registers/${encodeURIComponent(registerKey)}`);
      router.refresh();
    } catch {
      setError("Request failed");
      setSubmitting(false);
    }
  };

  if (!selectedEntryType) {
    return (
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Entry type</h3>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Choose the type of entry to create for {registerName}.
        </p>
        <ul className="mt-4 space-y-2">
          {schema.entry_types.map((et) => (
            <li key={et.type}>
              <button
                type="button"
                onClick={() => handleSelectType(et.type)}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left text-sm hover:bg-[var(--color-gray-50)]"
              >
                <span className="font-medium text-[var(--color-gray-900)]">{et.type.replace(/_/g, " ")}</span>
                {et.short_help && (
                  <p className="mt-0.5 text-[var(--color-gray-600)]">{et.short_help}</p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            {selectedEntryType.replace(/_/g, " ")}
          </h3>
          <button
            type="button"
            onClick={() => setSelectedEntryType(null)}
            className="text-sm text-[var(--color-gray-600)] hover:underline"
          >
            Change type
          </button>
        </div>
        {entryTypeSchema?.short_help && (
          <p className="mb-4 text-sm text-[var(--color-gray-600)]">{entryTypeSchema.short_help}</p>
        )}
        {error && (
          <p className="mb-4 rounded-[var(--radius-md)] bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="space-y-4">
          {allFields.map((key) => {
            const label = fieldLabels[key] ?? key;
            const isRequired = entryTypeSchema!.required.includes(key);
            const options = entryTypeSchema!.enums[key];
            const isDate = isDateLikeKey(key);
            const fieldError = fieldErrors[key];
            const inputClass = fieldError
              ? "mt-1 w-full max-w-md rounded-[var(--radius-md)] border border-red-500 px-3 py-2 text-sm"
              : "mt-1 w-full max-w-md rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm";
            return (
              <div key={key}>
                <label className="block text-sm font-medium text-[var(--color-gray-700)]">
                  {label}
                  {isRequired && <span className="text-red-600"> *</span>}
                </label>
                {options && options.length > 0 ? (
                  <select
                    value={formData[key] ?? ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={isDate ? "date" : "text"}
                    value={formData[key] ?? ""}
                    onChange={(e) => setFormData((prev) => ({ ...prev, [key]: e.target.value }))}
                    className={inputClass}
                  />
                )}
                {fieldError && (
                  <p className="mt-1 text-sm text-red-600" role="alert">
                    {fieldError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create draft entry"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/dashboard/evidence-engine/registers/${encodeURIComponent(registerKey)}`)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)]"
          >
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
