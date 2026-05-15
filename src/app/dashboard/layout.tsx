import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import NonCuiBanner from "@/components/NonCuiBanner";
import { DashboardProviders } from "@/components/DashboardProviders";
import FeedbackWidget from "@/components/feedback/FeedbackWidget";
import { DashboardChrome } from "@/components/dashboard/DashboardChrome";

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
      <div className="flex min-h-0 flex-1 flex-col">
        <DashboardChrome user={session.user} boundaryComplete={boundaryComplete}>
          {children}
        </DashboardChrome>
      </div>
      <FeedbackWidget />
    </div>
  );
}
