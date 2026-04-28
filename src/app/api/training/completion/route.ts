import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  organizations,
  trainingRecords,
} from "@/db/schema";
import { ensureEvidenceEngineRegistersForOrg } from "@/lib/evidence-engine/control-dashboard";
import { logEntryEvent } from "@/lib/evidence-engine/entry-events";

/**
 * POST /api/training/completion
 *
 * Server-to-server training-completion ingestion. Used by sibling
 * products (MacTech Training today, future LMSs) to push a finished
 * training event into Codex without requiring a Clerk session for the
 * completing user.
 *
 * Authenticated via shared bearer secret in Authorization: Bearer
 * <TRAINING_API_TOKEN>. The token is rotated out-of-band and stored
 * as an env var on both Codex and the consuming service.
 *
 * Behavior mirrors POST /api/training-records (session-authed) so
 * Compliance gets the same artifact whether a record was filed by an
 * Admin in-app or pushed from the LMS:
 *
 *   1. Resolve organization by clerkOrgId (shared identity).
 *   2. Insert into training_records with delivery_method="mactech_training"
 *      (or whatever the source identifies as).
 *   3. Ensure the org has the training_completion governance register.
 *   4. Insert a governance_register_entry tied to the org's first
 *      boundary, with the same entry_type mapping as the in-app form.
 *   5. logEntryEvent so it shows on the audit timeline.
 *
 * Idempotency: callers SHOULD pass `external_completion_id` (e.g.
 * MacTech Training's enrollmentId) — duplicate posts for the same
 * (org, external_completion_id) collapse to one training_record /
 * register_entry pair.
 *
 *   200 { trainingRecordId, registerEntryId | null, deduped: boolean }
 *   400 missing/invalid payload
 *   401 missing/wrong bearer
 *   404 no org for that clerkOrgId
 *   503 token not configured server-side (fail-closed)
 */

type CompletionBody = {
  clerk_org_id?: string;
  clerkOrgId?: string;
  personnel_email?: string;
  personnel_name?: string;
  course_title?: string;
  training_type?: "security_awareness" | "role_based" | "insider_threat" | "other";
  delivery_method?: string; // free-form; we map to canonical
  completed_at?: string; // ISO date YYYY-MM-DD or full ISO datetime
  expires_at?: string | null;
  certificate_url?: string | null;
  certificate_number?: string | null;
  external_completion_id?: string | null; // e.g. MacTech Training enrollmentId
  user_role?: string | null;
  notes?: string | null;
  source?: string; // e.g. "mactech_training"
};

function mapTrainingTypeToEntryType(trainingType: string): string {
  switch (trainingType) {
    case "security_awareness":
      return "annual_training_completion";
    case "role_based":
      return "role_based_training_completion";
    case "insider_threat":
      return "annual_training_completion";
    default:
      return "annual_training_completion";
  }
}

function mapDeliveryMethod(deliveryMethod: string | null | undefined): string {
  if (!deliveryMethod) return "lms";
  switch (deliveryMethod) {
    case "mactech_training":
    case "online":
    case "cbt":
      return "lms";
    case "classroom":
      return "in_person";
    case "self_study":
      return "self_study";
    default:
      return "other";
  }
}

function isoDateOnly(v: string): string {
  // Accept either "2026-04-27" or "2026-04-27T15:30:00Z"
  return v.includes("T") ? v.slice(0, 10) : v;
}

