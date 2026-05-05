/**
 * Shared §1 verbosity helpers for ISSO-export handlers.
 *
 * Phase 4 of Register-Automation v1.1 brief — every register entry written
 * by an ISSO export handler must carry the auditor-defensible §1 field
 * set so a C3PAO can read any entry in isolation and reconstruct the full
 * story without follow-up questions.
 *
 * §1 fields:
 *   1. actor_*                 — who triggered/performed the event
 *   2. event_type +             — what specific action/event
 *      event_classification
 *   3. detected_at,             — all four time anchors
 *      occurred_at,
 *      signed_at,
 *      verified_at
 *   4. system, scope,            — where the event occurred
 *      vault_id, boundary_id
 *   5. business_justification    — why (admin/ISSO free text)
 *   6. detection_method          — how (auto_detected / isso_observed /
 *                                  admin_attested) + detection source
 *   7. outcome + actions_taken   — what was decided / done
 *   8. verified_by +             — ISSO sign-off
 *      verification_note
 *   9. evidence_refs[]           — cross-references (manifest_id,
 *                                  audit_log_id, related_entry_ids,
 *                                  ticket_url, evidence_file_hash)
 *  10. lifecycle_state            — draft | admin_signed | isso_verified |
 *                                   escalated | disputed | resolved | void |
 *                                   auto_recorded | auto_recorded_legacy
 *  11. provenance                 — { manifest_id, run_id, ingested_at }
 *
 * Pattern B handlers (audit_log_review, vuln_remediation.verifications,
 * training_completion, media_handling_log, personnel_screening) finalize
 * at insert time; their lifecycle_state is "auto_recorded" (no admin/ISSO
 * loop required for routine cadence).
 *
 * Pattern A handlers (break_glass, privileged_grant, change_drift,
 * defender_alert) start "draft" and progress through admin_signed →
 * isso_verified — those handlers manage lifecycle_state directly and don't
 * call applyAutoRecordedV1Fields().
 *
 * Pattern C handlers (control_attention_items, weekly_review_finding,
 * stale_document_flag, review_observation) start "isso_flagged" —
 * applyIssoFlaggedV1Fields() preserves admin remediation lifecycle.
 */

import type { IngestContext } from "../types";

export interface EvidenceRef {
  type: string;
  value: string;
  label?: string;
}

interface V1FieldsCommonInput {
  ctx: IngestContext;
  /** Resolved primary boundary id; used as `boundary_id` per §1.4. */
  boundaryId: string;
  /** Detection-source label per §1.6. */
  detectionMethod: string;
  /** Per-handler optional detection-source string (e.g. "EnclaveWatch weekly review"). */
  detectionSource?: string;
  /** Optional pre-built evidence_refs[] (§1.9). The manifest_id ref is appended automatically. */
  evidenceRefs?: EvidenceRef[];
}

/**
 * Returns the manifest-derived `provenance` object per §1.11.
 */
export function buildProvenance(ctx: IngestContext): Record<string, unknown> {
  return {
    manifest_id: ctx.manifestId,
    run_id: null,
    ingested_at: new Date().toISOString(),
  };
}

/**
 * Returns the §1.9 evidence_refs[] starting with the source-manifest ref.
 * Callers may append more refs (related_entry_id, ticket_url, etc.).
 */
export function buildEvidenceRefsBase(ctx: IngestContext, label?: string): EvidenceRef[] {
  return [
    {
      type: "manifest_id",
      value: ctx.manifestId,
      label: label ?? "Source ISSO weekly export carrying this entry",
    },
  ];
}

/**
 * Apply §1 field defaults appropriate for a Pattern B (auto-recorded /
 * auto-final) entry. Caller has already populated the handler-specific
 * fields; this function adds anything missing without overwriting.
 *
 * Useful for: audit_log_review.weekly_review,
 * vuln_remediation.verification, training_completion.attestation_recorded,
 * media_handling_log.media_event, personnel_screening.screening_recorded,
 * incident_log.incident_opened.
 */
export function applyAutoRecordedV1Fields(
  entryData: Record<string, unknown>,
  input: V1FieldsCommonInput,
): Record<string, unknown> {
  const evidenceRefs = input.evidenceRefs ?? buildEvidenceRefsBase(input.ctx);
  const merged: Record<string, unknown> = {
    ...entryData,
  };
  if (!("vault_id" in merged) || merged.vault_id === undefined) {
    merged.vault_id = input.ctx.vaultId;
  }
  if (!("boundary_id" in merged) || merged.boundary_id === undefined) {
    merged.boundary_id = input.boundaryId;
  }
  if (!("detection_method" in merged) || merged.detection_method === undefined) {
    merged.detection_method = input.detectionMethod;
  }
  if (
    input.detectionSource &&
    (!("detection_source" in merged) || merged.detection_source === undefined)
  ) {
    merged.detection_source = input.detectionSource;
  }
  if (!("lifecycle_state" in merged) || merged.lifecycle_state === undefined) {
    merged.lifecycle_state = "auto_recorded";
  }
  if (!("evidence_refs" in merged) || !Array.isArray(merged.evidence_refs)) {
    merged.evidence_refs = evidenceRefs;
  }
  if (!("provenance" in merged) || merged.provenance === undefined) {
    merged.provenance = buildProvenance(input.ctx);
  }
  if (!("manifest_id" in merged) || merged.manifest_id === undefined) {
    merged.manifest_id = input.ctx.manifestId;
  }
  // Pattern B has no admin/ISSO loop — explicit nulls signal "N/A by design"
  // to the auditor (vs missing, which signals "forgot to populate").
  if (!("business_justification" in merged)) merged.business_justification = null;
  if (!("verified_by" in merged)) merged.verified_by = null;
  if (!("verification_note" in merged)) merged.verification_note = null;
  if (!("verified_at" in merged)) merged.verified_at = null;
  if (!("signed_at" in merged)) merged.signed_at = null;
  return merged;
}

