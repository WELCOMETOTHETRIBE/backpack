import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  trainingRecords,
  controlRecords,
  poamEntries,
  poamEntryMilestones,
  users,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { scoreControlsAffectedBy } from "@/lib/canonical-state/rescore-trigger";

/**
 * Training controls mapped to their training types and descriptions.
 * These match the TRAINING_SECTIONS defined in TrainingClient.tsx.
 */
const TRAINING_CONTROLS = [
  {
    controlId: "3.2.1",
    trainingType: "security_awareness",
    title: "Security Awareness Training",
    requiredFor: ["general", "privileged"] as const,
  },
  {
    controlId: "3.2.2",
    trainingType: "role_based",
    title: "Role-Based / Privileged User Training",
    requiredFor: ["privileged"] as const,
  },
  {
    controlId: "3.2.3",
    trainingType: "insider_threat",
    title: "Insider Threat Awareness",
    requiredFor: ["general", "privileged"] as const,
  },
] as const;

/**
 * POST /api/training-records/sync-poams
 *
 * Analyses boundary users' training records. For each NIST 3.2.x control where
 * at least one required user is missing or has expired training, ensures a
 * POA&M entry exists on the corresponding control record — pre-populated with
 * a weakness description, remediation plan, 90-day scheduled completion, and
 * a milestone per affected user.
 */
