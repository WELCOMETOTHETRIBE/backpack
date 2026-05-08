/**
 * Recover an org whose onboarding wizard completed but whose downstream
 * pipeline (control_records seed, boundary creation, register provisioning)
 * never ran — typically because /api/onboarding/complete failed validation.
 *
 * This is the same pipeline the API route runs, minus the auth gate.
 *
 *   1. Org metadata persists (cageCode, primaryAddress, etc.) from the
 *      stored onboardingWizardState.phaseData.
 *   2. All 110 control_records are inserted (skip if any already exist).
 *   3. boundaryProfile.selectedTechnologies is set from Phase 3, and any
 *      inherited controls from getInheritedControls() are flipped.
 *   4. A "MacTech CUI Vault" boundary row is created if missing
 *      (cloudProvider=azure, azureEnvironment=gov).
 *   5. syncOrgAzureInheritedControls flips 3.10.1–.5 to inherited.
 *   6. syncInheritedControls runs for any external service providers.
 *   7. Governance registers (org-scoped copies of the catalog templates)
 *      are seeded.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx src/scripts/recover-onboarding.ts --email patrick@... --confirm
 *   DATABASE_URL=... npx tsx src/scripts/recover-onboarding.ts --org-id <uuid> --confirm
 *
 * Default mode is DRY RUN — prints what would happen, makes no changes.
 */
import { db } from "../db";
import {
  organizations,
  users,
  onboardingWizardState,
  controlRecords,
  boundaryProfiles,
  boundaries,
  governanceRegisters,
} from "../db/schema";
import { eq, and, sql } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "../lib/artifact-guide";
import { getInheritedControls } from "../lib/compliance/inherited-controls";
import { syncOrgAzureInheritedControls } from "../lib/compliance/azure-inherited-controls";
import { syncInheritedControls } from "../lib/boundary/sync-inherited-controls";
import { REGISTER_DEFINITIONS } from "../lib/governance/seed-data";
import { CONTROL_INTELLIGENCE } from "../data/cmmc/control-intelligence";

function parseArgs(argv: string[]) {
  const out: { email?: string; orgId?: string; confirm: boolean } = { confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") out.email = argv[++i];
    else if (a === "--org-id") out.orgId = argv[++i];
    else if (a === "--confirm") out.confirm = true;
  }
  return out;
}

