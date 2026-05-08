/**
 * Human-readable labels for the `audit_logs.action` strings emitted across the
 * codex. Used by the /admin/audit-logs page and the entry-detail page's
 * Related events section so an auditor sees "Defender alert acknowledged"
 * rather than "enclavewatch.defender_alert.admin_acknowledged".
 *
 * Keep this map in sync with every writeAuditLog call site.
 */

const LABELS: Record<string, string> = {
  // Phase 1 — Privileged Role Grants (Pattern A)
  "enclavewatch.privileged_grant.detected": "Privileged role grant detected",
  "enclavewatch.privileged_grant.admin_justified": "Privileged grant admin-justified",
  "enclavewatch.privileged_grant.ack_review_applied": "Privileged grant ISSO-reviewed",

  // Phase 2 — Configuration Drift (Pattern A)
  "enclavewatch.config_drift.detected": "Configuration drift detected",
  "enclavewatch.config_drift.admin_justified": "Configuration drift admin-justified",
  "enclavewatch.config_drift.ack_review_applied": "Configuration drift ISSO-reviewed",

  // Phase 3 — Defender Critical Alerts (Pattern A)
  "enclavewatch.defender_alert.detected": "Defender alert detected",
  "enclavewatch.defender_alert.admin_acknowledged": "Defender alert admin-acknowledged",
  "enclavewatch.defender_alert.ack_review_applied": "Defender alert ISSO-reviewed",

  // Sprint 1/2 — Break-Glass (Pattern A — predates Phase 1)
  "enclavewatch.break_glass.signin_detected": "Break-glass sign-in detected",
  "enclavewatch.break_glass.admin_acknowledged": "Break-glass admin-acknowledged",
  "enclavewatch.break_glass.ack_review_applied": "Break-glass ISSO-reviewed",
  "enclavewatch.break_glass.escalated": "Break-glass escalated to ISSO",

  // ISSO weekly export
  "enclavewatch.isso_export.ingested": "ISSO weekly export ingested",

  // Control freshness (Sprint 3 / 6.5)
  "enclavewatch.control.freshly_observed": "Control freshly observed by ISSO",
  "enclavewatch.control.needing_attention": "Control flagged needing attention",
  "enclavewatch.control.attention_resolved": "Control attention item resolved",

  // Training cadence
  "enclavewatch.training.attestation_expiring": "Training attestation expiring",

  // Codex session
  "codex.session.opened": "Codex session opened",
};

/**
 * Returns a human-readable label for an audit action string. Falls back to
 * a Title-Cased version of the dot-segments when the action is unknown — so
 * even unmapped events produce readable text rather than raw machine IDs.
 */
export function getAuditActionLabel(action: string | null | undefined): string {
  if (!action) return "(unknown action)";
  if (LABELS[action]) return LABELS[action];
  // Fallback: convert "enclavewatch.foo_bar.baz_qux" → "Foo bar baz qux"
  const tail = action.includes(".") ? action.split(".").slice(1).join(" ") : action;
  return tail
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Tone (color treatment) for an audit action — drives badge styling on the
 * audit-log list. Detection events → amber, admin signature → blue,
 * ISSO verification → green, escalation/error → red.
 */
export function getAuditActionTone(
  action: string | null | undefined,
): "neutral" | "amber" | "blue" | "green" | "red" {
  if (!action) return "neutral";
  if (action.includes(".escalated") || action.includes(".error")) return "red";
  if (
    action.includes(".admin_acknowledged") ||
    action.includes(".admin_justified") ||
    action.includes(".attention_resolved")
  ) {
    return "blue";
  }
  if (
    action.includes(".ack_review_applied") ||
    action.includes(".freshly_observed") ||
    action.includes(".isso_verified")
  ) {
    return "green";
  }
  if (
    action.includes(".detected") ||
    action.includes(".needing_attention") ||
    action.includes(".attestation_expiring") ||
    action.includes(".signin_detected")
  ) {
    return "amber";
  }
  return "neutral";
}
