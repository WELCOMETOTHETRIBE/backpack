import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  poamEntries,
  poamEntryMilestones,
  controlRecords,
  controls,
  controlFamilies,
} from "@/db/schema";
import { eq, and, notInArray, inArray, asc } from "drizzle-orm";
import { PoamTracker, type PoamEntry } from "./PoamTracker";
import { CONTROL_INTELLIGENCE } from "@/data/cmmc/control-intelligence";
import { sprsScoringData } from "@/lib/sprs";

const DONE_STATUSES = ["implemented", "assessed", "inherited", "not_applicable"] as const;

export default async function PoamPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // ── Auto-sync: create POA&M entries for controls that are not yet compliant ──
  const incompleteRecords = await db
    .select({ id: controlRecords.id })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        notInArray(controlRecords.implementationStatus, [...DONE_STATUSES])
      )
    );

  if (incompleteRecords.length > 0) {
    const existingLinks = await db
      .select({ controlRecordId: poamEntries.controlRecordId })
      .from(poamEntries)
      .where(eq(poamEntries.organizationId, orgId));

    const existingSet = new Set(existingLinks.map((e) => e.controlRecordId));
    const toCreate = incompleteRecords.filter((r) => !existingSet.has(r.id));

    if (toCreate.length > 0) {
      await db.insert(poamEntries).values(
        toCreate.map((r) => ({ organizationId: orgId, controlRecordId: r.id }))
      );
    }
  }

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
    const controlNowImplemented = DONE_STATUSES.includes(
      e.implementationStatus as (typeof DONE_STATUSES)[number]
    );

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
      c3paoNote: intel?.c3paoExaminerNote ?? null,
      disposition: intel?.disposition ?? null,
    };
  });

  return <PoamTracker initialEntries={entries} />;
}
