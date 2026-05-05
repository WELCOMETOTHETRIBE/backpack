"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Privileged-grant justification form. Renders inline on the entry detail
 * page when entry_type=privileged_grant_acknowledgment AND status=draft.
 * Admin completes business_justification / outcome / sunset_plan / actions
 * and submits to /api/registers/access-authorization/[entryId]/justify.
 *
 * On success, refreshes the page so the now-final entry shows updated
 * fields + closes the alert in the Monitoring tab.
 *
 * Mirrors BreakGlassAckForm.tsx — same look/feel, same submission shape,
 * different field set per the §1 auditor-defensible standard.
 */

interface Props {
  entryId: string;
  detection: {
    alert_id?: string;
    actor_user?: string;
    actor_user_id?: string | null;
    azure_role_name?: string | null;
    scope_arm?: string | null;
    system?: string | null;
    occurred_at?: string;
    detected_at?: string;
    approver?: string | null;
    related_grant_entry_id?: string | null;
  };
}

export function PrivilegedGrantJustifyForm({ entryId, detection }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("approved");

  // Snapshot the "now" used for the countdown at mount via a state
  // initializer so the render function stays pure (no Date.now() call
  // inline). For a 72h-deadline UI a single mount-time snapshot is
  // accurate enough — the user navigates away and reloads if they
  // want a refreshed countdown.
  const [renderNow] = useState<number>(() => Date.now());

  const detectedAtIso = detection.detected_at
    ? new Date(detection.detected_at).toISOString()
    : new Date(renderNow).toISOString();
  const occurredAtIso = detection.occurred_at
    ? new Date(detection.occurred_at).toISOString()
    : detectedAtIso;

  // Compute hours-since-detection so we can show the 72h countdown.
  const hoursSinceDetection = detection.detected_at
    ? Math.max(0, (renderNow - new Date(detection.detected_at).getTime()) / 3600_000)
    : 0;
  const hoursRemaining = Math.max(0, 72 - hoursSinceDetection);
  const overdue = hoursSinceDetection >= 72;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const businessJustification = String(formData.get("business_justification") ?? "").trim();
    if (businessJustification.length < 50) {
      setError("Business justification must be at least 50 characters.");
      setSubmitting(false);
      return;
    }

    const expectedDurationRaw = String(formData.get("expected_duration_days") ?? "").trim();
    const expectedDuration = expectedDurationRaw === "" ? null : Number(expectedDurationRaw);
    if (
      expectedDuration !== null &&
      (Number.isNaN(expectedDuration) || expectedDuration < 0 || expectedDuration > 3650)
    ) {
      setError("Expected duration must be a number of days between 0 and 3650.");
      setSubmitting(false);
      return;
    }

    const body = {
      business_justification: businessJustification,
      outcome: String(formData.get("outcome") ?? "approved"),
      actions_taken: String(formData.get("actions_taken") ?? "").trim(),
      sunset_plan: String(formData.get("sunset_plan") ?? "").trim() || null,
      expected_duration_days: expectedDuration,
      ticket_url: String(formData.get("ticket_url") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      signed_at: new Date().toISOString(),
    };

    try {
      const res = await fetch(
        `/api/registers/access-authorization/${entryId}/justify`,
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

  const banner = overdue
    ? "border-red-300 bg-red-50"
    : "border-amber-300 bg-amber-50";
  const dot = overdue
    ? "bg-red-200 text-red-900"
    : "bg-amber-200 text-amber-900";
  const heading = overdue ? "text-red-900" : "text-amber-900";
  const body = overdue ? "text-red-800" : "text-amber-800";
  const labelTone = overdue ? "text-red-900" : "text-amber-900";
  const inputBorder = overdue
    ? "border-red-300 focus:border-red-600 focus:ring-red-600 placeholder:text-red-300 text-red-900"
    : "border-amber-300 focus:border-amber-600 focus:ring-amber-600 placeholder:text-amber-300 text-amber-900";
  const button = overdue
    ? "bg-red-700 hover:bg-red-800"
    : "bg-amber-700 hover:bg-amber-800";

  return (
    <div className={`rounded-[var(--radius-xl)] border ${banner} p-6 shadow-sm`}>
      <div className="flex items-start gap-3">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${dot} font-bold text-sm`}
        >
          !
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={`text-base font-semibold ${heading}`}>
            Privileged role grant awaiting justification
          </h3>
          <p className={`mt-1 text-sm ${body}`}>
            EnclaveWatch detected a privileged role assignment on{" "}
            <span className="font-mono">{occurredAtIso.slice(0, 19).replace("T", " ")}</span>.
            File this justification within 72 hours of detection or the alert escalates to the ISSO.{" "}
            {overdue ? (
              <span className="font-semibold">This entry is past its 72-hour deadline.</span>
            ) : (
              <span className="font-semibold">
                {hoursRemaining.toFixed(1)} hours remaining.
              </span>
            )}
          </p>

          <dl className={`mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs ${heading}`}>
            <dt className="font-medium">Subject (granted to)</dt>
            <dd className="font-mono break-words">{detection.actor_user ?? "(unknown)"}</dd>
            <dt className="font-medium">Azure role</dt>
            <dd className="font-mono break-words">{detection.azure_role_name ?? "(unknown)"}</dd>
            <dt className="font-medium">Scope</dt>
            <dd className="font-mono break-words">
              {detection.scope_arm ?? detection.system ?? "(unknown)"}
            </dd>
            <dt className="font-medium">Approver</dt>
            <dd className="font-mono break-words">{detection.approver ?? "(unknown)"}</dd>
            <dt className="font-medium">Detected at</dt>
            <dd className="font-mono">{detectedAtIso.slice(0, 19).replace("T", " ")}</dd>
            <dt className="font-medium">Alert ID</dt>
            <dd className="font-mono break-words">{detection.alert_id ?? "(unknown)"}</dd>
          </dl>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <TextArea
              label="Business justification"
              name="business_justification"
              required
              minLength={50}
              rows={4}
              placeholder="Why was this privileged role granted? Tie back to a business purpose, project, ticket, or attestation. Minimum 50 characters."
              labelTone={labelTone}
              inputBorder={inputBorder}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label="Outcome"
                name="outcome"
                required
                value={outcome}
                onChange={setOutcome}
                options={[
                  { value: "approved", label: "Approved" },
                  { value: "approved_with_conditions", label: "Approved with conditions" },
                  { value: "rolled_back", label: "Rolled back (access revoked)" },
                  { value: "investigating", label: "Investigating" },
                ]}
                labelTone={labelTone}
                inputBorder={inputBorder}
              />
              <Field
                label="Expected duration (days)"
                name="expected_duration_days"
                type="number"
                placeholder="e.g. 30"
                labelTone={labelTone}
                inputBorder={inputBorder}
              />
            </div>

            <TextArea
              label="Actions taken"
              name="actions_taken"
              required
              rows={3}
              placeholder="What was done in response to this grant? (e.g., verified ticket #1234, paired with sunset, scoped down, etc.)"
              labelTone={labelTone}
              inputBorder={inputBorder}
            />

            <TextArea
              label="Sunset plan"
              name="sunset_plan"
              rows={2}
              placeholder="When and how will this access be reviewed or revoked? Skip for permanent assignments."
              labelTone={labelTone}
              inputBorder={inputBorder}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Ticket URL (optional)"
                name="ticket_url"
                placeholder="JIRA / ServiceNow / change request URL"
                labelTone={labelTone}
                inputBorder={inputBorder}
              />
              <TextArea
                label="Notes (optional)"
                name="notes"
                rows={1}
                placeholder="Anything else the ISSO should know"
                labelTone={labelTone}
                inputBorder={inputBorder}
              />
            </div>

            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className={`text-xs ${body}`}>
                By signing, you affirm the justification above is accurate. signed_at will be set
                to the current timestamp on submit.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className={`rounded-md ${button} px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {submitting ? "Signing…" : "Sign justification"}
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
  type = "text",
  required,
  placeholder,
  labelTone,
  inputBorder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  labelTone: string;
  inputBorder: string;
}) {
  return (
    <label className="block">
      <span className={`text-xs font-medium ${labelTone}`}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 ${inputBorder}`}
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
  minLength,
  labelTone,
  inputBorder,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  rows?: number;
  minLength?: number;
  labelTone: string;
  inputBorder: string;
}) {
  return (
    <label className="block">
      <span className={`text-xs font-medium ${labelTone}`}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <textarea
        name={name}
        required={required}
        placeholder={placeholder}
        rows={rows}
        minLength={minLength}
        className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 ${inputBorder}`}
      />
    </label>
  );
}

function Select({
  label,
  name,
  required,
  value,
  onChange,
  options,
  labelTone,
  inputBorder,
}: {
  label: string;
  name: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  labelTone: string;
  inputBorder: string;
}) {
  return (
    <label className="block">
      <span className={`text-xs font-medium ${labelTone}`}>
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      <select
        name={name}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 ${inputBorder}`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
