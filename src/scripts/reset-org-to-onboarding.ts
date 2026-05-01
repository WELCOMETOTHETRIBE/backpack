/**
 * Reset an organization back to its pre-onboarding state.
 *
 * Preserves:
 *   - the organizations row itself (id, slug, name) so the user can still log in
 *   - users, user_invitations, audit_logs, feedback (historical record)
 *   - global data: controls, control_families, governance register TEMPLATES
 *     (where organization_id IS NULL)
 *
 * Clears (org-scoped operational state):
 *   - artifacts + artifact_links
 *   - poam_entries + milestones + closure approvals (and legacy poam_* tables)
 *   - control_records + history + adjudications + implementations
 *   - technical_evidence, governance_artifact_completions, control_evidence_links
 *   - boundaries + governance_register_entries + governance_register_entry_files
 *   - governance_registers (org-scoped only — templates preserved)
 *   - governance_evidence_items (cascades to files) + governance_documents
 *   - ssp_sections, attestations, policies, data_flows, assets, document_versions
 *   - trust_codex_acceptances, agent_runs (cascades to events)
 *
 * Resets (not delete):
 *   - onboarding_wizard_state → phase 0, no completedAt
 *   - organizations.boundaryScopingCompletedAt → null
 *
 * Usage:
 *   npx tsx src/scripts/reset-org-to-onboarding.ts --email patrick@example.com
 *   # shows a per-table count of what WOULD be deleted (dry run)
 *
 *   npx tsx src/scripts/reset-org-to-onboarding.ts --email patrick@example.com --confirm
 *   # executes inside a single transaction
 *
 * Alternative identifiers:
 *   --org-id <uuid>          reset by organization id
 *   --org-slug <slug>        reset by organization slug
 *   --email <email>          lookup the user, use their organizationId
 */
import { db } from "../db";
import {
  organizations,
  users,
  onboardingWizardState,
  artifacts,
  artifactLinks,
  poamEntries,
  poamEntryMilestones,
  poamEntryClosureApprovals,
  poamItems,
  poamMilestones,
  poamClosureApprovals,
  poamRiskAssessments,
  controlRecords,
  controlRecordHistory,
  controlHistory,
  controlImplementations,
  controlAdjudications,
  technicalEvidence,
  governanceArtifactCompletions,
  controlEvidenceLinks,
  evidenceRuns,
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  governanceRegisterEntryFiles,
  governanceEvidenceItems,
  governanceDocuments,
  governanceDocumentVersions,
  sspSections,
  attestations,
  policies,
  dataFlows,
  assets,
  documentVersions,
  trustCodexAcceptances,
  agentRuns,
} from "../db/schema";
import { eq, inArray, and, isNotNull, sql } from "drizzle-orm";

function parseArgs(argv: string[]) {
  const out: { email?: string; orgId?: string; orgSlug?: string; confirm: boolean } = {
    confirm: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--email") out.email = argv[++i];
    else if (a === "--org-id") out.orgId = argv[++i];
    else if (a === "--org-slug") out.orgSlug = argv[++i];
    else if (a === "--confirm") out.confirm = true;
  }
  return out;
}

async function resolveOrgId(args: ReturnType<typeof parseArgs>): Promise<string> {
  if (args.orgId) return args.orgId;

  if (args.orgSlug) {
    const [row] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, args.orgSlug))
      .limit(1);
    if (!row) throw new Error(`No organization with slug "${args.orgSlug}"`);
    return row.id;
  }

  if (args.email) {
    const [row] = await db
      .select({ orgId: users.organizationId })
      .from(users)
      .where(eq(users.email, args.email))
      .limit(1);
    if (!row) throw new Error(`No user with email "${args.email}"`);
    if (!row.orgId) throw new Error(`User "${args.email}" has no organizationId`);
    return row.orgId;
  }

  throw new Error("Provide one of --email / --org-id / --org-slug");
}

