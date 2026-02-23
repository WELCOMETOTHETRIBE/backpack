import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { userInvitations, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const requestSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await requestSchema.parseAsync(await req.json());
    const { token, password, name } = body;

    const [invitation] = await db
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.token, token))
      .limit(1);

    if (!invitation) {
      return NextResponse.json({ error: "Invalid or expired invitation." }, { status: 400 });
    }
    if (new Date() > invitation.expiresAt) {
      await db.delete(userInvitations).where(eq(userInvitations.id, invitation.id));
      return NextResponse.json({ error: "This invitation has expired." }, { status: 400 });
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.organizationId, invitation.organizationId),
          eq(users.email, invitation.email)
        )
      )
      .limit(1);
    if (existingUser) {
      await db.delete(userInvitations).where(eq(userInvitations.id, invitation.id));
      return NextResponse.json({ error: "An account with this email already exists in the organization." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      organizationId: invitation.organizationId,
      email: invitation.email,
      passwordHash,
      name: name?.trim() || null,
      role: invitation.role,
    });

    await db.delete(userInvitations).where(eq(userInvitations.id, invitation.id));

    return NextResponse.json({ ok: true, email: invitation.email });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.errors[0]?.message ?? "Validation failed" }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Accept failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
