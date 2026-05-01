/**
 * Void pre-rewrite attestations so customers re-sign against current
 * first-person template language.
 *
 * Why: commit f3798bc rewrote all 14 attestation templates from third-person
 * ("the customer attests…") to first-person ("I attest, on behalf of our
 * organization, that we…"). The SHA-256 dataHash on each historical signature
 * binds to the OLD canonical text — so existing signatures remain valid for
 * what they were signed against, but the live legal language they reference
 * no longer matches what we're displaying. The clean C3PAO-defensible move
 * is to void the Lane-4 evidence (which is what the wizard's liveStatus
 * checks) so the wizard prompts customers to re-sign against the current
 * template, while preserving the historical `attestations` rows in the
 * audit trail with a "superseded" annotation.
 *
 * What this script does (per affected org):
 *   1. Finds every `governance_artifact_completions` row where:
 *        artifactType = 'ATTESTATION'
 *        AND artifactLabel ∈ {14 attestation template IDs}
 *        AND attestedAt < CUTOFF_TIMESTAMP (template-rewrite commit)
 *   2. For each, finds the matching `attestations` row(s) and appends a
 *      "[SUPERSEDED <UTC>] …" annotation to comment.
 *   3. Deletes the `governance_artifact_completions` row (Lane-4 evidence).
 *      The wizard's liveStatus check is now per-attestation; deleting this
 *      row is what makes the card flip back to "Open".
 *   4. If `control_records.implementationStatus` matches what the attest
 *      route would have set (na_attestation→not_applicable,
 *      customer_attested_inherited→inherited, implemented_attestation→
 *      implemented) AND the kind isn't na_architecture_static (per the
 *      snapshot), resets implementationStatus to 'not_started'. This is
 *      conservative — we only roll back state we're confident the
 *      attestation set. For na_attestations on controls already pre-classified
 *      N/A in CONTROL_INTELLIGENCE, we leave the disposition alone.
 *
 * Default mode is DRY RUN — prints the plan without writing. Pass --confirm
 * to apply. Filterable by --org-id or --email.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx src/scripts/void-pre-rewrite-attestations.ts
 *   DATABASE_URL=... npx tsx src/scripts/void-pre-rewrite-attestations.ts --confirm
 *   DATABASE_URL=... npx tsx src/scripts/void-pre-rewrite-attestations.ts --email patrick@... --confirm
 *   DATABASE_URL=... npx tsx src/scripts/void-pre-rewrite-attestations.ts --org-id <uuid> --confirm
 */
import { db } from "../db";
import {
  attestations,
  controlRecords,
  governanceArtifactCompletions,
  organizations,
  users,
} from "../db/schema";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import {
  ATTESTATION_TEMPLATES,
  ATTESTATION_TEMPLATE_IDS,
  getAttestationTemplate,
} from "../lib/compliance/attestation-templates";
import { NOT_APPLICABLE_10_CONTROL_IDS } from "../lib/compliance/outstanding-controls";

// Template-rewrite commit timestamp. Anything signed before this used the
// pre-rewrite (third-person) template language whose dataHash no longer
// matches the live canonical text.
//
// f3798bc — fix(wizard) — committed 2026-04-30T20:34:42-07:00 (PDT),
// which is 2026-05-01T03:34:42Z UTC. Add a 1-minute buffer to catch
// in-flight signs that landed between the commit and Railway redeploy.
const CUTOFF = new Date("2026-05-01T03:36:00Z");

const TEMPLATE_LABEL_SET = new Set<string>(ATTESTATION_TEMPLATE_IDS);

// Controls already pre-classified N/A by CONTROL_INTELLIGENCE — for these,
// implementationStatus=not_applicable is the architecture default, NOT
// something the attestation set. We leave their disposition alone on void.
const ARCH_NA_DEFAULTS = new Set<string>(NOT_APPLICABLE_10_CONTROL_IDS);

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

interface VoidPlan {
  organizationId: string;
  organizationName: string;
  /** governance_artifact_completion id → completion data */
  completions: {
    id: string;
    controlRecordId: string;
    controlId: string;
    artifactLabel: string;
    attestedAt: Date | null;
  }[];
  /** Per control, the implementationStatus reset (or null = leave alone). */
  statusResets: { controlRecordId: string; controlId: string; from: string; to: string | null }[];
  /** Matching attestations rows that get a SUPERSEDED comment annotation. */
  attestationsToAnnotate: { id: string; controlRecordId: string }[];
}