async function resolveOrgAndActor(args: ReturnType<typeof parseArgs>): Promise<{
  orgId: string;
  actorId: string;
}> {
  if (args.orgId) {
    const [u] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.organizationId, args.orgId))
      .limit(1);
    if (!u) throw new Error(`No user found for org ${args.orgId}`);
    return { orgId: args.orgId, actorId: u.id };
  }
  if (args.email) {
    const [u] = await db
      .select({ id: users.id, orgId: users.organizationId })
      .from(users)
      .where(eq(users.email, args.email))
      .limit(1);
    if (!u?.orgId) throw new Error(`No user/org for email "${args.email}"`);
    return { orgId: u.orgId, actorId: u.id };
  }
  throw new Error("Provide --email or --org-id");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.confirm ? "EXECUTE" : "DRY RUN";
  const { orgId, actorId } = await resolveOrgAndActor(args);

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new Error(`Org ${orgId} not found`);

  const [state] = await db
    .select()
    .from(onboardingWizardState)
    .where(eq(onboardingWizardState.organizationId, orgId))
    .limit(1);
  if (!state) throw new Error(`No onboarding_wizard_state for org ${orgId}`);

  const phaseData = (state.phaseData as Record<string, unknown>) ?? {};
  const phase0 = (phaseData["0"] ?? {}) as Record<string, unknown>;
  const phase1 = (phaseData["1"] ?? {}) as Record<string, unknown>;
  const owner = (phase1.systemOwner ?? {}) as Record<string, unknown>;
  const phase3 = (phaseData["3"] ?? {}) as Record<string, unknown>;

  // Reconstruct the body the wizard would have sent (with nulls stripped).
  const body: {
    name?: string;
    cageCode?: string;
    primaryAddress?: string;
    primaryContactName?: string;
    primaryContactEmail?: string;
    cmmcTargetLevel?: string;
    cuiBoundary?: string;
    systemScope?: string;
    selectedTechnologies?: string[];
  } = {};
  const set = <K extends keyof typeof body>(k: K, v: unknown) => {
    if (v == null) return;
    if (typeof v === "string" && v.length === 0) return;
    (body as Record<string, unknown>)[k] = v;
  };
  set("name", phase1.orgName);
  set("cageCode", phase0.cageCode);
  set("primaryAddress", phase1.address);
  set("primaryContactName", owner.name);
  set("primaryContactEmail", owner.email);
  body.cmmcTargetLevel = "L2";
  set("cuiBoundary", phase1.systemDescription);
  set("systemScope", phase1.systemDescription);
  if (Array.isArray(phase3.scopeComponents)) {
    body.selectedTechnologies = phase3.scopeComponents as string[];
  }

  console.log("─".repeat(72));
  console.log(`Recover onboarding pipeline`);
  console.log(`Mode:        ${mode}${args.confirm ? "" : " (pass --confirm to apply)"}`);
  console.log(`Org:         ${org.name} (${orgId})`);
  console.log(`Actor user:  ${actorId}`);
  console.log(`Body:        ${JSON.stringify(body, null, 2).split("\n").join("\n             ")}`);
  console.log("─".repeat(72));

  // Inspect current state
  const existingControls = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));
  const existingBoundaries = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const existingRegisters = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  console.log(`Current state:`);
  console.log(`  control_records:      ${existingControls[0]?.count ?? 0} (need 110)`);
  console.log(`  boundaries:           ${existingBoundaries[0]?.count ?? 0} (need ≥1)`);
  console.log(`  org-scoped registers: ${existingRegisters[0]?.count ?? 0} (need ${REGISTER_DEFINITIONS.length})`);
  console.log("─".repeat(72));

  if (!args.confirm) {
    console.log("Dry run complete. Re-run with --confirm to apply.");
    return;
  }

  // 1. Persist org metadata
  const orgUpdates: Record<string, string | null> = {
    organizationType: null,
    cmmcTargetLevel: body.cmmcTargetLevel ?? null,
  };
  if (body.name) orgUpdates.name = body.name.trim();
  if (body.cageCode) orgUpdates.cageCode = body.cageCode.slice(0, 10);
  if (body.primaryAddress) orgUpdates.primaryAddress = body.primaryAddress;
  if (body.primaryContactName)
    orgUpdates.primaryContactName = body.primaryContactName.slice(0, 255);
  if (body.primaryContactEmail)
    orgUpdates.primaryContactEmail = body.primaryContactEmail.slice(0, 255);
  await db.update(organizations).set(orgUpdates).where(eq(organizations.id, orgId));
  console.log(`✓ Org metadata persisted`);

  // 2. Seed all 110 control_records
  const haveControls = await db
    .select({ id: controlRecords.id })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId))
    .limit(1);
  if (haveControls.length === 0) {
    await db.insert(controlRecords).values(
      ALL_CONTROL_IDS.map((controlId) => ({ organizationId: orgId, controlId }))
    );
    console.log(`✓ Seeded ${ALL_CONTROL_IDS.length} control_records`);
  } else {
    // Some controls exist but not all — fill in missing ones.
    const existingSet = await db
      .select({ controlId: controlRecords.controlId })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId));
    const existingIds = new Set(existingSet.map((r) => r.controlId));
    const missing = ALL_CONTROL_IDS.filter((id) => !existingIds.has(id));
    if (missing.length > 0) {
      await db.insert(controlRecords).values(
        missing.map((controlId) => ({ organizationId: orgId, controlId }))
      );
      console.log(`✓ Filled in ${missing.length} missing control_records (${existingIds.size} already existed)`);
    } else {
      console.log(`✓ All 110 control_records already exist`);
    }
  }

  // 3. boundary_profile + inherited controls from selectedTechnologies
  const techs = body.selectedTechnologies ?? [];
  if (techs.length > 0) {
    const [existingProfile] = await db
      .select({ id: boundaryProfiles.id })
      .from(boundaryProfiles)
      .where(eq(boundaryProfiles.organizationId, orgId))
      .limit(1);
    const dedup = [...new Set(techs)];
    if (existingProfile) {
      await db
        .update(boundaryProfiles)
        .set({ selectedTechnologies: dedup, updatedAt: new Date() })
        .where(eq(boundaryProfiles.id, existingProfile.id));
    } else {
      await db.insert(boundaryProfiles).values({
        organizationId: orgId,
        selectedTechnologies: dedup,
      });
    }
    const inherited = getInheritedControls(dedup);
    for (const { controlId, inheritedFrom } of inherited) {
      await db
        .update(controlRecords)
        .set({
          implementationStatus: "inherited",
          inheritedFrom,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            eq(controlRecords.controlId, controlId)
          )
        );
    }
    console.log(`✓ boundary_profile set (${dedup.length} techs); ${inherited.length} controls flipped to inherited`);
  }

  // 4. CUI boundary row
  const [existingBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  if (!existingBoundary) {
    await db.insert(boundaries).values({
      organizationId: orgId,
      name: "MacTech CUI Vault",
      description:
        "Primary CUI processing boundary. Runs on MacTech's Azure Government / FedRAMP High enclave; managed by MacTech.",
      scopeComponents: ["mactech_vault_azure_gov"],
      boundaryType: "cui_enclave",
      cloudProvider: "azure",
      azureEnvironment: "gov",
    });
    console.log(`✓ Created MacTech CUI Vault boundary`);
  } else {
    console.log(`✓ Boundary already exists (${existingBoundary.id})`);
  }

  // 5. Sync Azure-inherited controls (3.10.1–.5)
  await syncOrgAzureInheritedControls(db, orgId);
  console.log(`✓ Synced Azure inherited controls (3.10.1–.5)`);

  // 6. Sync external-service-provider inherited controls
  await syncInheritedControls(orgId, actorId);
  console.log(`✓ Synced external-service-provider inherited controls`);

  // 7. Org-scoped governance registers
  const haveRegs = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId))
    .limit(1);
  if (haveRegs.length === 0) {
    const registerControlMap = new Map<string, string[]>();
    for (const intel of CONTROL_INTELLIGENCE) {
      if (intel.registerRequired && intel.registerSchemaId) {
        const arr = registerControlMap.get(intel.registerSchemaId) ?? [];
        arr.push(intel.controlId);
        registerControlMap.set(intel.registerSchemaId, arr);
      }
    }
    for (const def of REGISTER_DEFINITIONS) {
      const cids = registerControlMap.get(def.registerKey) ?? [];
      await db.insert(governanceRegisters).values({
        organizationId: orgId,
        projectId: null,
        registerKey: def.registerKey,
        name: def.name,
        description: def.description ?? null,
        requiredColumns: def.requiredColumns,
        retainForDays: def.retainForDays ?? null,
        controlIds: cids.length > 0 ? cids : null,
      });
    }
    console.log(`✓ Seeded ${REGISTER_DEFINITIONS.length} org-scoped registers`);
  } else {
    console.log(`✓ Org-scoped registers already exist (count visible above)`);
  }

  console.log("─".repeat(72));
  console.log(`Recovery complete for ${org.name}.`);
  console.log("─".repeat(72));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
