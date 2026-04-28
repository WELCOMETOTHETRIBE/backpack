import { NextResponse } from "next/server";
import { db } from "@/db";
import { trainingRecords, governanceRegisters, governanceRegisterEntries, boundaries } from "@/db/schema";
import { eq, and, desc, asc } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { ensureEvidenceEngineRegistersForOrg } from "@/lib/evidence-engine/control-dashboard";
import { logEntryEvent } from "@/lib/evidence-engine/entry-events";

export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const rows = await db
      .select()
      .from(trainingRecords)
      .where(eq(trainingRecords.organizationId, orgId))
      .orderBy(desc(trainingRecords.completedAt));

    return NextResponse.json(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * Map trainingType from Training page to Evidence Engine entry_type.
 */
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

/**
 * Map deliveryMethod from Training page to Evidence Engine delivery_method enum.
 */
function mapDeliveryMethod(deliveryMethod: string | null): string {
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

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    const body = await req.json();
    const { personnelName, personnelEmail, trainingType, courseTitle, deliveryMethod, completedAt, expiresAt, evidenceUrl, notes, userRole } = body;

    if (!personnelName?.trim() || !trainingType?.trim() || !courseTitle?.trim() || !completedAt) {
      return NextResponse.json(
        { error: "personnelName, trainingType, courseTitle, completedAt are required" },
        { status: 400 }
      );
    }

    // Create the training record
    const [row] = await db
      .insert(trainingRecords)
      .values({
        organizationId: orgId,
        personnelName: personnelName.trim(),
        personnelEmail: personnelEmail?.trim() || null,
        trainingType: trainingType.trim(),
        courseTitle: courseTitle.trim(),
        deliveryMethod: deliveryMethod?.trim() || null,
        completedAt,
        expiresAt: expiresAt || null,
        userRole: userRole?.trim() || null,
        evidenceUrl: evidenceUrl?.trim() || null,
        notes: notes?.trim() || null,
      })
      .returning();

    // Also create an entry in the training_completion register for evidence engine
    // First, get the org's first boundary (if any)
    const [firstBoundary] = await db
      .select({ id: boundaries.id })
      .from(boundaries)
      .where(eq(boundaries.organizationId, orgId))
      .orderBy(asc(boundaries.createdAt))
      .limit(1);

    if (firstBoundary) {
      // Ensure org has training_completion register
      await ensureEvidenceEngineRegistersForOrg(orgId);

      // Get the training_completion register
      const [register] = await db
        .select()
        .from(governanceRegisters)
        .where(
          and(
            eq(governanceRegisters.organizationId, orgId),
            eq(governanceRegisters.registerKey, "training_completion")
          )
        );

      if (register) {
        const entryType = mapTrainingTypeToEntryType(trainingType);
        const mappedDeliveryMethod = mapDeliveryMethod(deliveryMethod);
        const completedDate = new Date(completedAt);
        const trainingYear = completedDate.getFullYear().toString();

        // Build entry data based on the entry type
        const entryData: Record<string, unknown> = {
          subject_user: personnelName.trim(),
          training_name: courseTitle.trim(),
          completed_at: completedAt,
          delivery_method: mappedDeliveryMethod,
        };

        if (entryType === "annual_training_completion") {
          entryData.training_year = trainingYear;
        } else if (entryType === "role_based_training_completion") {
          entryData.role = userRole || "all_users";
          entryData.required_by = "CMMC 3.2.2";
        }

        if (notes?.trim()) {
          entryData.notes = notes.trim();
        }
        if (evidenceUrl?.trim()) {
          entryData.certificate_id = evidenceUrl.trim();
        }

        // Create the register entry
        const [entry] = await db
          .insert(governanceRegisterEntries)
          .values({
            registerId: register.id,
            boundaryId: firstBoundary.id,
            entryType,
            status: "draft",
            entryData,
            createdById: user.id ?? null,
            hold: 0,
          })
          .returning();

        if (entry?.id) {
          await logEntryEvent(orgId, entry.id, firstBoundary.id, "created", user.id ?? null, {
            entry_type: entryType,
            source: "training_page",
            training_record_id: row.id,
          });
        }
      }
    }

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await db
      .delete(trainingRecords)
      .where(and(eq(trainingRecords.id, id), eq(trainingRecords.organizationId, orgId)));

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unauthorized";
    const status = msg === "Unauthorized" ? 401 : msg === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
