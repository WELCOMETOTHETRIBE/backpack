/**
 * Diagnostic — compare OLD vs NEW isControlAdjudicated() output for the
 * MacTech org. Surfaces the exact controls that re-classify under the
 * bin-specific lane rule.
 *
 *   railway run --service CMMC bun run src/scripts/diagnose-adjudication-delta.ts
 */

import { db } from "@/db";
import { controlRecords, organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  computeAdjudicationContext,
  hasOperationalEvidence,
  hasGovernanceEvidence,
  needsBothPipelines,
  type ControlRecordRow,
  type AdjudicationContext,
} from "@/lib/adjudication-helpers";
import { getSatisfactionSources } from "@/lib/compliance/satisfaction-sources";

const MACTECH_ORG_ID = "901cc0c7-79b1-466b-a402-14c3ec7771ff";

/** Pre-fix adjudication: any operational lane satisfies non-hybrid. */
function isControlAdjudicated_OLD(r: ControlRecordRow, ctx: AdjudicationContext): boolean {
  if (r.implementationStatus === "inherited") return true;
  if (r.implementationStatus === "not_applicable") return true;
  if (r.implementationStatus === "implemented" || r.implementationStatus === "assessed") {
    if (
      needsBothPipelines(r.controlId) &&
      !ctx.cloudPipelineSatisfiedNistIds.has(r.controlId) &&
      !ctx.attestationBackedRecordIds.has(r.id)
    ) {
      return false;
    }
    if (r.policyDocRequired) {
      return (
        r.technicalStatus === "satisfied" &&
        r.policyStatus === "satisfied" &&
        hasOperationalEvidence(r, ctx)
      );
    }
    return hasOperationalEvidence(r, ctx);
  }
  return false;
}

/** Post-fix adjudication: bin-specific lane requirements. */
function isControlAdjudicated_NEW(r: ControlRecordRow, ctx: AdjudicationContext): boolean {
  if (r.implementationStatus === "inherited") return true;
  if (r.implementationStatus === "not_applicable") return true;
  if (r.implementationStatus === "implemented" || r.implementationStatus === "assessed") {
    if (
      needsBothPipelines(r.controlId) &&
      !ctx.cloudPipelineSatisfiedNistIds.has(r.controlId) &&
      !ctx.attestationBackedRecordIds.has(r.id)
    ) {
      return false;
    }
    if (r.policyDocRequired) {
      return (
        r.technicalStatus === "satisfied" &&
        r.policyStatus === "satisfied" &&
        hasOperationalEvidence(r, ctx)
      );
    }
    const sources = getSatisfactionSources(r.controlId);
    if (sources.governance && !sources.os && !sources.cloud) {
      return hasGovernanceEvidence(r, ctx);
    }
    if (sources.os || sources.cloud) {
      return r.technicalStatus === "satisfied";
    }
    return hasOperationalEvidence(r, ctx);
  }
  return false;
}

function bin(controlId: string): string {
  const s = getSatisfactionSources(controlId);
  if (s.hybrid) return "Hybrid";
  if (s.governance && !s.os && !s.cloud) return "Governance-only";
  if (s.os && s.cloud) return "OS+Cloud";
  if (s.os) return "OS-only";
  if (s.cloud) return "Cloud-only";
  return "Unbinned";
}

async function main() {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, MACTECH_ORG_ID));
  console.log(`Org: ${org?.name ?? "?"} (${MACTECH_ORG_ID})\n`);

  const records = (await db
    .select({
      id: controlRecords.id,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyDocRequired: controlRecords.policyDocRequired,
      policyStatus: controlRecords.policyStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, MACTECH_ORG_ID))) as ControlRecordRow[];

  console.log(`Loaded ${records.length} control records.`);

  const ctx = await computeAdjudicationContext(MACTECH_ORG_ID, records.map((r) => r.id));

  let oldAdj = 0;
  let newAdj = 0;
  const reclassified: ControlRecordRow[] = [];

  for (const r of records) {
    const o = isControlAdjudicated_OLD(r, ctx);
    const n = isControlAdjudicated_NEW(r, ctx);
    if (o) oldAdj++;
    if (n) newAdj++;
    if (o && !n) reclassified.push(r);
  }

  console.log(`\nOLD rule:  ${oldAdj} adjudicated / ${records.length}`);
  console.log(`NEW rule:  ${newAdj} adjudicated / ${records.length}`);
  console.log(`Delta:     ${oldAdj - newAdj} control(s) re-classify outstanding\n`);

  if (reclassified.length === 0) {
    console.log("No controls re-classify. Existing data already aligns with bin-specific rule.");
    return;
  }

  console.log("Re-classified (was MET, now OUTSTANDING):");
  console.log("─".repeat(96));
  console.log(
    "control │ bin              │ impl       │ tech       │ policy     │ has-art │ has-att │ register#"
  );
  console.log("─".repeat(96));
  for (const r of reclassified) {
    const b = bin(r.controlId);
    const hasArt = ctx.artifactBackedRecordIds.has(r.id) ? "yes" : "no";
    const hasAtt = ctx.attestationBackedRecordIds.has(r.id) ? "yes" : "no";
    const intel = ctx.intelMap.get(r.controlId);
    const regKey = intel?.registerSchemaId ?? "—";
    const regCount = intel?.registerSchemaId
      ? ctx.registerFinalCounts.get(intel.registerSchemaId) ?? 0
      : "—";
    console.log(
      `${r.controlId.padEnd(7)} │ ${b.padEnd(16)} │ ${r.implementationStatus.padEnd(10)} │ ${r.technicalStatus.padEnd(10)} │ ${r.policyStatus.padEnd(10)} │ ${hasArt.padEnd(7)} │ ${hasAtt.padEnd(7)} │ ${regCount} (${regKey})`
    );
  }
  console.log("─".repeat(96));
  console.log("\nFix path per control:");
  for (const r of reclassified) {
    const sources = getSatisfactionSources(r.controlId);
    if (sources.governance && !sources.os && !sources.cloud) {
      console.log(
        `  ${r.controlId} (Governance-only) → upload artifact, complete a register entry, or sign attestation`
      );
    } else if (sources.os || sources.cloud) {
      console.log(
        `  ${r.controlId} (${bin(r.controlId)}) → OS Collector / cloud validator must produce a passing finding (technicalStatus → satisfied)`
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
