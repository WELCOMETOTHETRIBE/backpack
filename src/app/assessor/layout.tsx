import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function AssessorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user as { role?: string; organizationId?: string } | undefined;
  if (!session?.user) redirect("/auth/signin");
  if (user?.role !== "Assessor") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900">
        This system is outside the CUI boundary. It does not store, process, or transmit CUI. Evidence artifacts remain in the customer enclave.
      </div>
      <nav className="border-b border-zinc-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/assessor" className="font-semibold text-zinc-900">
            Assessor View (read-only)
          </Link>
          <Link href="/api/auth/signout" className="text-sm text-zinc-600 hover:text-zinc-900">
            Sign out
          </Link>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