export async function POST(req: Request) {
  const expected = process.env.TRAINING_API_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "TRAINING_API_TOKEN not configured on Codex" },
      { status: 503 }
    );
  }
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CompletionBody;
  try {
    body = (await req.json()) as CompletionBody;
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body" },
      { status: 400 }
    );
  }

  const clerkOrgId = (body.clerk_org_id || body.clerkOrgId || "").trim();
  const personnelName = (body.personnel_name || "").trim();
  const personnelEmail = (body.personnel_email || "").trim() || null;
  const courseTitle = (body.course_title || "").trim();
  const trainingType = (body.training_type || "security_awareness").trim();
  const completedAtRaw = (body.completed_at || "").trim();
  const externalCompletionId =
    (body.external_completion_id || "").trim() || null;

  if (!clerkOrgId) {
    return NextResponse.json(
      { error: "clerk_org_id is required" },
      { status: 400 }
    );
  }
  if (!personnelName || !courseTitle || !completedAtRaw) {
    return NextResponse.json(
      {
        error:
          "personnel_name, course_title, completed_at are required",
      },
      { status: 400 }
    );
  }

  const completedAt = isoDateOnly(completedAtRaw);
  const expiresAt = body.expires_at ? isoDateOnly(body.expires_at) : null;
  const evidenceUrl = (body.certificate_url || "").trim() || null;
  const deliveryMethod = (body.delivery_method || "mactech_training").trim();
  const sourceTag = (body.source || "mactech_training").trim();
  const userRole = (body.user_role || "").trim() || null;
  const callerNotes = (body.notes || "").trim() || null;

  // 1. Resolve organization.
  const org = (
    await db
      .select({ id: organizations.id, slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.clerkOrgId, clerkOrgId))
      .limit(1)
  )[0];

  if (!org) {
    return NextResponse.json(
      { error: "no organization for that clerkOrgId" },
      { status: 404 }
    );
  }

  // 2. Idempotency: if we've ingested this (org, external_completion_id)
  // already, return the existing rows. We stash the external id in
  // training_records.notes as `[ext:<id>]` since the schema doesn't
  // have a dedicated column.
  const externalMarker = externalCompletionId
    ? `[ext:${externalCompletionId}]`
    : null;
  if (externalMarker) {
    const existing = (
      await db
        .select({
          id: trainingRecords.id,
          notes: trainingRecords.notes,
          userRole: trainingRecords.userRole,
          expiresAt: trainingRecords.expiresAt,
        })
        .from(trainingRecords)
        .where(eq(trainingRecords.organizationId, org.id))
    ).find((r) => (r.notes ?? "").includes(externalMarker));
    if (existing) {
      // Refresh fields the original push couldn't fill (early bridge
      // versions sent expires_at: null and didn't send user_role at
      // all). Only writes columns that are still null on the existing
      // row, so a hand-edit isn't clobbered by a re-push.
      const refresh: Partial<{
        userRole: string;
        expiresAt: string;
      }> = {};
      if (!existing.userRole && userRole) refresh.userRole = userRole;
      if (!existing.expiresAt && expiresAt) refresh.expiresAt = expiresAt;
      if (Object.keys(refresh).length > 0) {
        await db
          .update(trainingRecords)
          .set(refresh)
          .where(eq(trainingRecords.id, existing.id));
      }
      return NextResponse.json(
        {
          trainingRecordId: existing.id,
          registerEntryId: null,
          deduped: true,
          refreshed: Object.keys(refresh),
        },
        { status: 200 }
      );
    }
  }

  // 3. Compose notes (preserve caller notes + record source + ext id).
  const notesParts: string[] = [];
  if (callerNotes) notesParts.push(callerNotes);
  notesParts.push(`Source: ${sourceTag}`);
  if (externalMarker) notesParts.push(externalMarker);
  if (body.certificate_number) {
    notesParts.push(`Certificate #${body.certificate_number}`);
  }
  const notes = notesParts.join(" · ");

  // 4. Insert the training_record.
  const [row] = await db
    .insert(trainingRecords)
    .values({
      organizationId: org.id,
      personnelName,
      personnelEmail,
      trainingType,
      courseTitle,
      deliveryMethod,
      completedAt,
      expiresAt,
      userRole,
      evidenceUrl,
      notes,
    })
    .returning();

  // 5. Mirror the in-app POST behavior: create register entry in
  // training_completion, anchored to the org's first boundary.
  const [firstBoundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, org.id))
    .orderBy(asc(boundaries.createdAt))
    .limit(1);

  let registerEntryId: string | null = null;
  if (firstBoundary) {
    await ensureEvidenceEngineRegistersForOrg(org.id);

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, org.id),
          eq(governanceRegisters.registerKey, "training_completion")
        )
      );

    if (register) {
      const entryType = mapTrainingTypeToEntryType(trainingType);
      const mappedDeliveryMethod = mapDeliveryMethod(deliveryMethod);
      const trainingYear = new Date(completedAt).getFullYear().toString();

      const entryData: Record<string, unknown> = {
        subject_user: personnelName,
        training_name: courseTitle,
        completed_at: completedAt,
        delivery_method: mappedDeliveryMethod,
      };
      if (entryType === "annual_training_completion") {
        entryData.training_year = trainingYear;
      } else if (entryType === "role_based_training_completion") {
        entryData.role = userRole || "all_users";
        entryData.required_by = "CMMC 3.2.2";
      }
      if (callerNotes) entryData.notes = callerNotes;
      if (evidenceUrl) entryData.certificate_id = evidenceUrl;
      if (body.certificate_number) {
        entryData.certificate_number = body.certificate_number;
      }
      entryData.source = sourceTag;

      const [entry] = await db
        .insert(governanceRegisterEntries)
        .values({
          registerId: register.id,
          boundaryId: firstBoundary.id,
          entryType,
          status: "draft",
          entryData,
          createdById: null, // server-to-server import — no Codex user
          hold: 0,
        })
        .returning();

      if (entry?.id) {
        registerEntryId = entry.id;
        await logEntryEvent(
          org.id,
          entry.id,
          firstBoundary.id,
          "created",
          null,
          {
            entry_type: entryType,
            source: sourceTag,
            training_record_id: row.id,
            external_completion_id: externalCompletionId,
          }
        );
      }
    }
  }

  return NextResponse.json(
    {
      trainingRecordId: row.id,
      registerEntryId,
      deduped: false,
    },
    { status: 201 }
  );
}
