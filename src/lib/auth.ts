import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import {
  checkIdentityAccess,
  findActiveAccessForApp,
} from "@/lib/mactech-identity-client";

const CODEX_APP_KEY = "codex";

/**
 * Map a MacTech customer-org role (from the Identity Command Center) to
 * a codex `users.role` value. Internal MacTech operators always become
 * Admin. Codex's `user_role` enum currently has just three values
 * (Admin, Compliance, Assessor); adjust if the enum is expanded.
 */
function mapIccRoleToCodexRole(iccRole: string, isInternal: boolean): string {
  if (isInternal) return "Admin";
  switch (iccRole) {
    case "customer_owner":
    case "customer_admin":
      return "Admin";
    case "auditor":
      return "Assessor";
    case "compliance_manager":
    case "security_manager":
    case "evidence_contributor":
    case "read_only_user":
    default:
      return "Compliance";
  }
}

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

  // JIT-create from the central Identity Command Center. Replaces the old
  // "only when the Clerk org is pre-mapped" path — now we trust the central
  // hub to tell us whether this user belongs in codex (and under what role
  // and which Clerk org). On a hit, we find or auto-create the matching
  // codex organizations row and then create the user under it.
  if (!userRow) {
    if (!clerkEmail) {
      const cu = await currentUser();
      clerkEmail = cu?.primaryEmailAddress?.emailAddress ?? null;
      clerkName =
        [cu?.firstName, cu?.lastName].filter(Boolean).join(" ").trim() || null;
    }
    if (!clerkEmail) return null;

    const iccResult = await checkIdentityAccess({
      clerkUserId: userId,
      appKey: CODEX_APP_KEY,
    });
    const access = findActiveAccessForApp(iccResult, CODEX_APP_KEY);
    if (!access) return null;

    // For non-internal users, find the codex organization that matches the
    // ICC org. If one doesn't exist yet, create it from the ICC metadata.
    // Internal MacTech users get attached to the active Clerk org if
    // present, or any first existing org as a fallback.
    let codexOrgId: string | null = null;
    if (!access.user.isInternalMacTechUser && access.org.clerkOrgId) {
      const existing = (
        await db
          .select()
          .from(organizations)
          .where(eq(organizations.clerkOrgId, access.org.clerkOrgId))
          .limit(1)
      )[0];
      if (existing) {
        codexOrgId = existing.id;
      } else {
        const created = (
          await db
            .insert(organizations)
            .values({
              name: access.org.orgName,
              slug:
                access.org.clerkOrgId.toLowerCase().replace(/[^a-z0-9-]/g, "-") ||
                `org-${Date.now()}`,
              clerkOrgId: access.org.clerkOrgId,
            })
            .returning()
        )[0];
        codexOrgId = created.id;
      }
    } else if (orgId) {
      const existing = (
        await db
          .select()
          .from(organizations)
          .where(eq(organizations.clerkOrgId, orgId))
          .limit(1)
      )[0];
      if (existing) codexOrgId = existing.id;
    }

    if (!codexOrgId) {
      // Internal user without an active Clerk org context — pick any
      // existing codex org as a fallback so they aren't blocked.
      const fallback = (await db.select().from(organizations).limit(1))[0];
      if (fallback) codexOrgId = fallback.id;
    }

    if (!codexOrgId) return null;

    const codexRole = mapIccRoleToCodexRole(
      access.org.role,
      access.user.isInternalMacTechUser,
    );
    const inserted = (
      await db
        .insert(users)
        .values({
          organizationId: codexOrgId,
          email: clerkEmail,
          clerkUserId: userId,
          name: clerkName,
          role: codexRole as never,
        })
        .returning()
    )[0];
    console.log(
      `[auth] JIT-provisioned codex user ${clerkEmail} as ${codexRole} ` +
        `(via ICC org ${access.org.orgName})`,
    );
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
