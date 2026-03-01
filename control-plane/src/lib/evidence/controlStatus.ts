import { getFreshnessDaysForLayer, computeFreshnessStatus } from "@/lib/evidence/freshnessPolicy";

export type EvidenceStatus = "pass" | "fail" | "unknown";
export type SynthesizedStatus = "Compliant" | "Non-Compliant" | "Stale" | "No Evidence" | "Inherited";
export type AllocationStatus = "Inherited" | "Shared" | "Customer" | "NotApplicable";

export interface AllocationSummary {
  control_id: string;
  status: AllocationStatus;
  layer?: string | null;
}

export interface EvidenceFindingSummary {
  control_id: string;
  status: EvidenceStatus;
  created_at: string; // ISO
  layer: string | null;
}

export interface ControlStatusRow {
  control_id: string;
  allocation_status: AllocationStatus;
  allocation_layer: string | null;
  latest_evidence_status: EvidenceStatus;
  evidence_layer: string | null;
  evidence_created_at: string | null;
  freshness_status: "fresh" | "stale" | "unknown";
  freshness_days: number | null;
  freshness_cutoff_utc: string | null;
  synthesized_status: SynthesizedStatus;
  notes?: string[];
}

export function synthesizeControlStatus(params: {
  controlId: string;
  allocation?: AllocationSummary | null;
  evidence?: EvidenceFindingSummary | null;
  now?: Date;
}): ControlStatusRow {
  const now = params.now ?? new Date();
  const control_id = params.controlId;

  const allocation_status: AllocationStatus = params.allocation?.status ?? "Customer";
  const allocation_layer = params.allocation?.layer ?? null;

  let latest_evidence_status: EvidenceStatus = "unknown";
  let evidence_layer: string | null = null;
  let evidence_created_at: string | null = null;

  if (params.evidence) {
    latest_evidence_status = params.evidence.status;
    evidence_layer = params.evidence.layer ?? null;
    evidence_created_at = params.evidence.created_at;
  }

  const layer_for_freshness = evidence_layer ?? allocation_layer;
  const freshness = evidence_created_at
    ? computeFreshnessStatus(evidence_created_at, layer_for_freshness, now)
    : {
        status: "unknown" as const,
        freshness_days: getFreshnessDaysForLayer(layer_for_freshness),
        freshness_cutoff_utc: null,
      };

  let synthesized_status: SynthesizedStatus = "No Evidence";

  if (allocation_status === "Inherited") {
    synthesized_status = "Inherited";
  } else if (!params.evidence) {
    synthesized_status = "No Evidence";
  } else if (latest_evidence_status === "fail") {
    synthesized_status = "Non-Compliant";
  } else if (latest_evidence_status === "pass") {
    synthesized_status = freshness.status === "stale" ? "Stale" : "Compliant";
  } else {
    synthesized_status = "No Evidence";
  }

  const notes: string[] = [];
  if (allocation_status !== "Inherited" && !params.evidence) {
    notes.push("No evidence finding ingested for this control.");
  }
  if (params.evidence && freshness.status === "stale") {
    notes.push(
      `Evidence is stale for layer ${layer_for_freshness ?? "(unknown)"}; re-run within ${freshness.freshness_days ?? "policy"} days.`
    );
  }

  return {
    control_id,
    allocation_status,
    allocation_layer,
    latest_evidence_status,
    evidence_layer,
    evidence_created_at,
    freshness_status: freshness.status,
    freshness_days: freshness.freshness_days,
    freshness_cutoff_utc: freshness.freshness_cutoff_utc,
    synthesized_status,
    notes: notes.length ? notes : undefined,
  };
}
