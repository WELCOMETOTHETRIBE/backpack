"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Configuration-drift justification form. Renders inline on the entry
 * detail page when entry_type=change_drift_acknowledgment AND status=draft.
 * Admin completes business_justification / outcome / actions and submits
 * to /api/registers/change-drift-log/[entryId]/justify.
 *
 * Mirrors PrivilegedGrantJustifyForm.tsx — same look/feel, different
 * fields per the §1 auditor-defensible standard.
 *
 * Phase 2 of Register-Automation v1.1.
 */

interface Props {
  entryId: string;
  detection: {
    alert_id?: string;
    actor_user?: string | null;
    path?: string | null;
    change_type?: string | null;
    event_type?: string | null;
    host?: string | null;
    system?: string | null;
    occurred_at?: string;
    detected_at?: string;
    process_image?: string | null;
    sysmon_event_id?: number | null;
    related_change_log_entry_id?: string | null;
  };
}

export function ChangeDriftJustifyForm({ entryId, detection }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("intended_change_no_change_log");

  // Snapshot "now" at mount to keep render pure (no Date.now() inline).
  const [renderNow] = useState<number>(() => Date.now());

  const detectedAtIso = detection.detected_at
    ? new Date(detection.detected_at).toISOString()
    : new Date(renderNow).toISOString();
  const occurredAtIso = detection.occurred_at
    ? new Date(detection.occurred_at).toISOString()
    : detectedAtIso;

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
    const businessJustification = String(
      formData.get("business_justification") ?? "",
    ).trim();
    if (businessJustification.length < 50) {
      setError("Business justification must be at least 50 characters.");
      setSubmitting(false);
      return;
    }

    const body = {
      business_justification: businessJustification,
      outcome: String(formData.get("outcome") ?? "intended_change_no_change_log"),
      actions_taken: String(formData.get("actions_taken") ?? "").trim(),
      ticket_url: String(formData.get("ticket_url") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      signed_at: new Date().toISOString(),
    };

    try {
      const res = await fetch(
        `/api/registers/change-drift-log/${entryId}/justify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const msg = payload.error ?? `Server returned ${res.status}`;
        const fieldList = Array.isArray(payload.fields)
          ? ` Missing: ${payload.fields.join(", ")}`
          : "";
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

  const banner = overdue ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50";
  const dot = overdue ? "bg-red-200 text-red-900" : "bg-amber-200 text-amber-900";
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
            Configuration drift awaiting justification
          </h3>
          <p className={`mt-1 text-sm ${body}`}>
            EnclaveWatch detected a baseline-protected resource change on{" "}
            <span className="font-mono">
              {occurredAtIso.slice(0, 19).replace("T", " ")}
            </span>{" "}
            that did not match any change_log entry within ±60 minutes. File this
            justification within 72 hours of detection or the alert escalates to the
            ISSO.{" "}
            {overdue ? (
              <span className="font-semibold">
                This entry is past its 72-hour deadline.
              </span>
            ) : (
              <span className="font-semibold">
                {hoursRemaining.toFixed(1)} hours remaining.
              </span>
            )}
          </p>

          <dl
            className={`mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs ${heading}`}
          >
            <dt className="font-medium">Path</dt>
            <dd className="font-mono break-words">{detection.path ?? "(unknown)"}</dd>
            <dt className="font-medium">Change type</dt>
            <dd className="font-mono break-words">
              {detection.change_type ?? detection.event_type ?? "(unknown)"}
            </dd>
            <dt className="font-medium">Host / system</dt>
            <dd className="font-mono break-words">
              {detection.host ?? detection.system ?? "(unknown)"}
            </dd>
            <dt className="font-medium">Actor</dt>
            <dd className="font-mono break-words">
              {detection.actor_user ?? "(unknown)"}
            </dd>
            <dt className="font-medium">Process</dt>
            <dd className="font-mono break-words">
              {detection.process_image ?? "(unknown)"}
            </dd>
            <dt className="font-medium">Sysmon event</dt>
            <dd className="font-mono">
              {detection.sysmon_event_id !== null && detection.sysmon_event_id !== undefined
                ? detection.sysmon_event_id
                : "(unknown)"}
            </dd>
            <dt className="font-medium">Detected at</dt>
            <dd className="font-mono">
              {detectedAtIso.slice(0, 19).replace("T", " ")}
            </dd>
            <dt className="font-medium">Alert ID</dt>
            <dd className="font-mono break-words">
              {detection.alert_id ?? "(unknown)"}
            </dd>
          </dl>

          {detection.related_change_log_entry_id && (
            <p className={`mt-3 text-xs ${body}`}>
              Note: the collector found a near-match in change_log (id{" "}
              <span className="font-mono">{detection.related_change_log_entry_id}</span>
              ) that fell outside the ±60-minute correlation window. If this drift is
              actually that logged change, select <em>intended_change_with_change_log_match</em> below.
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <TextArea
              label="Business justification"
              name="business_justification"
              required
              minLength={50}
              rows={4}
              placeholder="Why did this change occur? Tie back to a ticket, deployment, scheduled task, Windows Update, etc. Minimum 50 characters."
              labelTone={labelTone}
              inputBorder={inputBorder}
            />

            <Select
              label="Outcome"
              name="outcome"
              required
              value={outcome}
              onChange={setOutcome}
              options={[
                {
                  value: "intended_change_no_change_log",
                  label: "Intended change — should have been in change_log",
                },
                {
                  value: "intended_change_with_change_log_match",
                  label: "Intended change — matches a near-window change_log entry",
                },
                { value: "false_positive", label: "False positive (e.g., Windows Update)" },
                {
                  value: "unauthorized_change_remediated",
                  label: "Unauthorized change — remediated",
                },
                { value: "investigating", label: "Still investigating" },
              ]}
              labelTone={labelTone}
              inputBorder={inputBorder}
            />

            <TextArea
              label="Actions taken"
              name="actions_taken"
              required
              rows={3}
              placeholder="What was done? (e.g., back-filled change_log entry #1234, rolled back, opened incident, updated baseline, etc.)"
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
                By signing, you affirm the justification above is accurate. signed_at
                will be set to the current timestamp on submit.
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
  required,
  placeholder,
  labelTone,
  inputBorder,
}: {
  label: string;
  name: string;
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
        type="text"
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
