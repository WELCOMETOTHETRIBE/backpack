/**
 * Bridge between an ingested QMS manifest and the OIS narrative engine.
 * Called from POST /api/integrations/qms-manifest/ingest after a
 * successful insert.
 *
 * Two responsibilities:
 *
 * 1. **Bump freshness.** For every governance-18 control_id touched by the
 *    manifest, set `controlObservedImplementations.mostRecentEvidenceAt`
 *    to max(current, manifest.generated_at). This is what feeds the
 *    Phase 8 freshness/staleness projection — once a manifest lands,
 *    those controls are "freshly attested" until the next freshness
 *    cycle.
 *
 * 2. **Regenerate the narrative.** Re-run regenerateOIS over the
 *    affected control_ids so the appended "Documentation: ..." section
 *    reflects the latest manifest. The OIS engine already knows how to
 *    pull QMS doc state via the v2.1 contract; this just nudges it.
 *
 * Failure-tolerant — every step logs and moves on. The ingest endpoint
 * should never fail because OIS regen failed.
 */

import { db } from "@/db";
import { controlObservedImplementations } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { GOVERNANCE_18_CONTROL_IDS } from "@/lib/compliance/governance-18-analysis";
import { regenerateOIS } from "./ois-generator";

const GOVERNANCE_18_SET = new Set(GOVERNANCE_18_CONTROL_IDS);

interface BridgeContext {
  orgId: string;
  controlsTouched: string[];
  manifestRunId: string;
  manifestGeneratedAt: Date;
}

export async function regenerateOISForManifest(
  ctx: BridgeContext,
): Promise<void> {
  const governanceTouched = ctx.controlsTouched.filter((c) =>
    GOVERNANCE_18_SET.has(c),
  );
  if (governanceTouched.length === 0) {
    // Manifest did touch some controls but none in the governance-18 set.
    // Nothing to regenerate; the SCTM evidence chain still picked up the
    // manifest reference via its own Drizzle insert.
    return;
  }

  // 1. Freshness bump. Done as one UPDATE per control via Drizzle's
  //    `sql` template so the GREATEST() comparison runs in PG.
  for (const controlId of governanceTouched) {
    try {
      await db
        .update(controlObservedImplementations)
        .set({
          mostRecentEvidenceAt: sql`GREATEST(
            ${controlObservedImplementations.mostRecentEvidenceAt},
            ${ctx.manifestGeneratedAt}
          )`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(controlObservedImplementations.organizationId, ctx.orgId),
            eq(controlObservedImplementations.controlId, controlId),
          ),
        );
    } catch (err) {
      console.error(
        `[qms-manifest-ois-bridge] freshness bump failed for ${controlId}:`,
        err,
      );
    }
  }

  // 2. Narrative regeneration. The OIS engine accepts a period bound and
  //    a list of control_ids. Use the manifest's generated_at as the
  //    period_end, with a 7-day lookback as the period_start (matches
  //    the ISSO weekly-export cadence). Manifest is the trigger; the
  //    engine pulls the actual evidence (registers + QMS contract) it
  //    needs at narrative-render time.
  const periodStart = new Date(
    ctx.manifestGeneratedAt.getTime() - 7 * 24 * 60 * 60 * 1000,
  );

  try {
    await regenerateOIS(
      {
        orgId: ctx.orgId,
        periodStartUtc: periodStart,
        periodEndUtc: ctx.manifestGeneratedAt,
        manifestId: ctx.manifestRunId,
      },
      governanceTouched,
    );
  } catch (err) {
    console.error(
      "[qms-manifest-ois-bridge] regenerateOIS failed:",
      err,
    );
  }
}
