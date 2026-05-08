import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceRegisterEntries, governanceRegisters } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { logGovernanceAudit } from "@/lib/governance/audit";
import { errorResponse } from "@/lib/evidence-engine/api-errors";
import { logEntryEvent } from "@/lib/evidence-engine/entry-events";
import { requireBoundaryForOrg } from "@/lib/evidence-engine/validate-boundary";
import { recalculateControlsForRegister } from "@/lib/control-status-register";

/**
 * GET /api/evidence-engine/entries/[entryId] — get single entry with register key for summary/labels.
 * Query: boundary_id (required).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { entryId } = await params;
    if (!entryId) return errorResponse("entryId required", 400);

    const { searchParams } = new URL(req.url);
    const boundaryResult = await requireBoundaryForOrg(orgId, searchParams.get("boundary_id"));
    if (boundaryResult instanceof NextResponse) return boundaryResult;
    const { boundary } = boundaryResult;

    const [entry] = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.id, entryId));
    if (!entry) return errorResponse("Entry not found", 404);
    if (entry.boundaryId !== boundary.id) {
      return errorResponse("Invalid or unauthorized boundary", 400, { code: "VALIDATION_ERROR" });
    }

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.id, entry.registerId),
          eq(governanceRegisters.organizationId, orgId)
        )
      );
    if (!register) return errorResponse("Register not found", 404);

    return NextResponse.json({
      ...entry,
      registerKey: register.registerKey,
      registerName: register.name,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return errorResponse(msg, 401, { code: "UNAUTHORIZED" });
  }
}

/**
 * PATCH /api/evidence-engine/entries/[entryId]
 * Body: { boundary_id: string, status?: "final", entryData?: ..., void?: boolean, voidReason?: string }
 * boundary_id required. Finalize/void/update as documented.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { entryId } = await params;
    if (!entryId) return errorResponse("entryId required", 400);

    const [entry] = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.id, entryId));
    if (!entry) return errorResponse("Entry not found", 404);

    const body = await req.json().catch(() => ({}));
    const boundaryId = (body.boundary_id ?? body.boundaryId ?? new URL(req.url).searchParams.get("boundary_id")) as string | undefined;
    const boundaryResult = await requireBoundaryForOrg(orgId, boundaryId);
    if (boundaryResult instanceof NextResponse) return boundaryResult;
    const { boundary } = boundaryResult;
    if (entry.boundaryId !== boundary.id) {
      return errorResponse("Invalid or unauthorized boundary", 400, { code: "VALIDATION_ERROR" });
    }

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.id, entry.registerId),
          eq(governanceRegisters.organizationId, orgId)
        )
      );
    if (!register) return errorResponse("Register not found", 404);

    if (body.status === "final") {
      const role = (user as { role?: string }).role;
      if (role !== "Admin") {
        return errorResponse("Only approvers (Admin) can finalize entries", 403, { code: "FORBIDDEN" });
      }
      if (entry.status === "final") {
        return errorResponse("Entry already finalized", 400, { code: "INVALID_STATE" });
      }
      if (entry.status === "void") {
        return errorResponse("Cannot finalize a voided entry", 400, { code: "INVALID_STATE" });
      }
      const now = new Date();
      await db
        .update(governanceRegisterEntries)
        .set({
          status: "final",
          finalizedAt: now,
          approvedById: user.id ?? null,
          lockedAt: now,
          lockedById: user.id ?? null,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, entryId));
      await logGovernanceAudit(orgId, user.id ?? null, "governance_register_entry_finalized", "governance_register_entry", entryId, { registerKey: register.registerKey });
      await logEntryEvent(orgId, entryId, entry.boundaryId, "finalized", user.id ?? null, { summary: "Entry finalized" });
      // Recalculate control statuses for all controls linked to this register
      await recalculateControlsForRegister(register.id, orgId);
      const [updated] = await db
        .select()
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.id, entryId));
      return NextResponse.json(updated);
    }

    if (body.void === true) {
      const role = (user as { role?: string }).role;
      if (role !== "Admin") {
        return errorResponse("Only approvers (Admin) can void entries", 403, { code: "FORBIDDEN" });
      }
      if (entry.status !== "final") {
        return errorResponse("Only finalized entries can be voided", 400, { code: "INVALID_STATE" });
      }
      const voidReason = typeof body.voidReason === "string" ? body.voidReason.trim() : "";
      if (!voidReason) {
        return errorResponse("voidReason is required when voiding an entry", 400, { code: "BAD_REQUEST" });
      }
      const now = new Date();
      await db
        .update(governanceRegisterEntries)
        .set({
          status: "void",
          voidedAt: now,
          voidedById: user.id ?? null,
          voidReason,
          updatedAt: now,
        })
        .where(eq(governanceRegisterEntries.id, entryId));
      await logGovernanceAudit(orgId, user.id ?? null, "governance_register_entry_voided", "governance_register_entry", entryId, { registerKey: register.registerKey, voidReason });
      await logEntryEvent(orgId, entryId, entry.boundaryId, "voided", user.id ?? null, { voidReason });
      // Recalculate control statuses — voiding may revert a control from "implemented"
      await recalculateControlsForRegister(register.id, orgId);
      const [updated] = await db
        .select()
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.id, entryId));
      return NextResponse.json(updated);
    }

    if (body.entryData !== undefined) {
      if (entry.status === "final" || entry.status === "void") {
        return errorResponse("Entry is locked; only void is allowed with reason and approver", 400, { code: "LOCKED_ENTRY" });
      }
      if (entry.status === "draft") {
      const role = (user as { role?: string }).role;
      if (role !== "Admin" && role !== "Compliance") {
        return errorResponse("Only editors (Compliance or Admin) can update draft entries", 403, { code: "FORBIDDEN" });
      }
      await db
        .update(governanceRegisterEntries)
        .set({
          entryData: body.entryData as Record<string, unknown>,
          updatedAt: new Date(),
        })
        .where(eq(governanceRegisterEntries.id, entryId));
      await logGovernanceAudit(orgId, user.id ?? null, "governance_register_entry_updated", "governance_register_entry", entryId, { registerKey: register.registerKey });
      await logEntryEvent(orgId, entryId, entry.boundaryId, "updated", user.id ?? null, { summary: "Fields updated" });
      const [updated] = await db
        .select()
        .from(governanceRegisterEntries)
        .where(eq(governanceRegisterEntries.id, entryId));
      return NextResponse.json(updated);
      }
    }

    return errorResponse("No valid update", 400, { code: "BAD_REQUEST" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return errorResponse(msg, 401, { code: "UNAUTHORIZED" });
  }
}
