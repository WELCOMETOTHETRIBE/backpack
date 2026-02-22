import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, String(credentials.email)));
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(String(credentials.password), user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          organizationId: user.organizationId,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.organizationId = user.organizationId;
        token.role = user.role;
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub ?? undefined;
        (session.user as { organizationId?: string }).organizationId = token.organizationId as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
  session: { strategy: "jwt" },
});

export type SessionUser = {
  id?: string;
  email?: string | null;
  name?: string | null;
  organizationId?: string;
  role?: string;
};

export async function getTenantIdFromSession(): Promise<string | null> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  return user?.organizationId ?? null;
}

export async function requireOrg(): Promise<string> {
  const orgId = await getTenantIdFromSession();
  if (!orgId) throw new Error("Unauthorized: no organization context");
  return orgId;
}

export async function requireRole(allowed: string[]): Promise<SessionUser> {
  const session = await auth();
  const user = session?.user as SessionUser | undefined;
  if (!user?.id) throw new Error("Unauthorized");
  if (allowed.length && !allowed.includes(user.role ?? "")) throw new Error("Forbidden");
  return user;
}
