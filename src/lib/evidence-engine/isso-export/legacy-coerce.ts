/**
 * Coerce a v1.0 weekly-review ack package into a v1.1 IssoExportManifest
 * shape so the existing /weekly-review/ingest endpoint can route through
 * the same dispatcher. Backward compat per spec §8.
 *
 * The v1.0 body shape lives in
 * src/app/api/enclavewatch/weekly-review/ingest/route.ts (AckPackage type).
 * This file deliberately doesn't import that type so the coerce stays
 * loose — extra v1.0 fields are just preserved verbatim into the v1.1
 * weekly_review payload.
 */

import { createHash } from "crypto";
import type {
  IssoExportManifest,
  ManifestAcknowledgement,
} from "./types";

interface LegacyAckPackage {
  acknowledgement: {
    export_type?: string;
    schema_version?: string;
    vault_id: string;
    customer_id?: string;
    review_period_start: string;
    review_period_end: string;
    review_result: string;
    raw_logs_retained_on_vault: boolean;
    event_count?: number;
    evidence_bundle_hash?: string;
    weekly_manifest_hash?: string;
    export_signature?: string;
    signatory?: { name?: string; role?: string; signed_at?: string };
  };
  control_mapping_summary?: unknown;
  finding_summary?: { findings?: Array<{ id: string; severity?: string; status?: string }> };
  manifest_hashes?: unknown;
  [k: string]: unknown;
}

/**
 * Compute a deterministic manifest_id for a v1.0 package so the dedupe
 * table picks up retries from EnclaveWatch correctly even when v1.0 is
 * still in use.
 */
export function computeLegacyManifestId(body: LegacyAckPackage): string {
  const ack = body.acknowledgement;
  const hashInput = [
    ack.vault_id,
    ack.review_period_end,
    ack.evidence_bundle_hash ?? "",
    ack.weekly_manifest_hash ?? "",
    ack.export_signature ?? "",
  ].join("|");
  return `v1.0:${createHash("sha256").update(hashInput).digest("hex")}`;
}

export function coerceLegacyToV11(body: LegacyAckPackage): IssoExportManifest {
  const ack = body.acknowledgement;
  const findingCount = body.finding_summary?.findings?.length ?? 0;
  const findingsSummary =
    findingCount > 0
      ? `${findingCount} item(s) — see EnclaveWatch finding_summary`
      : "no findings";
  const reviewerName = ack.signatory?.name ?? ack.signatory?.role ?? "ISSO";
  const reviewedAt =
    ack.signatory?.signed_at ?? ack.review_period_end ?? new Date().toISOString();
  const summary = `EnclaveWatch weekly review ${ack.review_period_start.slice(0, 10)} → ${ack.review_period_end.slice(0, 10)}: ${ack.review_result}. ${ack.event_count ?? 0} audit events covered, ${findingCount} finding(s) recorded.`;

  const acknowledgement: ManifestAcknowledgement = {
    vault_id: ack.vault_id,
    customer_id: ack.customer_id,
    review_period_start: ack.review_period_start,
    review_period_end: ack.review_period_end,
    review_result: (ack.review_result === "clean" ||
    ack.review_result === "findings" ||
    ack.review_result === "blocked"
      ? ack.review_result
      : "findings") as ManifestAcknowledgement["review_result"],
    raw_logs_retained_on_vault: ack.raw_logs_retained_on_vault,
    event_count: ack.event_count,
    evidence_bundle_hash: ack.evidence_bundle_hash,
    weekly_manifest_hash: ack.weekly_manifest_hash,
    export_signature: ack.export_signature,
    signatory: ack.signatory,
  };

  return {
    manifest_version: "1.0",
    manifest_id: computeLegacyManifestId(body),
    acknowledgement,
    registers: {
      audit_log_review: {
        weekly_review: {
          review_period_start: ack.review_period_start,
          review_period_end: ack.review_period_end,
          reviewed_at: reviewedAt,
          reviewed_by: reviewerName,
          summary,
          findings: findingsSummary,
          tickets_created: null,
          vault_id: ack.vault_id,
          review_result: ack.review_result,
          evidence_bundle_hash: ack.evidence_bundle_hash ?? null,
          weekly_manifest_hash: ack.weekly_manifest_hash ?? null,
          source: "enclavewatch_weekly_review",
        },
      },
    },
  };
}
