import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import NonCuiBanner from "@/components/NonCuiBanner";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { DashboardProviders } from "@/components/DashboardProviders";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");

  const user = session.user as { role?: string; organizationId?: string };
  if (user?.role === "Assessor") redirect("/assessor/overview");

  const orgId = user?.organizationId;

  // Fetch boundary completion status to drive the sidebar indicator dot
  let boundaryComplete: boolean | null = null;
  if (orgId) {
    const [orgRow] = await db
      .select({ boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    boundaryComplete = orgRow ? !!orgRow.boundaryScopingCompletedAt : false;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-surface-muted)]">
      <DashboardProviders user={session.user} />
      <NonCuiBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar boundaryComplete={boundaryComplete} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={session.user} />
          <main className="flex-1 overflow-y-auto p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
