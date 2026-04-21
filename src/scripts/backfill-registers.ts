/**
 * Backfill governance registers for existing orgs after REGISTER_DEFINITIONS
 * and/or CONTROL_INTELLIGENCE.registerSchemaId has been updated in code.
 *
 * Three things this script does, in one transaction:
 *
 *   1. Upsert global register TEMPLATES (organizationId IS NULL) for every
 *      key in REGISTER_DEFINITIONS. New registers added to the catalog get
 *      their templates created; existing templates get their
 *      name/description/requiredColumns/retainForDays refreshed.
 *
 *   2. For each target org (or all orgs), upsert an org-scoped copy of every
 *      register in REGISTER_DEFINITIONS. Missing registers for the org are
 *      created. Existing ones are left alone (org-scoped copies may have
 *      been customized).
 *
 *   3. Rebuild the `controlIds` array on every org register using the
 *      current CONTROL_INTELLIGENCE mapping
 *      (intel.registerRequired && intel.registerSchemaId === registerKey).
 *      This corrects orgs whose controlIds were built against a stale
 *      registerSchemaId vocabulary.
 *
 * Usage:
 *   npx tsx src/scripts/backfill-registers.ts                 # all orgs, dry run
 *   npx tsx src/scripts/backfill-registers.ts --confirm       # all orgs, execute
 *   npx tsx src/scripts/backfill-registers.ts --email patrick@... --confirm
 *   npx tsx src/scripts/backfill-registers.ts --org-id <uuid> --confirm
 */
import { db } from "../db";
import {
  organizations,
  users,
  governanceRegisters,
  governanceRegisterEntries,
  governanceRegisterEntryFiles,
  boundaries,
} from "../db/schema";
import { eq, and, isNull, inArray, sql } from "drizzle-orm";
import { REGISTER_DEFINITIONS } from "../lib/governance/seed-data";
import { CONTROL_INTELLIGENCE } from "../data/cmmc/control-intelligence";

type Args = { email?: string; orgId?: string; confirm: boolean };

function parseArgs(argv: string[]): Args {
  const out: Args = { confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") out.email = argv[++i];
    else if (a === "--org-id") out.orgId = argv[++i];
    else if (a === "--confirm") out.confirm = true;
  }
  return out;
}

async function resolveTargetOrgIds(args: Args): Promise<string[]> {
  if (args.orgId) return [args.orgId];
  if (args.email) {
    const [row] = await db
      .select({ orgId: users.organizationId })
      .from(users)
      .where(eq(users.email, args.email))
      .limit(1);
    if (!row?.orgId) throw new Error(`No user/org for email "${args.email}"`);
    return [row.orgId];
  }
  const rows = await db.select({ id: organizations.id }).from(organizations);
  return rows.map((r) => r.id);
}

