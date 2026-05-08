import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  poamEntries,
  poamEntryMilestones,
  controlRecords,
  controls,
  controlFamilies,
  governanceRegisters,
  governanceRegisterEntries,
  boundaries,
} from "@/db/schema";
import { eq, and, inArray, asc, sql } from "drizzle-orm";
import { PoamTracker, type PoamEntry } from "./PoamTracker";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { isRegisterLaneSatisfied } from "@/lib/registers/compliance-health";
import { schemaIdForRegisterKey } from "@/data/cmmc/register-key-aliases";
import { sprsScoringData } from "@/lib/sprs";

const DONE_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;

export default async function PoamPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // ── Fetch all entries with joined control data ──
  const rawEntries = await db
    .select({
      id: poamEntries.id,
      controlRecordId: poamEntries.controlRecordId,
      controlId: controlRecords.controlId,
      controlTitle: controls.title,
      familyCode: controlFamilies.code,
      implementationStatus: controlRecords.implementationStatus,
      technicalStatus: controlRecords.technicalStatus,
      policyDocRequired: controlRecords.policyDocRequired,
      policyStatus: controlRecords.policyStatus,
      status: poamEntries.status,
      weaknessDescription: poamEntries.weaknessDescription,
      remediationPlan: poamEntries.remediationPlan,
      scheduledCompletionDate: poamEntries.scheduledCompletionDate,
      closedAt: poamEntries.closedAt,
      closeoutEvidence: poamEntries.closeoutEvidence,
      createdAt: poamEntries.createdAt,
    })
    .from(poamEntries)
    .innerJoin(controlRecords, eq(poamEntries.controlRecordId, controlRecords.id))
    .innerJoin(controls, eq(controlRecords.controlId, controls.controlId))
    .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
    .where(eq(poamEntries.organizationId, orgId))
    .orderBy(asc(poamEntries.createdAt));

  // ── Fetch milestones for all entries ──
  const entryIds = rawEntries.map((e) => e.id);
  const allMilestones = entryIds.length > 0
    ? await db
        .select()
        .from(poamEntryMilestones)
        .where(inArray(poamEntryMilestones.poamEntryId, entryIds))
        .orderBy(asc(poamEntryMilestones.orderIndex))
    : [];

  const milestonesByEntry = new Map<string, typeof allMilestones>();
  for (const m of allMilestones) {
    if (!milestonesByEntry.has(m.poamEntryId)) milestonesByEntry.set(m.poamEntryId, []);
    milestonesByEntry.get(m.poamEntryId)!.push(m);
  }

  // ── Build register satisfaction map (controlId → satisfied boolean) ──
  // A control's register is "satisfied" when at least one finalized entry exists.
  const orgRegisters = await db
    .select({
      id: governanceRegisters.id,
      registerKey: governanceRegisters.registerKey,
      controlIds: governanceRegisters.controlIds,
    })
    .from(governanceRegisters)
    .where(eq(governanceRegisters.organizationId, orgId));

  const orgBoundaries = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId));
  const boundaryIds = orgBoundaries.map((b) => b.id);

  // controlId → true if ALL required registers for that control have ≥1 finalized entry
  const registerSatisfiedByControl = new Map<string, boolean>();
  const controlRegisterNames = new Map<string, string[]>();

  if (boundaryIds.length > 0) {
    for (const reg of orgRegisters) {
      const cids = (reg.controlIds ?? []) as string[];
      if (cids.length === 0) continue;

      const [row] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(governanceRegisterEntries)
        .where(
          and(
            eq(governanceRegisterEntries.registerId, reg.id),
            inArray(governanceRegisterEntries.boundaryId, boundaryIds),
            eq(governanceRegisterEntries.status, "final")
          )
        );
      const finalCount = row?.cnt ?? 0;
      // Event-driven registers are satisfied-by-default while provisioned;
      // see isRegisterLaneSatisfied for rationale. Resolve the org's
      // seed-data registerKey (e.g. "terminations") to its canonical
      // schema id (e.g. "termination") so cadence lookup finds the rule.
      const hasFinal = isRegisterLaneSatisfied({
        registerSchemaId: schemaIdForRegisterKey(reg.registerKey),
        finalEntryCount: finalCount,
        orgProvisioned: true,
      });

      for (const cid of cids) {
        // Track register names for display
        if (!controlRegisterNames.has(cid)) controlRegisterNames.set(cid, []);
        controlRegisterNames.get(cid)!.push(reg.registerKey);

        // A control's registers are satisfied only if ALL mapped registers have entries
        const prev = registerSatisfiedByControl.get(cid);
        registerSatisfiedByControl.set(cid, prev === undefined ? hasFinal : prev && hasFinal);
      }
    }
  }

  // ── Enrich with intelligence + SPRS ──
  const intelMap = new Map(CONTROL_INTELLIGENCE.map((c) => [c.controlId, c]));
  const sprsMap = new Map(sprsScoringData.map((c) => [c.id, c.value as number]));

  const now = new Date();

  const entries: PoamEntry[] = rawEntries.map((e) => {
    const intel = intelMap.get(e.controlId ?? "");
    const sprsImpact = sprsMap.get(e.controlId ?? "") ?? 0;
    const daysOpen = Math.floor((now.getTime() - new Date(e.createdAt).getTime()) / 86_400_000);
    const scheduled = e.scheduledCompletionDate ? new Date(e.scheduledCompletionDate) : null;
    const isOverdue = e.status === "open" && scheduled !== null && scheduled < now;

    // Evidence-driven "ready to close" — ALL lanes must be satisfied
    const implDone = DONE_STATUSES.includes(
      e.implementationStatus as (typeof DONE_STATUSES)[number]
    );
    const techOk = (e.technicalStatus ?? "not_started") === "satisfied";
    const policyOk = !e.policyDocRequired || (e.policyStatus ?? "not_required") === "satisfied";
    const registerRequired = intel?.registerRequired ?? false;
    const registerOk = !registerRequired || (registerSatisfiedByControl.get(e.controlId ?? "") ?? false);

    // Underlying control is implemented via lane evidence (technical + policy
    // + register, plus the implementationStatus field on the control_records
    // row). Independent of whether THIS POA&M's specific milestones are done.
    const controlImplemented = implDone && techOk && policyOk && registerOk;

    // Milestone gate: a POA&M committed to specific actions; closing it
    // before those actions are done is bad audit hygiene even if the
    // underlying control got promoted via other evidence (e.g. an approved
    // governance doc landed). Empty milestone list = vacuously satisfied.
    const milestoneRows = milestonesByEntry.get(e.id) ?? [];
    const allMilestonesComplete =
      milestoneRows.length === 0 || milestoneRows.every((m) => m.completedAt !== null);
    const openMilestoneCount = milestoneRows.filter((m) => m.completedAt === null).length;

    // True "ready to close" requires BOTH the lane evidence AND the POA&M's
    // own milestone commitments. Backward-compat: callers that read
    // controlNowImplemented get the strict gate.
    const controlNowImplemented = controlImplemented && allMilestonesComplete;

    return {
      id: e.id,
      controlRecordId: e.controlRecordId,
      controlId: e.controlId ?? "—",
      controlTitle: e.controlTitle ?? e.controlId ?? "—",
      controlFamily: e.familyCode ?? "—",
      implementationStatus: e.implementationStatus,
      technicalStatus: e.technicalStatus ?? "not_started",
      policyDocRequired: e.policyDocRequired ?? false,
      policyStatus: e.policyStatus ?? "not_required",
      status: e.status as "open" | "closed",
      weaknessDescription: e.weaknessDescription ?? null,
      remediationPlan: e.remediationPlan ?? null,
      scheduledCompletionDate: e.scheduledCompletionDate ?? null,
      closedAt: e.closedAt?.toISOString() ?? null,
      closeoutEvidence: e.closeoutEvidence ?? null,
      createdAt: new Date(e.createdAt).toISOString(),
      milestones: (milestonesByEntry.get(e.id) ?? []).map((m) => ({
        id: m.id,
        title: m.title,
        dueDate: m.dueDate ?? null,
        completedAt: m.completedAt?.toISOString() ?? null,
        orderIndex: m.orderIndex,
      })),
      daysOpen,
      isOverdue,
      sprsImpact,
      controlNowImplemented,
      controlImplemented,
      openMilestoneCount,
      c3paoNote: intel?.c3paoExaminerNote ?? null,
      disposition: intel?.disposition ?? null,
    };
  });

  return <PoamTracker initialEntries={entries} />;
}
