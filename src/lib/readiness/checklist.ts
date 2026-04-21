import { db } from "@/db";
import {
  organizations,
  boundaries,
  trustCodexAcceptances,
  controlAdjudications,
  governanceDocuments,
  governanceRegisters,
  governanceRegisterEntries,
  artifacts,
  governanceArtifactCompletions,
} from "@/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { GOVERNANCE_DOCUMENT_MATRIX } from "@/lib/governance/governance-document-matrix";
import { REGISTER_DISPLAY_NAMES } from "@/lib/registers/compliance-health";
import { MILESTONES_BY_KEY } from "@/data/cmmc/client-required-artifacts";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { computeAdjudicationRollup } from "@/lib/adjudication-helpers";
import type {
  ReadinessChecklist,
  ReadinessSection,
  ReadinessTask,
  TaskStatus,
} from "./types";

/** Normalize a title string for fuzzy match against GOVERNANCE_DOCUMENT_MATRIX. */
function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Extract the NIST control ID from a milestone key like "AT.3.2.1.initial_annual_certs". */
function controlIdFromMilestoneKey(key: string): string | null {
  const m = key.match(/^[A-Z]{2}\.(\d+\.\d+\.\d+)\./);
  return m ? m[1] : null;
}

export async function buildReadinessChecklist(
  orgId: string
): Promise<ReadinessChecklist> {
  // One-shot adjudication context — drives the rollup and also gives us
  // registerFinalCounts that the Registers section consumes.
  const rollup = await computeAdjudicationRollup(orgId);

  const sections: ReadinessSection[] = await Promise.all([
    buildSetupSection(orgId),
    buildGovernanceSection(orgId),
    buildRegistersSection(orgId, rollup.ctx.registerFinalCounts),
    buildArtifactsSection(orgId),
    buildAttestationsSection(orgId),
  ]);

  // Top 3 leverage moves: not_started tasks sorted by satisfiesControls length.
  const allTasks = sections.flatMap((s) => s.tasks);
  const topActions = allTasks
    .filter((t) => t.status === "not_started")
    .sort((a, b) => b.satisfiesControls.length - a.satisfiesControls.length)
    .slice(0, 3);

  return {
    sections,
    rollup: {
      inherited: rollup.inherited,
      notApplicable: rollup.notApplicable,
      implementedEvidenced: rollup.implementedEvidenced,
      outstanding: rollup.outstanding,
      total: rollup.total,
    },
    topActions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Setup
// ─────────────────────────────────────────────────────────────────────────────
async function buildSetupSection(orgId: string): Promise<ReadinessSection> {
  const [org] = await db
    .select({
      name: organizations.name,
      cageCode: organizations.cageCode,
      primaryContactEmail: organizations.primaryContactEmail,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [tca] = await db
    .select({ id: trustCodexAcceptances.id })
    .from(trustCodexAcceptances)
    .where(eq(trustCodexAcceptances.organizationId, orgId))
    .limit(1);

  const [bnd] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);

  const inheritedAdjs = await db
    .select({ id: controlAdjudications.id })
    .from(controlAdjudications)
    .where(
      and(
        eq(controlAdjudications.organizationId, orgId),
        eq(controlAdjudications.status, "inherited")
      )
    );

  const tasks: ReadinessTask[] = [
    {
      id: "setup.trust_codex",
      label: "Accept the Trust Codex",
      description: "Sign the service agreement that activates the Vault enclave.",
      status: tca ? "done" : "not_started",
      href: "/welcome",
      satisfiesControls: [],
    },
    {
      id: "setup.org_profile",
      label: "Complete organization profile",
      description: "Name, CAGE code, and a primary contact email on record.",
      status:
        org?.name && org?.cageCode && org?.primaryContactEmail ? "done" : "not_started",
      href: "/welcome",
      satisfiesControls: [],
    },
    {
      id: "setup.boundary",
      label: "Confirm CUI boundary",
      description: "MacTech CUI Vault boundary provisioned for your organization.",
      status: bnd ? "done" : "not_started",
      href: "/welcome",
      satisfiesControls: [],
    },
    {
      id: "setup.azure_inheritance",
      label: "Acknowledge Azure Gov inheritance",
      description: "Physical protection (3.10.x) controls inherited from Azure's FedRAMP High authorization.",
      status: inheritedAdjs.length >= 6 ? "done" : "not_started",
      href: "/welcome",
      satisfiesControls: ["3.10.1", "3.10.2", "3.10.3", "3.10.4", "3.10.5", "3.10.6"],
    },
  ];

  return {
    key: "setup",
    title: "Setup",
    subtitle: "One-time onboarding confirmations",
    tasks,
    doneCount: tasks.filter((t) => t.status === "done").length,
    totalCount: tasks.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Governance Library
// ─────────────────────────────────────────────────────────────────────────────
async function buildGovernanceSection(orgId: string): Promise<ReadinessSection> {
  const required = GOVERNANCE_DOCUMENT_MATRIX.filter(
    (d) => d.govPure || d.govHybrid || d.techHybrid
  );

  const docs = await db
    .select({ title: governanceDocuments.title })
    .from(governanceDocuments)
    .where(eq(governanceDocuments.organizationId, orgId));

  const normalizedTitles = new Set(docs.map((d) => normalizeTitle(d.title ?? "")));

  const tasks: ReadinessTask[] = required.map((row) => {
    const norm = normalizeTitle(row.document);
    // Accept a doc if its normalized title matches, or if any uploaded title
    // CONTAINS the matrix label (handles "Access Control Policy v2.1" style uploads).
    const matched =
      normalizedTitles.has(norm) ||
      [...normalizedTitles].some((t) => t.includes(norm) || norm.includes(t));
    return {
      id: `gov.${norm.replace(/\s+/g, "_")}`,
      label: row.document,
      description:
        row.controlsMapped.length > 0
          ? `Satisfies ${row.controlsMapped.length} control${row.controlsMapped.length === 1 ? "" : "s"}${
              row.govPure ? " · pure governance" : row.govHybrid ? " · hybrid" : " · tech-hybrid"
            }`
          : undefined,
      status: matched ? "done" : "not_started",
      href: `/dashboard/documents`,
      satisfiesControls: row.controlsMapped,
    };
  });

  return {
    key: "governance",
    title: "Governance Library",
    subtitle: "Policies, procedures, and plans establishing your CMMC program intent",
    tasks,
    doneCount: tasks.filter((t) => t.status === "done").length,
    totalCount: tasks.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Compliance Registers
//
// One task per register the org actually has in governance_registers — not
// filtered through the static register_entry_schemas.v1.json catalog (which
// only knows about ~9 legacy schemas). Iterating the live DB rows ensures
// every register added via REGISTER_DEFINITIONS shows up.
// ─────────────────────────────────────────────────────────────────────────────
async function buildRegistersSection(
  orgId: string,
  registerFinalCounts: Map<string, number>
): Promise<ReadinessSection> {
  // Pull every org-scoped register
  const orgRegisters = await db
    .select({
      id: governanceRegisters.id,
      registerKey: governanceRegisters.registerKey,
      name: governanceRegisters.name,
      controlIds: governanceRegisters.controlIds,
    })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  // Any-entry counts (draft + final) per register — used to tell
  // "in_progress" (has drafts) from "not_started".
  const anyCounts = new Map<string, number>();
  if (orgRegisters.length > 0) {
    const rows = await db
      .select({
        registerId: governanceRegisterEntries.registerId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(governanceRegisterEntries)
      .where(
        inArray(
          governanceRegisterEntries.registerId,
          orgRegisters.map((r) => r.id)
        )
      )
      .groupBy(governanceRegisterEntries.registerId);
    for (const r of rows) anyCounts.set(r.registerId, Number(r.cnt) || 0);
  }

  // Reverse index: registerKey → control IDs (fallback when controlIds column
  // is empty on a row — stays correct against current CONTROL_INTELLIGENCE).
  const registerToControls = new Map<string, string[]>();
  for (const intel of CONTROL_INTELLIGENCE) {
    if (!intel.registerSchemaId || !intel.registerRequired) continue;
    const arr = registerToControls.get(intel.registerSchemaId) ?? [];
    if (!arr.includes(intel.controlId)) arr.push(intel.controlId);
    registerToControls.set(intel.registerSchemaId, arr);
  }

  const tasks: ReadinessTask[] = orgRegisters.map((reg) => {
    const finalCount = registerFinalCounts.get(reg.registerKey) ?? 0;
    const anyCount = anyCounts.get(reg.id) ?? 0;
    const hasFinal = finalCount > 0;
    const status: TaskStatus = hasFinal ? "done" : anyCount > 0 ? "in_progress" : "not_started";
    const displayName = REGISTER_DISPLAY_NAMES[reg.registerKey] ?? reg.name ?? reg.registerKey;
    // Prefer the controlIds we rebuilt into governance_registers during the
    // backfill; fall back to the live CONTROL_INTELLIGENCE reverse index.
    const controlIds = (reg.controlIds as string[] | null) ?? registerToControls.get(reg.registerKey) ?? [];
    return {
      id: `reg.${reg.registerKey}`,
      label: `Populate ${displayName}`,
      description: hasFinal
        ? `${finalCount} finalized entr${finalCount === 1 ? "y" : "ies"}`
        : anyCount > 0
        ? `${anyCount} draft entr${anyCount === 1 ? "y" : "ies"} — finalize to satisfy the control${controlIds.length === 1 ? "" : "s"}`
        : `No entries yet — add the first record to activate this register`,
      status,
      href: `/dashboard/evidence-engine/registers/${reg.registerKey}`,
      satisfiesControls: controlIds,
    };
  });

  // Sort: registers that satisfy more controls first, then alphabetical.
  tasks.sort(
    (a, b) =>
      b.satisfiesControls.length - a.satisfiesControls.length ||
      a.label.localeCompare(b.label)
  );

  return {
    key: "registers",
    title: "Compliance Registers",
    subtitle: "Operational records that prove each policy is being followed in practice",
    tasks,
    doneCount: tasks.filter((t) => t.status === "done").length,
    totalCount: tasks.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Required Artifacts
// ─────────────────────────────────────────────────────────────────────────────
async function buildArtifactsSection(orgId: string): Promise<ReadinessSection> {
  const placeholders = await db
    .select({
      id: artifacts.id,
      milestoneKey: artifacts.milestoneKey,
      status: artifacts.status,
      fileUrl: artifacts.fileUrl,
      expectedDueDate: artifacts.expectedDueDate,
    })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.organizationId, orgId),
        eq(artifacts.expectedClosureType, "upload"),
        isNotNull(artifacts.milestoneKey)
      )
    );

  const tasks: ReadinessTask[] = [];
  for (const p of placeholders) {
    if (!p.milestoneKey) continue;
    const catalog = MILESTONES_BY_KEY.get(p.milestoneKey);
    if (!catalog) continue; // orphan placeholder, skip
    const controlId = controlIdFromMilestoneKey(p.milestoneKey);
    const hasFile =
      Boolean(p.fileUrl) &&
      (p.status === "uploaded" || p.status === "approved");
    tasks.push({
      id: `art.${p.milestoneKey}`,
      label: catalog.title,
      description: catalog.description,
      status: hasFile ? "done" : "not_started",
      href: `/dashboard/artifacts/${p.id}`,
      satisfiesControls: controlId ? [controlId] : [],
    });
  }
  tasks.sort((a, b) => a.label.localeCompare(b.label));

  return {
    key: "artifacts",
    title: "Required Artifacts",
    subtitle: "One-off documents assessors will examine (AARs, reports, certs, diagrams)",
    tasks,
    doneCount: tasks.filter((t) => t.status === "done").length,
    totalCount: tasks.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Section: Attestations
// ─────────────────────────────────────────────────────────────────────────────
async function buildAttestationsSection(orgId: string): Promise<ReadinessSection> {
  const placeholders = await db
    .select({
      id: artifacts.id,
      controlRecordId: artifacts.controlRecordId,
      milestoneKey: artifacts.milestoneKey,
      status: artifacts.status,
      fileUrl: artifacts.fileUrl,
    })
    .from(artifacts)
    .where(
      and(
        eq(artifacts.organizationId, orgId),
        eq(artifacts.expectedClosureType, "attestation"),
        isNotNull(artifacts.milestoneKey)
      )
    );

  // Also fetch attestation completions so we can mark as done when a signed
  // attestation exists even without a file on the placeholder artifact.
  const attested = await db
    .select({ controlRecordId: governanceArtifactCompletions.controlRecordId })
    .from(governanceArtifactCompletions)
    .where(eq(governanceArtifactCompletions.organizationId, orgId));
  const attestedRecordIds = new Set(attested.map((a) => a.controlRecordId));

  const tasks: ReadinessTask[] = [];
  for (const p of placeholders) {
    if (!p.milestoneKey) continue;
    const catalog = MILESTONES_BY_KEY.get(p.milestoneKey);
    if (!catalog) continue;
    const controlId = controlIdFromMilestoneKey(p.milestoneKey);
    const hasFile =
      Boolean(p.fileUrl) &&
      (p.status === "uploaded" || p.status === "approved");
    const hasAttestation = attestedRecordIds.has(p.controlRecordId);
    const done = hasFile || hasAttestation;
    tasks.push({
      id: `att.${p.milestoneKey}`,
      label: catalog.title,
      description: catalog.description,
      status: done ? "done" : "not_started",
      href: `/dashboard/artifacts/${p.id}`,
      satisfiesControls: controlId ? [controlId] : [],
    });
  }
  tasks.sort((a, b) => a.label.localeCompare(b.label));

  return {
    key: "attestations",
    title: "Attestations",
    subtitle: "Signed statements an assessor will interview against",
    tasks,
    doneCount: tasks.filter((t) => t.status === "done").length,
    totalCount: tasks.length,
  };
}
