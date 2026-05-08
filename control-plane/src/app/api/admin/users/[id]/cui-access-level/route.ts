import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

/**
 * PATCH /api/admin/users/[id]/cui-access-level
 *
 * Sets `users.cui_access_level` for a user in the caller's org. Replaces
 * the prior browser-localStorage classification model — see migration
 * 0064 for rationale.
 *
 * Body: { cuiAccessLevel: "general" | "privileged" }
 *
 * Auth: Admin only. Org-scoped.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin"]);

    const { id: userId } = await ctx.params;

    const body = (await req.json()) as { cuiAccessLevel?: unknown };
    const level = body.cuiAccessLevel;
    if (level !== "general" && level !== "privileged") {
      return NextResponse.json(
        {
          error:
            "cuiAccessLevel must be one of: 'general', 'privileged'",
        },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(users)
      .set({ cuiAccessLevel: level })
      .where(and(eq(users.id, userId), eq(users.organizationId, orgId)))
      .returning({
        id: users.id,
        email: users.email,
        cuiAccessLevel: users.cuiAccessLevel,
      });

    if (!updated) {
      return NextResponse.json(
        { error: "User not found in this organization" },
        { status: 404 },
      );
    }

    return NextResponse.json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status =
      message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
