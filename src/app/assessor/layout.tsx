import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Shield, Lock, LogOut } from "lucide-react";
import { AssessorNav } from "./AssessorNav";

export default async function AssessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user as { role?: string; organizationId?: string } | undefined;
  if (!session?.user) redirect("/auth/signin");
  if (user?.role !== "Assessor") redirect("/dashboard");

  const orgId = user?.organizationId;
  let orgName: string | null = null;
  if (orgId) {
    const [orgRow] = await db
      .select({ name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    orgName = orgRow?.name ?? null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-surface-muted,#f8fafc)]">
      {/* Persistent amber assessor banner */}
      <div className="flex shrink-0 items-center gap-2.5 border-b border-amber-200 bg-amber-50 px-5 py-2">
        <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
        <p className="text-xs font-medium text-amber-800">
          <span className="font-semibold">ASSESSOR VIEW</span> — Read-only access to{" "}
          <span className="font-semibold">{orgName ?? "this organization"}</span>&apos;s compliance posture.
          No changes can be made.
        </p>
      </div>

      {/* Top navigation bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border,#e2e8f0)] bg-white px-5">
        <Link
          href="/assessor/overview"
          className="flex items-center gap-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-500">
            <Shield className="h-4 w-4 text-white" aria-hidden />
          </div>
          <div>
            <span className="block text-[13px] font-semibold leading-tight text-gray-900">
              Trust Codex
            </span>
            <span className="block text-[10px] font-medium uppercase leading-tight tracking-wide text-gray-400">
              Assessor
            </span>
          </div>
        </Link>

        <AssessorNav />

        <a
          href="/api/auth/signout"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sign out
        </a>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
