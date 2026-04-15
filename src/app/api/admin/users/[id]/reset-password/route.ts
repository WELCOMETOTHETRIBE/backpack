import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin"]);

    const { id: userId } = await params;
    const body = await resetPasswordSchema.parseAsync(await req.json());

    // Verify the user exists and belongs to the same organization
    const [targetUser] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.organizationId, orgId)))
      .limit(1);

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found in your organization." },
        { status: 404 }
      );
    }

    const passwordHash = await bcrypt.hash(body.newPassword, 10);

    await db
      .update(users)
      .set({ passwordHash })
      .where(and(eq(users.id, userId), eq(users.organizationId, orgId)));

    return NextResponse.json({ ok: true, email: targetUser.email });
  } catch (e) {
    if (e instanceof z.ZodError) {
      const msg = e.issues[0]?.message ?? "Validation failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Failed to reset password";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
