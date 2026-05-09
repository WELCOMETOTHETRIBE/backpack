/**
 * ESP-block intake from TrainOS bridge bundles.
 *
 * Per CMMC L2 Assessment Guide v2.13 page 11, an External Service
 * Provider (ESP) under 32 CFR § 170.4 may satisfy a security
 * requirement; the resulting evidence is assessed as MET. TrainOS
 * Tier 1 #2 adds an `esp` block to inbound bundle envelopes (RA + CA)
 * declaring TrainOS as the ESP for the objectives the bundle covers.
 * This helper reads that block and pre-stamps the corresponding
 * controlAdjudicationSnapshots rows with metVia='esp_inheritance' +
 * the espInheritance JSONB. The next rescore (fired by the bridge
 * intake on the same request) preserves the elevator per the operator-
 * driven-elevator-stickiness rule in scorer.ts.
 *
 * Inbound `esp` block shape (from TrainOS contract):
 *   {
 *     "designation":          "External Service Provider per 32 CFR § 170.4",
 *     "espName":              "MacTech TrainOS",
 *     "espType":              "cybersecurity-as-a-service",
 *     "implementsObjectives": ["AT.L2-3.2.1[a]", "AT.L2-3.2.1[b]", …],
 *     "specReference":        "CMMC L2 Assessment Guide v2.13, page 11"
 *   }
 *
 * Output `espInheritance` JSONB shape (existing Codex schema):
 *   {
 *     "provider_name": <espName>,
 *     "kind":          "csp" | "msp" | "mssp" | "caas",
 *     "objectives":    ["a", "b", …],   // letter list, control-scoped
 *     "evidence_ref":  "trainos:bundle:<package_sha256>"
 *   }
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { controlAdjudicationSnapshots } from "@/db/schema";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

// ─────────────────────────────────────────────────────────────────────
// Shape contract (Zod) for the inbound `esp` block. Permissive on
// designation + specReference (informational); strict on the fields
// that drive Codex behavior.
// ─────────────────────────────────────────────────────────────────────

export const EspBlockSchema = z.object({
  designation: z.string().max(500).optional(),
  espName: z.string().min(1).max(200),
  espType: z
    .enum(["cybersecurity-as-a-service", "managed-service-provider", "managed-security-service-provider", "cloud-service-provider"])
    .or(z.string().max(100)),
  implementsObjectives: z
    .array(z.string().regex(/^[A-Z]{2}\.L[12]-\d+\.\d+\.\d+\[[a-z]\]$/))
    .min(1)
    .max(500),
  specReference: z.string().max(200).optional(),
});

export type EspBlock = z.infer<typeof EspBlockSchema>;

/**
 * Map TrainOS espType strings → Codex's espInheritance.kind enum.
 * Defaults to "caas" since TrainOS is cybersecurity-as-a-service.
 */
function mapEspKind(espType: string): "csp" | "msp" | "mssp" | "caas" {
  const lower = espType.toLowerCase();
  if (lower.includes("cloud")) return "csp";
  if (lower.includes("security")) return "mssp";
  if (lower.includes("managed")) return "msp";
  return "caas";
}

/**
 * Parse an `implementsObjectives` array into a per-control objective
 * letter map.
 *
 * Input:  ["AT.L2-3.2.1[a]", "AT.L2-3.2.1[b]", "AT.L2-3.2.3[a]"]
 * Output: Map { "3.2.1" => ["a","b"], "3.2.3" => ["a"] }
 *
 * Strips the family prefix + level suffix (CMMC short form) and keeps
 * only the NIST short form which is what controlAdjudicationSnapshots
 * stores.
 */