type CountRow = { table: string; count: number };

async function countOrgScoped(orgId: string): Promise<CountRow[]> {
  const rows: CountRow[] = [];
  const n = async (table: string, q: Promise<{ cnt: number }[]>) => {
    const r = await q;
    rows.push({ table, count: r[0]?.cnt ?? 0 });
  };

  await n(
    "artifact_links",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(artifactLinks)
      .where(eq(artifactLinks.organizationId, orgId))
  );
  await n(
    "artifacts",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(artifacts)
      .where(eq(artifacts.organizationId, orgId))
  );
  await n(
    "poam_entries",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(poamEntries)
      .where(eq(poamEntries.organizationId, orgId))
  );
  await n(
    "poam_items (legacy)",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(poamItems)
      .where(eq(poamItems.organizationId, orgId))
  );
  await n(
    "control_records",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(controlRecords)
      .where(eq(controlRecords.organizationId, orgId))
  );
  await n(
    "control_implementations",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(controlImplementations)
      .where(eq(controlImplementations.organizationId, orgId))
  );
  await n(
    "control_adjudications",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(controlAdjudications)
      .where(eq(controlAdjudications.organizationId, orgId))
  );
  await n(
    "technical_evidence",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(technicalEvidence)
      .where(eq(technicalEvidence.organizationId, orgId))
  );
  await n(
    "governance_artifact_completions",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(governanceArtifactCompletions)
      .where(eq(governanceArtifactCompletions.organizationId, orgId))
  );
  await n(
    "control_evidence_links",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(controlEvidenceLinks)
      .where(eq(controlEvidenceLinks.organizationId, orgId))
  );
  await n(
    "evidence_runs (cascades to evidence_findings + evidence_files)",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(evidenceRuns)
      .where(eq(evidenceRuns.organizationId, orgId))
  );
  await n(
    "governance_registers (org-scoped only)",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(governanceRegisters)
      .where(eq(governanceRegisters.organizationId, orgId))
  );
  await n(
    "boundaries",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(boundaries)
      .where(eq(boundaries.organizationId, orgId))
  );
  await n(
    "governance_evidence_items",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(governanceEvidenceItems)
      .where(eq(governanceEvidenceItems.organizationId, orgId))
  );
  await n(
    "governance_documents",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(governanceDocuments)
      .where(eq(governanceDocuments.organizationId, orgId))
  );
  await n(
    "ssp_sections",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(sspSections)
      .where(eq(sspSections.organizationId, orgId))
  );
  await n(
    "attestations",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(attestations)
      .where(eq(attestations.organizationId, orgId))
  );
  await n(
    "policies",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(policies)
      .where(eq(policies.organizationId, orgId))
  );
  await n(
    "data_flows",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(dataFlows)
      .where(eq(dataFlows.organizationId, orgId))
  );
  await n(
    "assets",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(assets)
      .where(eq(assets.organizationId, orgId))
  );
  await n(
    "document_versions",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(documentVersions)
      .where(eq(documentVersions.organizationId, orgId))
  );
  await n(
    "trust_codex_acceptances",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(trustCodexAcceptances)
      .where(eq(trustCodexAcceptances.organizationId, orgId))
  );
  await n(
    "agent_runs",
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(agentRuns)
      .where(eq(agentRuns.organizationId, orgId))
  );
  return rows;
}

