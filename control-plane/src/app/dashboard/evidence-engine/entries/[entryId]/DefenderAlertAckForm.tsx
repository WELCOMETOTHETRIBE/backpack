"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Defender for Endpoint critical-alert acknowledgment form. Renders
 * inline on the entry detail page when entry_type=defender_alert_
 * acknowledgment AND status=draft AND viewer is Admin or Compliance.
 *
 * Mirrors ChangeDriftJustifyForm.tsx — same structure, Defender-specific
 * fields and copy. SLA is 24h (vs 72h on the lower-severity surfaces).
 *
 * Phase 3 of Register-Automation v1.1.
 */

interface Props {
  entryId: string;
  detection: {
    alert_id?: string;
    alert_title?: string | null;
    severity?: string | null;
    category?: string | null;
    event_type?: string | null;
    system?: string | null;
    actor_user?: string | null;
    affected_assets?: string[] | null;
    mitre_techniques?: string[] | null;
    graph_alert_url?: string | null;
    occurred_at?: string;
    detected_at?: string;
  };
}

const ACK_SLA_HOURS = 24;

export function DefenderAlertAckForm({ entryId, detection }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string>("true_positive_in_progress");

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
  const hoursRemaining = Math.max(0, ACK_SLA_HOURS - hoursSinceDetection);
  const overdue = hoursSinceDetection >= ACK_SLA_HOURS;

  const isCritical = (detection.severity ?? "high") === "critical";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const businessJustification = String(
      formData.get("business_justification") ?? "",
    ).trim();
    if (businessJustification.length < 50) {
      setError("Investigation summary must be at least 50 characters.");
      setSubmitting(false);
      return;
    }

    const body = {
      business_justification: businessJustification,
      outcome: String(formData.get("outcome") ?? "true_positive_in_progress"),
      actions_taken: String(formData.get("actions_taken") ?? "").trim(),
      ticket_url: String(formData.get("ticket_url") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      signed_at: new Date().toISOString(),
    };

    try {
      const res = await fetch(
        `/api/registers/incident-log/${entryId}/acknowledge`,
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

  // Critical alerts get the loud red palette regardless of timer state;
  // high-severity alerts step up to red only when overdue.
  const useRed = overdue || isCritical;
  const banner = useRed
    ? "border-red-300 bg-red-50"
    : "border-amber-300 bg-amber-50";
  const dot = useRed
    ? "bg-red-200 text-red-900"
    : "bg-amber-200 text-amber-900";
  const heading = useRed ? "text-red-900" : "text-amber-900";
  const body = useRed ? "text-red-800" : "text-amber-800";
  const labelTone = useRed ? "text-red-900" : "text-amber-900";
  const inputBorder = useRed
    ? "border-red-300 focus:border-red-600 focus:ring-red-600 placeholder:text-red-300 text-red-900"
    : "border-amber-300 focus:border-amber-600 focus:ring-amber-600 placeholder:text-amber-300 text-amber-900";
  const button = useRed
    ? "bg-red-700 hover:bg-red-800"
    : "bg-amber-700 hover:bg-amber-800";

  const affectedAssetsLabel =
    Array.isArray(detection.affected_assets) &&
    detection.affected_assets.length > 0
      ? detection.affected_assets.join(", ")
      : "(none recorded)";
  const mitreLabel =
    Array.isArray(detection.mitre_techniques) &&
    detection.mitre_techniques.length > 0
      ? detection.mitre_techniques.join(", ")
      : "(none recorded)";

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
            Defender alert awaiting investigation acknowledgment
            {isCritical && (
              <span className="ml-2 inline-flex items-center rounded-full bg-red-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                Critical
              </span>
            )}
          </h3>
          <p className={`mt-1 text-sm ${body}`}>
            Microsoft Defender for Endpoint raised this{" "}
            {detection.severity ?? "high"}-severity alert at{" "}
            <span className="font-mono">
              {occurredAtIso.slice(0, 19).replace("T", " ")}
            </span>
            . Record the investigation outcome within {ACK_SLA_HOURS} hours of
            detection or the alert escalates to the ISSO.{" "}
            {overdue ? (
              <span className="font-semibold">
                This alert is past its {ACK_SLA_HOURS}-hour deadline.
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
            <dt className="font-medium">Alert title</dt>
            <dd className="break-words">{detection.alert_title ?? "(unknown)"}</dd>
            <dt className="font-medium">Event type</dt>
            <dd className="font-mono break-words">
              {detection.event_type ?? "(unknown)"}
            </dd>
            <dt className="font-medium">Severity</dt>
            <dd className="font-mono uppercase">
              {detection.severity ?? "(unknown)"}
            </dd>
            <dt className="font-medium">Category</dt>
            <dd className="font-mono break-words">
              {detection.category ?? "(unknown)"}
            </dd>
            <dt className="font-medium">System</dt>
            <dd className="font-mono break-words">
              {detection.system ?? "(unknown)"}
            </dd>
            <dt className="font-medium">Actor user</dt>
            <dd className="font-mono break-words">
              {detection.actor_user ?? "(none recorded)"}
            </dd>
            <dt className="font-medium">Affected assets</dt>
            <dd className="font-mono break-words">{affectedAssetsLabel}</dd>
            <dt className="font-medium">MITRE techniques</dt>
            <dd className="font-mono break-words">{mitreLabel}</dd>
            <dt className="font-medium">Detected at</dt>
            <dd className="font-mono">
              {detectedAtIso.slice(0, 19).replace("T", " ")}
            </dd>
            <dt className="font-medium">Alert ID</dt>
            <dd className="font-mono break-words">
              {detection.alert_id ?? "(unknown)"}
            </dd>
          </dl>

          {detection.graph_alert_url && (
            <p className={`mt-3 text-xs ${body}`}>
              Defender portal:{" "}
              <a
                href={detection.graph_alert_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline break-all"
              >
                {detection.graph_alert_url}
              </a>
            </p>
          )}

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <TextArea
              label="Investigation summary"
              name="business_justification"
              required
              minLength={50}
              rows={4}
              placeholder="What did the investigation find? Confirm whether the alert is true or false positive, what was observed on the endpoint, and the conclusion. Minimum 50 characters."
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
                  value: "true_positive_remediated",
                  label: "True positive — remediated",
                },
                {
                  value: "true_positive_in_progress",
                  label: "True positive — remediation in progress",
                },
                {
                  value: "false_positive_investigated",
                  label: "False positive — investigated",
                },
                { value: "risk_accepted", label: "Risk accepted" },
              ]}
              labelTone={labelTone}
              inputBorder={inputBorder}
            />

            <TextArea
              label="Actions taken"
              name="actions_taken"
              required
              rows={3}
              placeholder="What was done? (e.g., isolated host, reset credentials, blocked hash, opened incident #1234, applied EDR policy, etc.)"
              labelTone={labelTone}
              inputBorder={inputBorder}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                label="Ticket URL (optional)"
                name="ticket_url"
                placeholder="JIRA / ServiceNow / IR ticket URL"
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
                By signing, you affirm the investigation summary above is
                accurate. signed_at will be set to the current timestamp on
                submit.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className={`rounded-md ${button} px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60`}
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
