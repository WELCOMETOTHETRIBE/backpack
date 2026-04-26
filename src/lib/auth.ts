import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations, users } from "@/db/schema";

export type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  organizationId?: string;
  role?: string;
};

type AuthResult = {
  user: SessionUser | null;
};

async function resolveSessionUser(): Promise<SessionUser | null> {
  const { userId, orgId } = await clerkAuth();
  if (!userId) return null;

  let userRow = (
    await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1)
  )[0];

  let clerkEmail: string | null = null;
  let clerkName: string | null = null;

  // Adopt an existing pre-Clerk row by email so legacy NextAuth users keep
  // their FK references on first SSO login.
  if (!userRow) {
    const cu = await currentUser();
    clerkEmail = cu?.primaryEmailAddress?.emailAddress ?? null;
    clerkName =
      [cu?.firstName, cu?.lastName].filter(Boolean).join(" ").trim() || null;

    if (clerkEmail) {
      const byEmail = (
        await db.select().from(users).where(eq(users.email, clerkEmail)).limit(1)
      )[0];
      if (byEmail) {
        await db
          .update(users)
          .set({ clerkUserId: userId, updatedAt: new Date() })
          .where(eq(users.id, byEmail.id));
        userRow = { ...byEmail, clerkUserId: userId };
      }
    }
  }

  // JIT-create only when the Clerk org is pre-mapped via clerk_org_id, so we
  // never silently provision a tenant from an unknown Clerk org.
  if (!userRow) {
    if (!orgId) return null;
    const org = (
      await db
        .select()
        .from(organizations)
        .where(eq(organizations.clerkOrgId, orgId))
        .limit(1)
    )[0];
    if (!org) return null;

    if (!clerkEmail) {
      const cu = await currentUser();
      clerkEmail = cu?.primaryEmailAddress?.emailAddress ?? null;
      clerkName =
        [cu?.firstName, cu?.lastName].filter(Boolean).join(" ").trim() || null;
    }
    if (!clerkEmail) return null;

    const inserted = (
      await db
        .insert(users)
        .values({
          organizationId: org.id,
          email: clerkEmail,
          clerkUserId: userId,
          name: clerkName,
        })
        .returning()
    )[0];
    userRow = inserted;
  }

  return {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    organizationId: userRow.organizationId,
    role: userRow.role,
  };
}

export async function auth(): Promise<AuthResult | null> {
  const user = await resolveSessionUser();
  if (!user) return null;
  return { user };
}

export async function getTenantIdFromSession(): Promise<string | null> {
  const session = await auth();
  return session?.user?.organizationId ?? null;
}

export async function requireOrg(): Promise<string> {
  const orgId = await getTenantIdFromSession();
  if (!orgId) throw new Error("Unauthorized: no organization context");
  return orgId;
}

export async function requireRole(allowed: string[]): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) throw new Error("Unauthorized");
  if (allowed.length && !allowed.includes(user.role ?? "")) throw new Error("Forbidden");
  return user;
}
