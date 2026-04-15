import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * GET /api/boundary-users
 * 
 * Returns a list of users in the organization for boundary personnel tracking.
 * This endpoint is accessible to Admin, Compliance, and Assessor roles since
 * it's needed for training compliance tracking (CMMC 3.2.x controls).
 * 
 * Note: This returns minimal user info (id, email, name) - no sensitive data.
 */
export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const orgUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
      })
      .from(users)
      .where(eq(users.organizationId, orgId));

    return NextResponse.json(orgUsers);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
