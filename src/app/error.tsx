"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4">
      <h1 className="mb-2 text-2xl font-semibold text-zinc-900">Application error</h1>
      <p className="mb-4 max-w-md text-center text-zinc-600">
        A server-side exception occurred. On Railway this is often missing <code className="text-zinc-800">AUTH_SECRET</code> /{" "}
        <code className="text-zinc-800">NEXTAUTH_URL</code> / <code className="text-zinc-800">DATABASE_URL</code>, or the database schema is behind deploys (run{" "}
        <code className="text-zinc-800">npm run release</code> in the predeploy hook so migrations apply).
      </p>
      <p className="mb-2 text-center text-sm text-zinc-700">
        Ensure your service has: <strong>AUTH_SECRET</strong>, <strong>NEXTAUTH_URL</strong> (public https URL for this deployment), and{" "}
        <strong>DATABASE_URL</strong> (from your Postgres service).
      </p>
      <p className="mb-6 text-center text-xs text-zinc-500">
        Check the Deploy logs in Railway for the full error. Digest: {error.digest ?? "—"}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-full bg-zinc-900 px-6 py-2 font-medium text-white hover:bg-zinc-800"
      >
        Try again
      </button>
    </div>
  );
}
