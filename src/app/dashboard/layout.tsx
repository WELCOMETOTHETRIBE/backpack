import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import NonCuiBanner from "@/components/NonCuiBanner";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/auth/signin");
  const user = session.user as { role?: string };

  return (
    <div className="min-h-screen bg-zinc-50">
      <NonCuiBanner />
      <nav className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/dashboard" className="font-semibold text-zinc-900">
            CMMC Control Plane
          </Link>
          <div className="flex gap-4">
            <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900">
              Dashboard
            </Link>
            <Link href="/dashboard/controls" className="text-sm text-zinc-600 hover:text-zinc-900">
              Controls
            </Link>
            <Link href="/dashboard/poam" className="text-sm text-zinc-600 hover:text-zinc-900">
              POA&M
            </Link>
            <Link href="/dashboard/evidence" className="text-sm text-zinc-600 hover:text-zinc-900">
              Evidence
            </Link>
            <Link href="/dashboard/governance" className="text-sm text-zinc-600 hover:text-zinc-900">
              Governance
            </Link>
            {user?.role === "Assessor" && (
              <Link href="/assessor" className="text-sm text-zinc-600 hover:text-zinc-900">
                Assessor view
              </Link>
            )}
<Link href="/boundary" className="text-sm text-zinc-600 hover:text-zinc-900">
            Boundary
          </Link>
          <Link href="/api/auth/signout" className="text-sm text-zinc-600 hover:text-zinc-900">
            Sign out
          </Link>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
