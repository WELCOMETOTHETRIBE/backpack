import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getRegisterSchemaByRegisterId } from "@/data/cmmc/register-schemas";
import { logGovernanceAudit } from "@/lib/governance/audit";
import { errorResponse } from "@/lib/evidence-engine/api-errors";
import { validateEntryData } from "@/lib/evidence-engine/validate-entry-data";
import { logEntryEvent } from "@/lib/evidence-engine/entry-events";
import { requireBoundaryForOrg } from "@/lib/evidence-engine/validate-boundary";

/**
 * GET /api/evidence-engine/registers/[registerKey]/entries
 * Query: boundary_id (required), page, limit, auditor=1 to show only finalized entries.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ registerKey: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { registerKey } = await params;
    if (!registerKey) return errorResponse("registerKey required", 400);

    const { searchParams } = new URL(req.url);
    const boundaryId = searchParams.get("boundary_id");
    const boundaryResult = await requireBoundaryForOrg(orgId, boundaryId);
    if (boundaryResult instanceof NextResponse) return boundaryResult;
    const { boundary: _boundary } = boundaryResult;

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          eq(governanceRegisters.registerKey, registerKey)
        )
      );

    if (!register) return errorResponse("Register not found", 404);

    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));
    const offset = (page - 1) * limit;
    const auditorOnly = searchParams.get("auditor") === "1";

    const conditions = [
      eq(governanceRegisterEntries.registerId, register.id),
      eq(governanceRegisterEntries.boundaryId, _boundary.id),
    ];
    if (auditorOnly) {
      conditions.push(eq(governanceRegisterEntries.status, "final"));
    }

    const entries = await db
      .select()
      .from(governanceRegisterEntries)
      .where(and(...conditions))
      .orderBy(desc(governanceRegisterEntries.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(governanceRegisterEntries)
      .where(and(...conditions));

    return NextResponse.json({
      register: {
        id: register.id,
        registerKey: register.registerKey,
        name: register.name,
        description: register.description,
      },
      entries,
      total: totalRow?.count ?? 0,
      page,
      limit,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return errorResponse(msg, 401, { code: "UNAUTHORIZED" });
  }
}

/**
 * POST /api/evidence-engine/registers/[registerKey]/entries
 * Body: { boundary_id: string, entry_type: string, entryData: Record<string, unknown> }
 * Validates against register schema (required fields, enums), creates entry as draft.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ registerKey: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);
    const { registerKey } = await params;
    if (!registerKey) return errorResponse("registerKey required", 400);

    const body = await req.json().catch(() => ({}));
    const boundaryId = (body.boundary_id ?? body.boundaryId) as string | undefined;
    const boundaryResult = await requireBoundaryForOrg(orgId, boundaryId);
    if (boundaryResult instanceof NextResponse) return boundaryResult;
    const { boundary } = boundaryResult;

    const schema = getRegisterSchemaByRegisterId(registerKey);
    if (!schema) return errorResponse("Register schema not found", 404);

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          eq(governanceRegisters.registerKey, registerKey)
        )
      );
    if (!register) return errorResponse("Register not found", 404);

    const entryType = (body.entry_type ?? body.entryType) as string | undefined;
    const entryData = (body.entryData ?? {}) as Record<string, unknown>;

    if (!entryType || typeof entryType !== "string") {
      return errorResponse("entry_type required", 400, { code: "BAD_REQUEST" });
    }

    const entryTypeSchema = schema.entry_types.find((et) => et.type === entryType);
    if (!entryTypeSchema) {
      return errorResponse(`Invalid entry_type: ${entryType}`, 400, { code: "BAD_REQUEST" });
    }

    const validation = validateEntryData(entryTypeSchema, entryData);
    if (!validation.success) {
      return errorResponse("Validation failed", 400, { code: "VALIDATION_ERROR", fields: validation.fields });
    }
    const validatedData = validation.data;

    const [entry] = await db
      .insert(governanceRegisterEntries)
      .values({
        registerId: register.id,
        boundaryId: boundary.id,
        entryType,
        status: "draft",
        entryData: validatedData,
        createdById: user.id ?? null,
        hold: 0,
      })
      .returning();

    await logGovernanceAudit(orgId, user.id ?? null, "governance_register_entry_created", "governance_register_entry", entry?.id ?? null, { registerKey, entry_type: entryType });
    if (entry?.id) {
      await logEntryEvent(orgId, entry.id, boundary.id, "created", user.id ?? null, { entry_type: entryType });
    }

    return NextResponse.json(entry);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return errorResponse(msg, 401, { code: "UNAUTHORIZED" });
  }
}
