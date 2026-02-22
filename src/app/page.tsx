import Link from "next/link";
import { auth } from "@/lib/auth";

function SetupRequired({ missing }: { missing: string[] }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Setup required</h1>
      <p className="mb-4 max-w-md text-center text-zinc-600">
        The app could not start. Set these variables in your environment (e.g. Railway → Service → Variables):
      </p>
      <ul className="mb-6 list-inside list-disc text-left text-sm text-zinc-700">
        {missing.map((v) => (
          <li key={v}>{v}</li>
        ))}
      </ul>
      <p className="text-center text-xs text-zinc-500">
        DATABASE_URL: use the Postgres connection URL from Railway. NEXTAUTH_URL: your app URL (e.g. https://cmmc-production.up.railway.app). AUTH_SECRET: run <code className="rounded bg-zinc-200 px-1">openssl rand -base64 32</code>
      </p>
    </div>
  );
}

export default async function HomePage() {
  let session = null;
  try {
    session = await auth();
  } catch (err) {
    const missing: string[] = [];
    if (!process.env.AUTH_SECRET) missing.push("AUTH_SECRET");
    if (!process.env.NEXTAUTH_URL) missing.push("NEXTAUTH_URL");
    if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
    if (missing.length) return <SetupRequired missing={missing} />;
    throw err;
  }

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
