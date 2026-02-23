import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { eq } from "drizzle-orm";

const requestSchema = z.object({
  organizationName: z.string().min(1, "Organization name is required"),
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "org";
}

export async function POST(req: Request) {
  try {
    const body = await requestSchema.parseAsync(await req.json());
    const { organizationName, email, password, name } = body;

    const normalizedEmail = email.trim().toLowerCase();

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, normalizedEmail))
      .limit(1);
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 400 }
      );
    }

    let baseSlug = slugify(organizationName);
    let slug = baseSlug;
    let attempts = 0;
    while (attempts < 100) {
      const [existing] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1);
      if (!existing) break;
      slug = `${baseSlug}-${++attempts}`;
    }

    const [org] = await db
      .insert(organizations)
      .values({ name: organizationName.trim(), slug })
      .returning({ id: organizations.id });
    if (!org) {
      return NextResponse.json({ error: "Failed to create organization" }, { status: 500 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [newUser] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        email: normalizedEmail,
        passwordHash,
        name: name?.trim() || null,
        role: "Admin",
      })
      .returning({ id: users.id });
    if (!newUser) {
      return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      const msg = e.errors[0]?.message ?? "Validation failed";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Sign up failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
