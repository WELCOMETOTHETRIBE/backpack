import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  name: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["Admin", "Compliance", "Assessor"]),
});

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

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin"]);

    const body = await createUserSchema.parseAsync(await req.json());
    const normalizedEmail = body.email.trim().toLowerCase();

    // Check if user with this email already exists in the organization
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(eq(users.organizationId, orgId), eq(users.email, normalizedEmail))
      )
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: "A user with this email already exists in your organization." },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(body.password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        organizationId: orgId,
        email: normalizedEmail,
        passwordHash,
        name: body.name?.trim() || null,
        role: body.role,
      })
      .returning({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      });

    if (!newUser) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    return NextResponse.json(newUser, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      const msg = e.issues[0]?.message ?? "Validation failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Failed to create user";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
