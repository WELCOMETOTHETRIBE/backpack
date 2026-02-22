import Link from "next/link";
import { auth } from "@/lib/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">CMMC Compliance Control Plane</h1>
      <p className="mb-6 text-center text-zinc-600">
        Multi-tenant, metadata-only compliance operating system for CMMC Level 2 enclaves.
      </p>
      {session?.user ? (
        <Link
          href="/dashboard"
          className="rounded-full bg-zinc-900 px-6 py-2 font-medium text-white hover:bg-zinc-800"
        >
          Go to Dashboard
        </Link>
      ) : (
        <Link
          href="/auth/signin"
          className="rounded-full bg-zinc-900 px-6 py-2 font-medium text-white hover:bg-zinc-800"
        >
          Sign in
        </Link>
      )}
    </div>
  );
}