export async function POST() {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    // 1. Load boundary users and their stored user types
    const orgUsers = await db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(eq(users.organizationId, orgId));

    if (orgUsers.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0, details: [], message: "No boundary users defined." });
    }

    // 2. Load all training records for the org
    const records = await db
      .select({
        personnelName: trainingRecords.personnelName,
        personnelEmail: trainingRecords.personnelEmail,
        trainingType: trainingRecords.trainingType,
        expiresAt: trainingRecords.expiresAt,
      })
      .from(trainingRecords)
      .where(eq(trainingRecords.organizationId, orgId));

    const now = new Date();

    // 3. For each control, determine which users have gaps
    type GapDetail = {
      controlId: string;
      title: string;
      affectedUsers: { name: string; email: string; reason: "missing" | "expired" }[];
    };
    const gaps: GapDetail[] = [];

    for (const ctrl of TRAINING_CONTROLS) {
      // All users are considered — in production, user types come from localStorage
      // on the client. Server-side we conservatively check all users for 3.2.1/3.2.3
      // (required for general+privileged) and all users for 3.2.2 (ideally
      // privileged-only, but without server-stored user types we flag it for review).
      const affected: GapDetail["affectedUsers"] = [];

      for (const user of orgUsers) {
        const userRecords = records.filter(
          (r) =>
            r.trainingType === ctrl.trainingType &&
            (r.personnelName.toLowerCase() === (user.name ?? "").toLowerCase() ||
              (r.personnelEmail ?? "").toLowerCase() === user.email.toLowerCase())
        );

        if (userRecords.length === 0) {
          affected.push({ name: user.name ?? user.email, email: user.email, reason: "missing" });
        } else {
          const hasValid = userRecords.some(
            (r) => !r.expiresAt || new Date(r.expiresAt) >= now
          );
          if (!hasValid) {
            affected.push({ name: user.name ?? user.email, email: user.email, reason: "expired" });
          }
        }
      }

      if (affected.length > 0) {
        gaps.push({ controlId: ctrl.controlId, title: ctrl.title, affectedUsers: affected });
      }
    }

    if (gaps.length === 0) {
      return NextResponse.json({
        created: 0,
        skipped: 0,
        details: [],
        message: "All training controls are current — no POAMs needed.",
      });
    }

    // 4. Ensure control_records exist for each gap control, then create/skip POA&M entries
    const createdIds: string[] = [];
    const skippedControlIds: string[] = [];
    const details: { controlId: string; poamId: string; action: "created" | "exists" }[] = [];

    const scheduledDate = new Date(now.getTime() + 90 * 24 * 3600 * 1000)
      .toISOString()
      .slice(0, 10);

    for (const gap of gaps) {
      // Ensure control_record row exists
      let [cr] = await db
        .select({ id: controlRecords.id })
        .from(controlRecords)
        .where(
          and(
            eq(controlRecords.organizationId, orgId),
            eq(controlRecords.controlId, gap.controlId)
          )
        )
        .limit(1);

      if (!cr) {
        [cr] = await db
          .insert(controlRecords)
          .values({
            organizationId: orgId,
            controlId: gap.controlId,
            implementationStatus: "not_started",
          })
          .returning({ id: controlRecords.id });
      }

      // Check for existing open POA&M entry
      const [existing] = await db
        .select({ id: poamEntries.id })
        .from(poamEntries)
        .where(
          and(
            eq(poamEntries.controlRecordId, cr.id),
            eq(poamEntries.organizationId, orgId),
            eq(poamEntries.status, "open")
          )
        )
        .limit(1);

      if (existing) {
        skippedControlIds.push(gap.controlId);
        details.push({ controlId: gap.controlId, poamId: existing.id, action: "exists" });
        continue;
      }

      // Build weakness description from affected users
      const missingNames = gap.affectedUsers
        .filter((u) => u.reason === "missing")
        .map((u) => u.name);
      const expiredNames = gap.affectedUsers
        .filter((u) => u.reason === "expired")
        .map((u) => u.name);

      const parts: string[] = [];
      if (missingNames.length > 0)
        parts.push(`Missing training: ${missingNames.join(", ")}`);
      if (expiredNames.length > 0)
        parts.push(`Expired training: ${expiredNames.join(", ")}`);

      const weakness = `${gap.title} (NIST ${gap.controlId}) — ${gap.affectedUsers.length} user${gap.affectedUsers.length !== 1 ? "s" : ""} non-compliant. ${parts.join(". ")}.`;
      const remediation = `Schedule and complete ${gap.title.toLowerCase()} for all affected personnel. Upload completion certificates to the Training Records page and Evidence Engine.`;

      const [inserted] = await db
        .insert(poamEntries)
        .values({
          organizationId: orgId,
          controlRecordId: cr.id,
          weaknessDescription: weakness,
          remediationPlan: remediation,
          scheduledCompletionDate: scheduledDate,
        })
        .returning({ id: poamEntries.id });

      // Create a milestone per affected user
      for (let i = 0; i < gap.affectedUsers.length; i++) {
        const u = gap.affectedUsers[i];
        await db.insert(poamEntryMilestones).values({
          poamEntryId: inserted.id,
          title: `Complete ${gap.title.toLowerCase()} for ${u.name} (${u.reason})`,
          dueDate: scheduledDate,
          orderIndex: i,
        });
      }

      createdIds.push(inserted.id);
      details.push({ controlId: gap.controlId, poamId: inserted.id, action: "created" });
    }

    // Canonical rescore for every AT control we touched. POA&M creation
    // can elevate met_via to 'operational_plan_of_action' once the POA&M
    // is finalized, but even at draft stage the snapshot needs to reflect
    // the gap reality (and the rescore writes a history row regardless).
    if (gaps.length > 0) {
      try {
        await scoreControlsAffectedBy({
          organizationId: orgId,
          triggerSource: "poam_created",
          controlIds: gaps.map((g) => g.controlId),
          triggeredByUserId: user.id ?? null,
        });
      } catch (rescoreErr) {
        console.error("[training-records/sync-poams] rescore failed (non-blocking):", rescoreErr);
      }
    }

    return NextResponse.json({
      created: createdIds.length,
      skipped: skippedControlIds.length,
      details,
      message:
        createdIds.length > 0
          ? `Created ${createdIds.length} POA&M entr${createdIds.length === 1 ? "y" : "ies"} for training gaps.`
          : "POA&M entries already exist for all training gaps.",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to sync training POAMs";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