async function buildPlan(orgId: string): Promise<VoidPlan> {
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // Step 1: pre-rewrite Lane-4 attestation completions
  const completions = await db
    .select({
      id: governanceArtifactCompletions.id,
      controlRecordId: governanceArtifactCompletions.controlRecordId,
      artifactLabel: governanceArtifactCompletions.artifactLabel,
      attestedAt: governanceArtifactCompletions.attestedAt,
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
    })
    .from(governanceArtifactCompletions)
    .innerJoin(
      controlRecords,
      eq(governanceArtifactCompletions.controlRecordId, controlRecords.id)
    )
    .where(
      and(
        eq(governanceArtifactCompletions.organizationId, orgId),
        eq(governanceArtifactCompletions.artifactType, "ATTESTATION"),
        inArray(
          governanceArtifactCompletions.artifactLabel,
          [...TEMPLATE_LABEL_SET]
        ),
        lt(governanceArtifactCompletions.attestedAt, CUTOFF)
      )
    );

  // Step 2: figure out which control_records to revert disposition on
  const statusResets: VoidPlan["statusResets"] = [];
  for (const c of completions) {
    const tmpl = getAttestationTemplate(c.artifactLabel);
    if (!tmpl) continue;

    let expectedStatus: "not_applicable" | "inherited" | "implemented";
    if (tmpl.kind === "na_attestation") expectedStatus = "not_applicable";
    else if (tmpl.kind === "customer_attested_inherited") expectedStatus = "inherited";
    else expectedStatus = "implemented";

    // Don't revert if implementationStatus diverged from what the route would
    // have set — someone else changed it, leave it alone.
    if (c.implementationStatus !== expectedStatus) continue;

    // For controls already pre-classified N/A by architecture, leave the
    // disposition at not_applicable — it's the static default, not a state
    // the attestation set.
    if (
      tmpl.kind === "na_attestation" &&
      ARCH_NA_DEFAULTS.has(c.controlId)
    ) {
      continue;
    }

    statusResets.push({
      controlRecordId: c.controlRecordId,
      controlId: c.controlId,
      from: c.implementationStatus,
      to: "not_started",
    });
  }

  // Step 3: matching attestations rows to annotate
  const recordIds = [...new Set(completions.map((c) => c.controlRecordId))];
  const matchingAttestations =
    recordIds.length > 0
      ? await db
          .select({ id: attestations.id, resourceId: attestations.resourceId })
          .from(attestations)
          .where(
            and(
              eq(attestations.organizationId, orgId),
              eq(attestations.resourceType, "control_record"),
              inArray(attestations.resourceId, recordIds),
              lt(attestations.attestedAt, CUTOFF)
            )
          )
      : [];

  return {
    organizationId: orgId,
    organizationName: org?.name ?? "(unknown)",
    completions: completions.map((c) => ({
      id: c.id,
      controlRecordId: c.controlRecordId,
      controlId: c.controlId,
      artifactLabel: c.artifactLabel,
      attestedAt: c.attestedAt,
    })),
    statusResets,
    attestationsToAnnotate: matchingAttestations.map((a) => ({
      id: a.id,
      controlRecordId: a.resourceId,
    })),
  };
}

async function applyPlan(plan: VoidPlan): Promise<void> {
  const supersededNote = `\n\n[SUPERSEDED ${new Date().toISOString()}] Attestation template language was revised to first-person voice for C3PAO defensibility. Original signature remains in the audit trail; customer must re-sign against the current template (visible in the Outstanding Controls Wizard).`;

  await db.transaction(async (tx) => {
    // 1. Annotate attestations rows
    for (const a of plan.attestationsToAnnotate) {
      await tx
        .update(attestations)
        .set({
          comment: sql`COALESCE(${attestations.comment}, '') || ${supersededNote}`,
        })
        .where(eq(attestations.id, a.id));
    }

    // 2. Delete the Lane-4 completion rows
    if (plan.completions.length > 0) {
      await tx
        .delete(governanceArtifactCompletions)
        .where(
          inArray(
            governanceArtifactCompletions.id,
            plan.completions.map((c) => c.id)
          )
        );
    }

    // 3. Reset implementationStatus for the controls we're confident
    //    were flipped by the attestation
    for (const r of plan.statusResets) {
      if (r.to === null) continue;
      await tx
        .update(controlRecords)
        .set({
          implementationStatus: r.to as "not_started",
          inheritedFrom: null,
          updatedAt: new Date(),
        })
        .where(eq(controlRecords.id, r.controlRecordId));
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targetOrgIds = await resolveTargetOrgIds(args);
  const mode = args.confirm ? "EXECUTE" : "DRY RUN";

  console.log("─".repeat(72));
  console.log(`Void pre-rewrite attestations`);
  console.log(`Mode:           ${mode}${args.confirm ? "" : " (pass --confirm to apply)"}`);
  console.log(`Cutoff:         ${CUTOFF.toISOString()}`);
  console.log(`Target orgs:    ${targetOrgIds.length}`);
  console.log(`Template IDs:   ${ATTESTATION_TEMPLATES.length}`);
  console.log("─".repeat(72));

  let totalCompletions = 0;
  let totalResets = 0;
  let totalAnnotations = 0;

  for (const orgId of targetOrgIds) {
    const plan = await buildPlan(orgId);
    if (
      plan.completions.length === 0 &&
      plan.statusResets.length === 0 &&
      plan.attestationsToAnnotate.length === 0
    ) {
      continue;
    }

    console.log(`\norg ${plan.organizationName} (${plan.organizationId})`);
    console.log(`  Completions to delete: ${plan.completions.length}`);
    for (const c of plan.completions) {
      console.log(
        `    - ${c.controlId} via ${c.artifactLabel} signed ${c.attestedAt?.toISOString() ?? "(unknown)"}`
      );
    }
    console.log(`  Status resets (→ not_started): ${plan.statusResets.length}`);
    for (const r of plan.statusResets) {
      console.log(`    - ${r.controlId}: ${r.from} → ${r.to}`);
    }
    console.log(`  Attestations to annotate (audit trail): ${plan.attestationsToAnnotate.length}`);

    totalCompletions += plan.completions.length;
    totalResets += plan.statusResets.length;
    totalAnnotations += plan.attestationsToAnnotate.length;

    if (args.confirm) {
      await applyPlan(plan);
      console.log(`  ✓ Applied`);
    }
  }

  console.log("\n" + "─".repeat(72));
  console.log(
    `Totals: ${totalCompletions} completion(s) ${
      args.confirm ? "deleted" : "would delete"
    }, ${totalResets} status reset(s), ${totalAnnotations} attestation(s) ${
      args.confirm ? "annotated" : "would annotate"
    }.`
  );
  console.log("─".repeat(72));
  if (!args.confirm && (totalCompletions || totalResets || totalAnnotations)) {
    console.log("Re-run with --confirm to apply.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
