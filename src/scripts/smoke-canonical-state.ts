/**
 * One-shot smoke test for the canonical getControlState helper.
 * Read-only. Verifies the helper returns the expected shape against
 * MacTech's existing snapshot data.
 *
 * npx tsx src/scripts/smoke-canonical-state.ts
 */
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import {
  getControlState,
  getControlStatesForOrg,
} from "@/lib/canonical-state/get-control-state";

(async () => {
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, "mactech-solutions-llc"))
    .limit(1);
  if (!org) throw new Error("MacTech not found");

  for (const cid of ["3.1.1", "3.11.1", "3.6.1", "3.13.1", "3.12.4"]) {
    const s = await getControlState(org.id, cid);
    console.log(
      cid,
      s
        ? JSON.stringify({
            finding: s.aggregateFinding,
            metVia: s.metVia,
            cae: s.caeRollup,
            bin: s.binStatus,
            sub: s.binSubLabel,
            conf: s.confidence,
            objCount: s.objectives.length,
          })
        : "(no snapshot)",
    );
  }

  const all = await getControlStatesForOrg(org.id);
  const tally = { MET: 0, NOT_MET: 0, NA: 0 };
  for (const s of all.values()) tally[s.aggregateFinding]++;
  console.log(
    "\norg-wide rollup:",
    JSON.stringify({ controlsWithSnapshot: all.size, ...tally }),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
