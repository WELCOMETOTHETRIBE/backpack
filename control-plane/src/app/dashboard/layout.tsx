import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-surface-muted)]">
      <DashboardProviders user={session.user} />
      <NonCuiBanner />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={session.user} />
          <main className="flex-1 overflow-y-auto p-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
