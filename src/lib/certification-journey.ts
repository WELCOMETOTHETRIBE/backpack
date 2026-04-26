import { db } from "@/db";
import {
  controlRecords,
  poamEntries,
  poamEntryMilestones,
  controlEvidenceLinks,
  evidenceMetadata,
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  governanceDocuments,
  sspSections,
  organizations,
  onboardingWizardState,
  boundaryProfiles,
} from "@/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { sprsScoringData, SPRS_MAX } from "@/lib/sprs";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import {
  getComplianceRegisterHealth,
  aggregateRegisterHealth,
  isRegisterLaneSatisfied,
  finalCountForSchemaId,
  isProvisionedForSchemaId,
} from "@/lib/registers/compliance-health";
import type { ChecklistStage } from "@/app/dashboard/DashboardSetupWidget";

const TOTAL_CONTROLS = ALL_CONTROL_IDS.length;
const ADJUDICATED_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;

export type CertificationJourney = {
  onboardingStarted: boolean;
  vaultWizardInProgress: boolean;
  stages: ChecklistStage[];
};

export async function getCertificationJourney(orgId: string): Promise<CertificationJourney> {
  const records = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyDocRequired: controlRecords.policyDocRequired,
      policyStatus: controlRecords.policyStatus,
    })
    .from(controlRecords)
    .where(eq(controlRecords.organizationId, orgId));

  const intelMap = new Map(CONTROL_INTELLIGENCE.map((c) => [c.controlId, c]));
  const orgRegisters = await db
    .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));
  const orgBoundaries = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const boundaryIds = orgBoundaries.map((b) => b.id);

  const registerFinalCounts = new Map<string, number>();
  if (boundaryIds.length > 0) {
    for (const reg of orgRegisters) {
      const [row] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(governanceRegisterEntries)
        .where(
          and(
            eq(governanceRegisterEntries.registerId, reg.id),
            eq(governanceRegisterEntries.status, "final"),
            sql`${governanceRegisterEntries.boundaryId} IN (${sql.join(
              boundaryIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          )
        );
      registerFinalCounts.set(reg.registerKey, row?.cnt ?? 0);
    }
  }

  const orgProvisionedRegisterKeys = new Set(orgRegisters.map((r) => r.registerKey));
  const registerSatisfiedMap = new Map<string, boolean>();
  for (const [controlId, intel] of intelMap) {
    if (!intel.registerRequired || !intel.registerSchemaId) {
      registerSatisfiedMap.set(controlId, true);
      continue;
    }
    registerSatisfiedMap.set(
      controlId,
      isRegisterLaneSatisfied({
        registerSchemaId: intel.registerSchemaId,
        finalEntryCount: finalCountForSchemaId(registerFinalCounts, intel.registerSchemaId),
        orgProvisioned: isProvisionedForSchemaId(orgProvisionedRegisterKeys, intel.registerSchemaId),
      })
    );
  }

  function isFullyAdjudicated(r: (typeof records)[number]): boolean {
    const registerOk = registerSatisfiedMap.get(r.controlId) !== false;
    if (r.policyDocRequired) {
      return r.technicalStatus === "satisfied" && r.policyStatus === "satisfied" && registerOk;
    }
    return ADJUDICATED_STATUSES.includes(r.implementationStatus as (typeof ADJUDICATED_STATUSES)[number]) && registerOk;
  }

  const adjudicatedCount = records.filter(isFullyAdjudicated).length;

  const byId = new Map(records.map((r) => [r.controlId, r]));
  let implemented = 0;
  let inherited = 0;
  let notApplicable = 0;
  for (const id of ALL_CONTROL_IDS) {
    const r = byId.get(id);
    if (!r) continue;
    if (!isFullyAdjudicated(r)) continue;
    const s = r.implementationStatus;
    if (s === "implemented" || s === "assessed") implemented++;
    else if (s === "inherited") inherited++;
    else if (s === "not_applicable") notApplicable++;
  }
  const outstanding = TOTAL_CONTROLS - implemented - inherited - notApplicable;

  const openPoamList = await db
    .select({ id: poamEntries.id })
    .from(poamEntries)
    .where(and(eq(poamEntries.organizationId, orgId), eq(poamEntries.status, "open")));
  let poamWithMilestones = 0;
  for (const entry of openPoamList) {
    const [ms] = await db
      .select({ id: poamEntryMilestones.id })
      .from(poamEntryMilestones)
      .where(eq(poamEntryMilestones.poamEntryId, entry.id))
      .limit(1);
    if (ms) poamWithMilestones++;
  }
  const newModelOpenCount = openPoamList.length;
  const poamMissingMilestones = newModelOpenCount - poamWithMilestones;

  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const expiringSoon = await db
    .select({ id: controlEvidenceLinks.id })
    .from(controlEvidenceLinks)
    .where(and(eq(controlEvidenceLinks.organizationId, orgId), lt(controlEvidenceLinks.expiresAt, in30Days)));
  const legacyExpiring = (
    await db
      .select({ retentionUntil: evidenceMetadata.retentionUntil })
      .from(evidenceMetadata)
      .where(eq(evidenceMetadata.organizationId, orgId))
  ).filter((e) => e.retentionUntil && new Date(e.retentionUntil) <= in30Days).length;
  const totalExpiring = expiringSoon.length + legacyExpiring;

  const sspSectionList = await db
    .select({ content: sspSections.content })
    .from(sspSections)
    .where(eq(sspSections.organizationId, orgId));
  const authoredSections = sspSectionList.filter((s) => s.content && s.content.trim().length > 0).length;

  const registerHealth = await getComplianceRegisterHealth(orgId);
  const registerCounts = aggregateRegisterHealth(registerHealth);
  const registersAllCurrent = registerCounts.overdue === 0 && registerCounts.dueSoon === 0 && registerCounts.neverUsed === 0;
  const hasAnyRegisterEntries = registerCounts.current > 0 || registerCounts.dueSoon > 0;
  const trainingRegister = registerHealth.find((r) => r.registerKey === "training_completion");
  const trainingCurrent = trainingRegister?.status === "current";

  const [govDocCount] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(governanceDocuments)
    .where(eq(governanceDocuments.organizationId, orgId));
  const hasGovDocs = (govDocCount?.cnt ?? 0) > 0;

  const [cuiBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);
  const hasBoundary = Boolean(cuiBoundary);

  const [orgRow] = await db
    .select({
      boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const boundaryComplete = !!orgRow?.boundaryScopingCompletedAt;

  const [wizardState] = await db
    .select({
      completedAt: onboardingWizardState.completedAt,
    })
    .from(onboardingWizardState)
    .where(eq(onboardingWizardState.organizationId, orgId))
    .limit(1);
  const [boundaryRow] = await db
    .select({ id: boundaryProfiles.id })
    .from(boundaryProfiles)
    .where(eq(boundaryProfiles.organizationId, orgId))
    .limit(1);
  const vaultWizardCompleted = Boolean(wizardState?.completedAt);
  const vaultWizardInProgress = Boolean(wizardState) && !vaultWizardCompleted;
  const onboardingStarted = vaultWizardCompleted || Boolean(boundaryRow) || records.length > 0;

  const implementedIds = new Set(
    records.filter(
      (r) =>
        r.implementationStatus === "implemented" ||
        r.implementationStatus === "assessed" ||
        r.implementationStatus === "inherited"
    ).map((r) => r.controlId)
  );
  let sprsScore = SPRS_MAX;
  for (const ctrl of sprsScoringData) {
    if (!implementedIds.has(ctrl.id)) sprsScore -= ctrl.value;
  }

  const readinessScore =
    (boundaryComplete ? 15 : 0) +
    (authoredSections >= 3 ? 15 : 0) +
    (Math.round((adjudicatedCount / TOTAL_CONTROLS) * 100) >= 80 ? 25 : 0) +
    (newModelOpenCount === 0 || poamMissingMilestones === 0 ? 10 : 0) +
    (totalExpiring === 0 ? 10 : 0) +
    (registersAllCurrent ? 15 : registerCounts.overdue === 0 ? 8 : 0) +
    (trainingCurrent ? 10 : 0);

  const stages: ChecklistStage[] = [
    {
      key: "onboarding",
      title: "Onboard",
      subtitle: "Complete Vault setup and profile your organization",
      items: [
        {
          label: "Complete MacTech Vault wizard",
          description: "Trust Codex, CUI categories, Azure inheritance, and MacTech control coverage",
          done: vaultWizardCompleted,
          href: "/welcome",
        },
        {
          label: "Define your CUI boundary",
          description: "Scope your Windows Server 2025 enclave in Azure Gov and register OS assets",
          done: hasBoundary,
          href: "/dashboard/boundary",
        },
      ],
    },
    {
      key: "foundation",
      title: "Foundation",
      subtitle: "Install governance artifacts and activate your evidence engine",
      items: [
        {
          label: "Upload governance documents",
          description: "Policies, SOPs, and plans with signed acknowledgements",
          done: hasGovDocs,
          href: "/dashboard/documents",
          hint: !hasGovDocs ? "Start with Access Control Policy, AT Policy, and Incident Response Plan" : undefined,
        },
        {
          label: "Activate compliance registers",
          description: "Populate access, training, incident, and change-management registers",
          done: hasAnyRegisterEntries,
          href: "/dashboard/evidence-engine/registers",
          hint: !hasAnyRegisterEntries ? "Start the Training Completion register — AT.2.056 evidence depends on it" : undefined,
        },
        {
          label: "Complete boundary scoping",
          description: "Mark your CUI boundary scoping as finalized for SSP generation",
          done: boundaryComplete,
          href: "/dashboard/boundary",
        },
      ],
    },
    {
      key: "adjudication",
      title: "Adjudicate",
      subtitle: "Review, evidence, and implement all 110 NIST SP 800-171 controls",
      items: [
        {
          label: "Adjudicate all 110 controls",
          description: `${adjudicatedCount} / ${TOTAL_CONTROLS} controls fully evidenced (OS + governance + registers)`,
          done: adjudicatedCount === TOTAL_CONTROLS,
          href: "/dashboard/controls",
          hint: adjudicatedCount < TOTAL_CONTROLS ? `${TOTAL_CONTROLS - adjudicatedCount} controls still need evidence or adjudication` : undefined,
        },
        {
          label: "Author SSP sections",
          description: `${authoredSections} / 3 minimum sections authored — system description, boundary, control narratives`,
          done: authoredSections >= 3,
          href: "/dashboard/ssp",
        },
        {
          label: "Generate POA&Ms for gaps",
          description: newModelOpenCount > 0
            ? `${newModelOpenCount} open POA&M${newModelOpenCount !== 1 ? "s" : ""} — ${poamMissingMilestones} missing milestones`
            : "Create plans of action for every unimplemented control",
          done: (adjudicatedCount === TOTAL_CONTROLS) || (newModelOpenCount > 0 && poamMissingMilestones === 0),
          href: "/dashboard/poam",
          hint: poamMissingMilestones > 0 ? `Add milestones to ${poamMissingMilestones} POA&M${poamMissingMilestones !== 1 ? "s" : ""} — assessors require them` : undefined,
        },
      ],
    },
    {
      key: "defensible",
      title: "Defensible",
      subtitle: "Prove evidence is current and registers are actively maintained",
      items: [
        {
          label: "Registers all current",
          description: registerCounts.overdue > 0
            ? `${registerCounts.overdue} register${registerCounts.overdue !== 1 ? "s" : ""} overdue — must be refreshed for audit defensibility`
            : "All compliance registers are within their cadence windows",
          done: registersAllCurrent,
          href: "/dashboard/registers",
          hint: registerCounts.overdue > 0 ? "Overdue registers are auditor red flags — add entries now" : undefined,
        },
        {
          label: "Training register current",
          description: "Annual awareness training completions logged for every role",
          done: trainingCurrent,
          href: "/dashboard/evidence-engine/registers/training_completion",
        },
        {
          label: "No evidence expiring within 30 days",
          description: totalExpiring > 0
            ? `${totalExpiring} evidence item${totalExpiring !== 1 ? "s" : ""} expiring soon — refresh before assessment`
            : "All evidence items are within their validity window",
          done: totalExpiring === 0,
          href: "/dashboard/evidence",
        },
        {
          label: "SPRS score ≥ 88",
          description: `Current SPRS score: ${sprsScore} / 110 — C3PAO target is 88+ for Level 2`,
          done: sprsScore >= 88,
          href: "/dashboard/sprs",
          hint: sprsScore < 88 ? `${88 - sprsScore} points to go — prioritize high-weight control gaps` : undefined,
        },
      ],
    },
    {
      key: "certifiable",
      title: "Certifiable",
      subtitle: "Final review and export your C3PAO assessment package",
      items: [
        {
          label: "C3PAO readiness ≥ 90",
          description: `Internal readiness score: ${readinessScore} / 100`,
          done: readinessScore >= 90,
          href: "/dashboard/readiness",
          hint: readinessScore < 90 ? `${90 - readinessScore} points to go — review the checklist for unearned items` : undefined,
        },
        {
          label: "All controls implemented or inherited",
          description: `${implemented + inherited + notApplicable} / ${TOTAL_CONTROLS} fully satisfied — no "not started" or "in progress" controls`,
          done: outstanding === 0,
          href: "/dashboard/controls",
          hint: outstanding > 0 ? `${outstanding} control${outstanding !== 1 ? "s" : ""} still in draft status — finalize before export` : undefined,
        },
        {
          label: "SSP fully authored",
          description: `${authoredSections} SSP section${authoredSections !== 1 ? "s" : ""} authored — export your assessment-ready SSP when complete`,
          done: authoredSections >= 10,
          href: "/dashboard/ssp",
        },
        {
          label: "Export assessment package",
          description: "Generate the C3PAO bundle: SSP, POA&M, SPRS report, and evidence index",
          done: false,
          href: "/dashboard/ssp",
          hint: "This is the final deliverable you hand to your C3PAO assessor",
        },
      ],
    },
  ];

  return { onboardingStarted, vaultWizardInProgress, stages };
}
