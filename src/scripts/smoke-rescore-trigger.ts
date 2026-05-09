/**
 * Smoke test for scoreControlsAffectedBy. Read-only against the
 * canonical helper output (the rescore trigger DOES write — but
 * idempotent and Phase B-deliberate).
 *
 * npx tsx src/scripts/smoke-rescore-trigger.ts mactech-solutions-llc
 */
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

(async () => {
  const slug = process.argv[2] ?? "mactech-solutions-llc";
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) throw new Error(`Org not found: ${slug}`);

  console.log(`Triggering full rescore for ${slug}…`);
  const t0 = Date.now();
  const r = await scoreControlsAffectedBy({
    organizationId: org.id,
    triggerSource: "phase_b_full_rescore",
  });
  console.log(
    `done in ${Math.round((Date.now() - t0) / 1000)}s:`,
    JSON.stringify(r),
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
