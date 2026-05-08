"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Break-glass acknowledgment form. Renders inline on the entry detail page
 * when entry_type=break_glass_acknowledgment AND status=draft. Admin
 * completes purpose / actions / before-after state / signed_at and submits
 * to /api/registers/maintenance-log/break-glass/[entryId]/acknowledge.
 *
 * On success, refreshes the page so the now-final entry shows updated
 * fields + closes the alert in the Monitoring tab.
 */

interface Props {
  entryId: string;
  detection: {
    alert_id?: string;
    upn?: string;
    detected_at?: string;
    source?: string;
    client_ip?: string | null;
    app_or_resource?: string | null;
    actions_observed?: string[] | null;
  };
}

export function BreakGlassAckForm({ entryId, detection }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectedAtIso = detection.detected_at
    ? new Date(detection.detected_at).toISOString()
    : new Date().toISOString();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const body = {
      acknowledged_by: String(formData.get("acknowledged_by") ?? "").trim(),
      purpose_of_session: String(formData.get("purpose_of_session") ?? "").trim(),
      actions_taken: String(formData.get("actions_taken") ?? "").trim(),
      affected_systems: String(formData.get("affected_systems") ?? "").trim(),
      before_state: String(formData.get("before_state") ?? "").trim(),
      after_state: String(formData.get("after_state") ?? "").trim(),
      signed_at: new Date().toISOString(),
      ticket: String(formData.get("ticket") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    };

    try {
      const res = await fetch(
        `/api/registers/maintenance-log/break-glass/${entryId}/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg = payload.error ?? `Server returned ${res.status}`;
        const fieldList = Array.isArray(payload.fields) ? ` Missing: ${payload.fields.join(", ")}` : "";
        setError(`${msg}${fieldList}`);
        setSubmitting(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-[var(--radius-xl)] border border-amber-300 bg-amber-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-sm">!</div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-amber-900">
            Break-glass sign-in awaiting acknowledgment
          </h3>
          <p className="mt-1 text-sm text-amber-800">
            EnclaveWatch detected a sign-in by the break-glass account on{" "}
            <span className="font-mono">{detectedAtIso.slice(0, 19).replace("T", " ")}</span>{" "}
            from <span className="font-mono">{detection.client_ip ?? "(no ip)"}</span>{" "}
            via <span className="font-mono">{detection.app_or_resource ?? "(unknown)"}</span>.{" "}
            File this acknowledgment within 72 hours or the alert escalates to the ISSO.
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-900">
            <dt className="font-medium">UPN</dt>
            <dd className="font-mono break-words">{detection.upn ?? "(unknown)"}</dd>
            <dt className="font-medium">Source</dt>
            <dd className="font-mono">{detection.source ?? "(unknown)"}</dd>
            <dt className="font-medium">Alert ID</dt>
            <dd className="font-mono break-words">{detection.alert_id ?? "(unknown)"}</dd>
            {detection.actions_observed && detection.actions_observed.length > 0 && (
              <>
                <dt className="font-medium">Observed actions</dt>
                <dd className="font-mono break-words">
                  {detection.actions_observed.join("; ")}
                </dd>
              </>
            )}
          </dl>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Your name"
                name="acknowledged_by"
                required
                placeholder="e.g. Patrick Caruso"
              />
              <Field
                label="Affected systems"
                name="affected_systems"
                required
                placeholder="e.g. Vault VM, CA policy 69a21684"
              />
            </div>

            <TextArea
              label="Purpose of session"
              name="purpose_of_session"
              required
              placeholder="Why was the break-glass account used?"
            />
            <TextArea
              label="Actions taken"
              name="actions_taken"
              required
              placeholder="What did you do during the session? (commands, policy changes, etc.)"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <TextArea
                label="State before"
                name="before_state"
                required
                placeholder="System / config state before the session"
                rows={3}
              />
              <TextArea
                label="State after"
                name="after_state"
                required
                placeholder="System / config state after the session"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Ticket / change request (optional)"
                name="ticket"
                placeholder="Jira / ServiceNow / ticket URL"
              />
              <TextArea
                label="Notes (optional)"
                name="notes"
                placeholder="Anything else the ISSO should know"
                rows={1}
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-amber-800">
                By signing, you affirm the above account of the session is accurate. signed_at
                will be set to the current timestamp on submit.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Signing…" : "Sign acknowledgment"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  required,
  placeholder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-amber-900">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        type="text"
        name={name}
        required={required}
        placeholder={placeholder}
        className="mt-1 block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900 placeholder:text-amber-300 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  required,
  placeholder,
  rows = 2,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-amber-900">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <textarea
        name={name}
        required={required}
        placeholder={placeholder}
        rows={rows}
        className="mt-1 block w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm text-amber-900 placeholder:text-amber-300 focus:border-amber-600 focus:outline-none focus:ring-1 focus:ring-amber-600"
      />
    </label>
  );
}