export function parseImplementsObjectives(
  raw: string[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /^[A-Z]{2}\.L[12]-(\d+\.\d+\.\d+)\[([a-z])\]$/;
  for (const item of raw) {
    const m = item.match(re);
    if (!m) continue;
    const controlId = m[1];
    const objective = m[2];
    const list = out.get(controlId) ?? [];
    if (!list.includes(objective)) list.push(objective);
    list.sort();
    out.set(controlId, list);
  }
  return out;
}

interface ApplyInput {
  organizationId: string;
  espBlock: EspBlock;
  /** External evidence pointer; e.g. "trainos:bundle:<package_sha256>". */
  evidenceRef: string;
  /**
   * Restrict which controls the ESP block applies to. The bundle's
   * `implementsObjectives` may name objectives outside the bundle's
   * scope (e.g. a CA bundle naming an AT objective is suspicious),
   * so the caller passes the set of expected controls and we drop
   * anything else with a logged warning.
   */
  expectedControls: string[];
  triggeredByUserId?: string | null;
}

export interface ApplyResult {
  appliedControlIds: string[];
  skippedControlIds: string[];
  /** Snapshots updated (set metVia='esp_inheritance'). */
  snapshotsUpdated: number;
  /** Rescore tally returned by scoreControlsAffectedBy. */
  rescore: Awaited<ReturnType<typeof scoreControlsAffectedBy>>;
}

/**
 * Stamp the ESP block onto every snapshot in `expectedControls` whose
 * objectives are named in `espBlock.implementsObjectives`, then trigger
 * a rescore so the elevator locks in. Idempotent: re-running with the
 * same input is a no-op.
 *
 * Behavior when no snapshot row exists yet for a control: we INSERT a
 * minimal pre-rescore row so the scorer's prior-elevator branch fires
 * on the next pass. This handles the cold-start case (first ever ESP
 * declaration for an org+control).
 */
export async function applyEspInheritanceFromBundle(
  input: ApplyInput,
): Promise<ApplyResult> {
  const byControl = parseImplementsObjectives(input.espBlock.implementsObjectives);

  const expectedSet = new Set(input.expectedControls);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const controlId of byControl.keys()) {
    if (expectedSet.has(controlId)) {
      applied.push(controlId);
    } else {
      skipped.push(controlId);
    }
  }
  if (skipped.length > 0) {
    console.warn(
      `[esp-bridge-intake] dropping ${skipped.length} control(s) not in expectedControls: ${skipped.join(", ")}`,
    );
  }

  if (applied.length === 0) {
    return {
      appliedControlIds: [],
      skippedControlIds: skipped,
      snapshotsUpdated: 0,
      rescore: {
        rescored: 0,
        metFlipsToNotMet: 0,
        notMetFlipsToMet: 0,
        draftPoamsCreated: 0,
        poamElevatorsRevoked: 0,
        errored: 0,
      },
    };
  }

  let snapshotsUpdated = 0;

  for (const controlId of applied) {
    const objectives = byControl.get(controlId) ?? [];
    const espInheritance = {
      provider_name: input.espBlock.espName,
      kind: mapEspKind(input.espBlock.espType),
      objectives,
      evidence_ref: input.evidenceRef,
    };

    // Try UPDATE first; fall back to INSERT for the cold-start case.
    // The unique-ish (org, control) addressing is enforced by the
    // scorer's "latest snapshot wins" read; multiple rows are fine,
    // but we want to flip the *latest* one so the next rescore reads
    // the right prior state.
    const updated = await db.execute<{ id: string }>(sql`
      UPDATE control_adjudication_snapshots
      SET met_via = 'esp_inheritance',
          esp_inheritance = ${JSON.stringify(espInheritance)}::jsonb,
          aggregate_finding = 'MET'
      WHERE id = (
        SELECT id FROM control_adjudication_snapshots
        WHERE organization_id = ${input.organizationId}
          AND control_id = ${controlId}
        ORDER BY computed_at DESC
        LIMIT 1
      )
      RETURNING id
    `);

    if (updated.length === 0) {
      // Cold start — no prior snapshot. Insert a minimal row so the
      // next rescore's prior-state read finds the elevator. status
      // is the legacy bin-1-5 column (still NOT NULL); 'satisfies'
      // matches the elevator-MET semantics.
      await db.insert(controlAdjudicationSnapshots).values({
        organizationId: input.organizationId,
        controlId,
        status: "satisfies",
        confidence: 1,
        requirementsJson: [],
        objectiveVerdicts: objectives.map((o) => ({
          objective: o,
          verdict: "MET",
          evidence_ids: [],
          rationale: `ESP inheritance: ${input.espBlock.espName} (${input.espBlock.designation ?? "ESP per 32 CFR § 170.4"})`,
        })),
        aggregateFinding: "MET",
        metVia: "esp_inheritance",
        espInheritance,
      });
    }
    snapshotsUpdated++;
  }

  // Trigger the canonical rescore so the elevator locks in via the
  // operator-elevator-stickiness branch in scorer.ts.
  const rescore = await scoreControlsAffectedBy({
    organizationId: input.organizationId,
    triggerSource: "qms_manifest_ingested", // closest existing kind; could add 'esp_block_ingested' later
    controlIds: applied,
    triggeredByUserId: input.triggeredByUserId ?? null,
  });

  return {
    appliedControlIds: applied,
    skippedControlIds: skipped,
    snapshotsUpdated,
    rescore,
  };
}
