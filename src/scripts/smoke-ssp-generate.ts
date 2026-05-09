/**
 * Smoke test: generate an SSP for MacTech end-to-end, verify it
 * persists, and dump a few facts about the result.
 *
 * npx tsx src/scripts/smoke-ssp-generate.ts
 */
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { generateSsp } from "@/lib/ssp/generate";

(async () => {
  const slug = process.argv[2] ?? "mactech-solutions-llc";
  const [org] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) throw new Error(`Org not found: ${slug}`);

  console.log(`Generating SSP for ${slug}…`);
  const t0 = Date.now();
  const r = await generateSsp({ organizationId: org.id });
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log(`done in ${elapsed}s:`, JSON.stringify(r, null, 2));
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