/** Build the registerKey → controlIds map from control-intelligence. */
function buildRegisterControlMap(): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const intel of CONTROL_INTELLIGENCE) {
    if (!intel.registerRequired || !intel.registerSchemaId) continue;
    const arr = map.get(intel.registerSchemaId) ?? [];
    arr.push(intel.controlId);
    map.set(intel.registerSchemaId, arr);
  }
  return map;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.confirm ? "EXECUTE" : "DRY RUN";
  const targetOrgIds = await resolveTargetOrgIds(args);
  const registerControlMap = buildRegisterControlMap();

  console.log("─".repeat(72));
  console.log(`Backfill governance registers`);
  console.log(`Mode:            ${mode}${args.confirm ? "" : " (pass --confirm to apply)"}`);
  console.log(`Target orgs:     ${targetOrgIds.length}`);
  console.log(`Registers in catalog: ${REGISTER_DEFINITIONS.length}`);
  console.log(`Control-register mappings: ${[...registerControlMap.values()].reduce((s, a) => s + a.length, 0)} across ${registerControlMap.size} keys`);
  console.log("─".repeat(72));

  // ── 1. Templates ──
  const existingTemplates = await db
    .select({ registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(isNull(governanceRegisters.organizationId));
  const templateKeys = new Set(existingTemplates.map((t) => t.registerKey));
  const missingTemplateKeys = REGISTER_DEFINITIONS.filter((d) => !templateKeys.has(d.registerKey));

  console.log(`Templates already present:    ${templateKeys.size}`);
  console.log(`Templates to insert (missing): ${missingTemplateKeys.length}  ${missingTemplateKeys.map((d) => d.registerKey).join(", ") || "(none)"}`);

  // ── 2. Per-org registers ──
  const catalogKeys = new Set(REGISTER_DEFINITIONS.map((d) => d.registerKey));
  type OrgPlan = {
    orgId: string;
    toInsert: string[];
    toUpdateControlIds: string[];
    staleToDelete: { key: string; registerId: string }[];
    staleWithEntries: { key: string; registerId: string; entryCount: number }[];
  };
  const orgPlans: OrgPlan[] = [];

  for (const orgId of targetOrgIds) {
    const rows = await db
      .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey, controlIds: governanceRegisters.controlIds })
      .from(governanceRegisters)
      .where(eq(governanceRegisters.organizationId, orgId));
    const haveByKey = new Map(rows.map((r) => [r.registerKey, r]));
    const toInsert = REGISTER_DEFINITIONS.filter((d) => !haveByKey.has(d.registerKey)).map((d) => d.registerKey);

    const toUpdateControlIds: string[] = [];
    const staleToDelete: { key: string; registerId: string }[] = [];
    const staleWithEntries: OrgPlan["staleWithEntries"] = [];

    for (const [key, r] of haveByKey) {
      if (!catalogKeys.has(key)) {
        // Stale key — not in current REGISTER_DEFINITIONS. Count entries via
        // boundary ↔ register_entries → if zero, safe to delete.
        const orgBoundaries = await db
          .select({ id: boundaries.id })
          .from(boundaries)
          .where(eq(boundaries.organizationId, orgId));
        const boundaryIds = orgBoundaries.map((b) => b.id);
        let cnt = 0;
        if (boundaryIds.length > 0) {
          const [row] = await db
            .select({ c: sql<number>`count(*)::int` })
            .from(governanceRegisterEntries)
            .where(
              and(
                eq(governanceRegisterEntries.registerId, r.id),
                inArray(governanceRegisterEntries.boundaryId, boundaryIds)
              )
            );
          cnt = row?.c ?? 0;
        }
        if (cnt === 0) {
          staleToDelete.push({ key, registerId: r.id });
        } else {
          staleWithEntries.push({ key, registerId: r.id, entryCount: cnt });
        }
        continue;
      }
      const expected = (registerControlMap.get(key) ?? []).slice().sort();
      const actual = ((r.controlIds ?? []) as string[]).slice().sort();
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        toUpdateControlIds.push(key);
      }
    }
    orgPlans.push({ orgId, toInsert, toUpdateControlIds, staleToDelete, staleWithEntries });
  }

  const totalInserts = orgPlans.reduce((s, p) => s + p.toInsert.length, 0);
  const totalUpdates = orgPlans.reduce((s, p) => s + p.toUpdateControlIds.length, 0);
  const totalStaleDelete = orgPlans.reduce((s, p) => s + p.staleToDelete.length, 0);
  const totalStaleKept = orgPlans.reduce((s, p) => s + p.staleWithEntries.length, 0);
  console.log(`Per-org register inserts:     ${totalInserts}`);
  console.log(`Per-org controlIds updates:   ${totalUpdates}`);
  console.log(`Stale registers to DELETE (zero entries):   ${totalStaleDelete}`);
  console.log(`Stale registers to KEEP (have entries):     ${totalStaleKept}`);
  for (const p of orgPlans) {
    if (
      p.toInsert.length === 0 &&
      p.toUpdateControlIds.length === 0 &&
      p.staleToDelete.length === 0 &&
      p.staleWithEntries.length === 0
    )
      continue;
    console.log(`  org ${p.orgId}`);
    if (p.toInsert.length) console.log(`    + insert:       ${p.toInsert.join(", ")}`);
    if (p.toUpdateControlIds.length) console.log(`    ~ rewrite IDs:  ${p.toUpdateControlIds.join(", ")}`);
    if (p.staleToDelete.length)
      console.log(`    - delete stale: ${p.staleToDelete.map((s) => s.key).join(", ")}`);
    if (p.staleWithEntries.length)
      console.log(
        `    ! stale WITH ENTRIES (kept):  ${p.staleWithEntries
          .map((s) => `${s.key}(${s.entryCount} entries)`)
          .join(", ")}`
      );
  }
  console.log("─".repeat(72));

  if (!args.confirm) {
    console.log("Dry run complete. Re-run with --confirm to apply.");
    return;
  }

  // ── Execute ──
  await db.transaction(async (tx) => {
    // 1. Templates
    for (const def of missingTemplateKeys) {
      await tx.insert(governanceRegisters).values({
        organizationId: null,
        projectId: null,
        registerKey: def.registerKey,
        name: def.name,
        description: def.description ?? null,
        requiredColumns: def.requiredColumns,
        retainForDays: def.retainForDays ?? null,
      });
    }

    // 2+3. Per-org inserts + controlIds rewrites
    for (const plan of orgPlans) {
      const defsByKey = new Map(REGISTER_DEFINITIONS.map((d) => [d.registerKey, d]));
      for (const key of plan.toInsert) {
        const def = defsByKey.get(key);
        if (!def) continue;
        const controlIds = registerControlMap.get(key) ?? [];
        await tx.insert(governanceRegisters).values({
          organizationId: plan.orgId,
          projectId: null,
          registerKey: def.registerKey,
          name: def.name,
          description: def.description ?? null,
          requiredColumns: def.requiredColumns,
          retainForDays: def.retainForDays ?? null,
          controlIds: controlIds.length > 0 ? controlIds : null,
        });
      }
      for (const key of plan.toUpdateControlIds) {
        const controlIds = registerControlMap.get(key) ?? [];
        await tx
          .update(governanceRegisters)
          .set({
            controlIds: controlIds.length > 0 ? controlIds : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(governanceRegisters.organizationId, plan.orgId),
              eq(governanceRegisters.registerKey, key)
            )
          );
      }
      // Delete zero-entry stale registers. Cascade via FKs handles the empty
      // governance_register_entries / files (there are none anyway).
      for (const stale of plan.staleToDelete) {
        // Belt-and-suspenders: delete any orphan entry-files + entries first
        // in case the FK is not onDelete:cascade.
        const orgBoundaries = await tx
          .select({ id: boundaries.id })
          .from(boundaries)
          .where(eq(boundaries.organizationId, plan.orgId));
        const boundaryIds = orgBoundaries.map((b) => b.id);
        if (boundaryIds.length > 0) {
          await tx
            .delete(governanceRegisterEntryFiles)
            .where(
              inArray(
                governanceRegisterEntryFiles.registerEntryId,
                tx
                  .select({ id: governanceRegisterEntries.id })
                  .from(governanceRegisterEntries)
                  .where(
                    and(
                      eq(governanceRegisterEntries.registerId, stale.registerId),
                      inArray(governanceRegisterEntries.boundaryId, boundaryIds)
                    )
                  )
              )
            );
          await tx
            .delete(governanceRegisterEntries)
            .where(eq(governanceRegisterEntries.registerId, stale.registerId));
        }
        await tx
          .delete(governanceRegisters)
          .where(eq(governanceRegisters.id, stale.registerId));
      }
    }
  });

  console.log(
    `✓ Backfill applied. Inserted ${missingTemplateKeys.length} template(s), ` +
      `${totalInserts} org register(s), rewrote controlIds on ${totalUpdates} existing register(s), ` +
      `and deleted ${totalStaleDelete} zero-entry stale register(s)${
        totalStaleKept > 0
          ? ` (${totalStaleKept} stale register(s) kept because they had entries — migrate manually)`
          : ""
      }.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

// Silence unused-import warnings for drizzle helpers we may pull in over time.
void sql;