async function executeReset(orgId: string) {
  await db.transaction(async (tx) => {
    // ── child tables first, FK-safe bottom-up ──

    // 1. Artifact links (cascades from artifacts but explicit for safety).
    await tx.delete(artifactLinks).where(eq(artifactLinks.organizationId, orgId));

    // 2. Artifacts — must come before control_records.
    await tx.delete(artifacts).where(eq(artifacts.organizationId, orgId));

    // 3. POAM entries (milestones + closure approvals cascade).
    await tx
      .delete(poamEntryClosureApprovals)
      .where(
        inArray(
          poamEntryClosureApprovals.poamEntryId,
          tx
            .select({ id: poamEntries.id })
            .from(poamEntries)
            .where(eq(poamEntries.organizationId, orgId))
        )
      );
    await tx
      .delete(poamEntryMilestones)
      .where(
        inArray(
          poamEntryMilestones.poamEntryId,
          tx
            .select({ id: poamEntries.id })
            .from(poamEntries)
            .where(eq(poamEntries.organizationId, orgId))
        )
      );
    await tx.delete(poamEntries).where(eq(poamEntries.organizationId, orgId));

    // 4. Legacy POAM tables.
    await tx
      .delete(poamClosureApprovals)
      .where(
        inArray(
          poamClosureApprovals.poamItemId,
          tx
            .select({ id: poamItems.id })
            .from(poamItems)
            .where(eq(poamItems.organizationId, orgId))
        )
      );
    await tx
      .delete(poamRiskAssessments)
      .where(
        inArray(
          poamRiskAssessments.poamItemId,
          tx
            .select({ id: poamItems.id })
            .from(poamItems)
            .where(eq(poamItems.organizationId, orgId))
        )
      );
    await tx
      .delete(poamMilestones)
      .where(
        inArray(
          poamMilestones.poamItemId,
          tx
            .select({ id: poamItems.id })
            .from(poamItems)
            .where(eq(poamItems.organizationId, orgId))
        )
      );
    await tx.delete(poamItems).where(eq(poamItems.organizationId, orgId));

    // 5. Control-record-referencing tables -- all before control_records.
    await tx.delete(technicalEvidence).where(eq(technicalEvidence.organizationId, orgId));
    await tx
      .delete(governanceArtifactCompletions)
      .where(eq(governanceArtifactCompletions.organizationId, orgId));
    await tx.delete(controlEvidenceLinks).where(eq(controlEvidenceLinks.organizationId, orgId));
    await tx.delete(controlAdjudications).where(eq(controlAdjudications.organizationId, orgId));

    // 5a. Evidence runs + findings (Azure validator + OS Test-CuiHardening
    // both write here). Without wiping these, re-uploading the same evidence
    // file after a reset hits the (organization_id, run_fingerprint) unique
    // index and 409s. evidenceFindings cascades from evidenceRuns via
    // ON DELETE CASCADE so a single delete on evidenceRuns is enough.
    await tx.delete(evidenceRuns).where(eq(evidenceRuns.organizationId, orgId));
    // control_history FK's controlImplementations.id — delete it FIRST.
    await tx
      .delete(controlHistory)
      .where(
        inArray(
          controlHistory.controlImplementationId,
          tx
            .select({ id: controlImplementations.id })
            .from(controlImplementations)
            .where(eq(controlImplementations.organizationId, orgId))
        )
      );
    await tx.delete(controlImplementations).where(eq(controlImplementations.organizationId, orgId));
    await tx
      .delete(controlRecordHistory)
      .where(
        inArray(
          controlRecordHistory.controlRecordId,
          tx
            .select({ id: controlRecords.id })
            .from(controlRecords)
            .where(eq(controlRecords.organizationId, orgId))
        )
      );

    // 6. Control records themselves.
    await tx.delete(controlRecords).where(eq(controlRecords.organizationId, orgId));

    // 7. Register entries + files, then registers (org-scoped only; templates preserved).
    await tx
      .delete(governanceRegisterEntryFiles)
      .where(
        inArray(
          governanceRegisterEntryFiles.registerEntryId,
          tx
            .select({ id: governanceRegisterEntries.id })
            .from(governanceRegisterEntries)
            .innerJoin(boundaries, eq(governanceRegisterEntries.boundaryId, boundaries.id))
            .where(eq(boundaries.organizationId, orgId))
        )
      );
    await tx
      .delete(governanceRegisterEntries)
      .where(
        inArray(
          governanceRegisterEntries.boundaryId,
          tx
            .select({ id: boundaries.id })
            .from(boundaries)
            .where(eq(boundaries.organizationId, orgId))
        )
      );
    await tx
      .delete(governanceRegisters)
      .where(
        and(
          isNotNull(governanceRegisters.organizationId),
          eq(governanceRegisters.organizationId, orgId)
        )
      );

    // 8. Evidence items (files cascade) + docs (versions cascade).
    await tx
      .delete(governanceEvidenceItems)
      .where(eq(governanceEvidenceItems.organizationId, orgId));
    await tx
      .delete(governanceDocumentVersions)
      .where(
        inArray(
          governanceDocumentVersions.documentId,
          tx
            .select({ id: governanceDocuments.id })
            .from(governanceDocuments)
            .where(eq(governanceDocuments.organizationId, orgId))
        )
      );
    await tx.delete(governanceDocuments).where(eq(governanceDocuments.organizationId, orgId));

    // 9. SSP / other per-org product data.
    await tx.delete(sspSections).where(eq(sspSections.organizationId, orgId));
    await tx.delete(attestations).where(eq(attestations.organizationId, orgId));
    await tx.delete(policies).where(eq(policies.organizationId, orgId));
    await tx.delete(dataFlows).where(eq(dataFlows.organizationId, orgId));
    await tx.delete(assets).where(eq(assets.organizationId, orgId));
    await tx.delete(documentVersions).where(eq(documentVersions.organizationId, orgId));

    // 10. Boundaries (after everything that references them).
    await tx.delete(boundaries).where(eq(boundaries.organizationId, orgId));

    // 11. Onboarding trail — delete acceptances; reset wizard state.
    await tx
      .delete(trustCodexAcceptances)
      .where(eq(trustCodexAcceptances.organizationId, orgId));
    await tx
      .delete(agentRuns)
      .where(eq(agentRuns.organizationId, orgId));

    await tx
      .update(onboardingWizardState)
      .set({
        currentPhase: 0,
        completedPhases: [],
        phaseData: {},
        sprsScoreSnapshot: null,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(onboardingWizardState.organizationId, orgId));

    // 12. Organization row — clear onboarding-completion marker only.
    await tx
      .update(organizations)
      .set({ boundaryScopingCompletedAt: null })
      .where(eq(organizations.id, orgId));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const orgId = await resolveOrgId(args);

  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) throw new Error(`Organization ${orgId} not found`);

  console.log("─".repeat(70));
  console.log(`Organization:  ${org.name ?? "(no name)"}  [slug: ${org.slug ?? "(none)"}]`);
  console.log(`Org ID:        ${org.id}`);
  console.log(`Mode:          ${args.confirm ? "EXECUTE" : "DRY RUN (add --confirm to apply)"}`);
  console.log("─".repeat(70));

  const counts = await countOrgScoped(orgId);
  const total = counts.reduce((s, r) => s + r.count, 0);
  console.log("Will delete from these tables:");
  for (const r of counts) {
    const pad = r.table.padEnd(42);
    console.log(`  ${pad}  ${String(r.count).padStart(6)}`);
  }
  console.log("─".repeat(70));
  console.log(`Total rows: ${total}`);
  console.log(
    "Will RESET (not delete): onboarding_wizard_state (phase → 0), organizations.boundaryScopingCompletedAt → NULL"
  );
  console.log(
    "Will PRESERVE: organizations row, users, user_invitations, audit_logs, feedback, register templates (org_id IS NULL)"
  );
  console.log("─".repeat(70));

  if (!args.confirm) {
    console.log("Dry run complete. Re-run with --confirm to apply.");
    return;
  }

  console.log("Executing reset in a single transaction…");
  await executeReset(orgId);
  console.log("✓ Reset complete. User can now log in and restart onboarding from phase 0.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
