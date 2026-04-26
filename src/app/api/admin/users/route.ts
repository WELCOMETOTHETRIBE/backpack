import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

export async function GET() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin"]);

    const orgUsers = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
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

export async function POST() {
  return NextResponse.json(
    {
      error:
        "User creation is handled by Clerk. Invite users from the Clerk dashboard; they'll be auto-provisioned in this org on first sign-in.",
    },
    { status: 501 }
  );
}
