/**
 * ISSO Export Manifest v1.1 types — shared across the dispatcher and every
 * per-register handler. Mirrors the contract in
 * docs/specs/isso-export-manifest-v1.1.md.
 *
 * The handler interface is uniform per §9 of the spec: each handler receives
 * the same context + an opaque `payload` (the value of its register key in
 * the manifest body) and returns a HandlerResult so the dispatcher can build
 * uniform telemetry without inspecting per-register internals.
 */

export type ManifestVersion = "1.0" | "1.1";

/**
 * Top-level manifest shape (v1.1). v1.0 manifests are coerced to a v1.1 shape
 * with only the `audit_log_review` section populated; from the dispatcher's
 * perspective there's a single code path.
 */
export interface IssoExportManifest {
  manifest_version: ManifestVersion;
  /**
   * sha256 hex of canonical body + vault_id + review_period_end. EnclaveWatch
   * computes this; codex uses it as the dedupe key.
   */
  manifest_id: string;
  acknowledgement: ManifestAcknowledgement;
  review_summary?: ReviewSummary;
  registers?: Partial<RegistersSection>;
  control_freshness?: ControlFreshnessSection;
  previous_period_acknowledgments_review?: AcknowledgmentsReviewSection;
}

export interface ManifestAcknowledgement {
  vault_id: string;
  customer_id?: string;
  review_period_start: string;
  review_period_end: string;
  review_result: "clean" | "findings" | "blocked";
  raw_logs_retained_on_vault: boolean;
  event_count?: number;
  evidence_bundle_hash?: string;
  weekly_manifest_hash?: string;
  signatory?: { name?: string; role?: string; signed_at?: string };
  export_signature?: string;
}

export interface ReviewSummary {
  controls_touched?: string[];
  events_reviewed_count?: number;
  anomalies_count?: number;
  notes?: string;
}

/**
 * One section per register the export touches. Top-level keys are the
 * register schema id (singular). Each value is opaque to the dispatcher;
 * its handler knows how to interpret it.
 */
export interface RegistersSection {
  audit_log_review?: { weekly_review?: unknown };
  maintenance_log?: {
    break_glass_signins?: unknown[];
    scheduled_maintenance?: unknown[];
    remote_maintenance?: unknown[];
  };
  incident_log?: {
    incidents_during_period?: unknown[];
    /**
     * High/critical Microsoft Defender for Endpoint alerts collected
     * by EnclaveWatch's DefenderCriticalAlertCollector. Each item lands
     * as a draft defender_alert_acknowledgment entry (Pattern A) on the
     * incident_log register awaiting admin investigation outcome.
     * Phase 3 of Register-Automation v1.1.
     */
    defender_alerts?: unknown[];
  };
  access_authorizations?: { weekly_review_findings?: unknown[] };
  vuln_remediation?: { verifications?: unknown[] };
  training_completion?: { expiring_attestations?: unknown[] };
  policy_review?: { stale_documents?: unknown[] };
  assessment_findings?: { review_observations?: unknown[] };
  /**
   * Configuration drift events detected by EnclaveWatch's Sysmon-based
   * ConfigurationDriftCollector that did NOT match a change_log entry
   * within ±60 minutes. Each item lands as a draft change_drift_acknowledgment
   * entry awaiting admin justification. Phase 2 of Register-Automation v1.1.
   */
  change_drift_log?: { drift_observations?: unknown[] };
}

export interface ControlFreshnessSection {
  freshly_observed_implemented?: string[];
  needing_attention?: Array<{
    control_id: string;
    reason: string;
    severity?: "info" | "warning" | "critical";
  }>;
}

export interface AcknowledgmentsReviewSection {
  items?: Array<{
    alert_id: string;
    outcome: "verified_timely" | "overdue_escalated" | "dispute_pending";
    isso_note?: string;
  }>;
}

/**
 * Dispatcher context passed to every handler. Extracted once at ingest, kept
 * read-only so handlers can't drift from the canonical values.
 */
export interface IngestContext {
  orgId: string;
  vaultId: string | null;
  manifestId: string;
  manifestVersion: ManifestVersion;
  reviewPeriodStart: Date | null;
  reviewPeriodEnd: Date;
  /** When the codex received the manifest (now() at ingest start). */
  receivedAt: Date;
}

/**
 * Uniform return type — every handler reports what it changed so the
 * dispatcher can roll up telemetry, recompute affected control_records, and
 * persist the cached response for replay-safety.
 */
export interface HandlerResult {
  /** Section name in canonical form (e.g. "audit_log_review", "control_freshness"). */
  section: string;
  entries_inserted: number;
  entries_updated: number;
  controls_touched: string[];
  warnings: string[];
}

export type RegisterHandler = (
  ctx: IngestContext,
  payload: unknown,
) => Promise<HandlerResult>;

export interface DispatcherResult {
  ok: boolean;
  replayed: boolean;
  manifest_id: string;
  sections_processed: string[];
  controls_touched: string[];
  warnings: string[];
  per_section?: HandlerResult[];
}
