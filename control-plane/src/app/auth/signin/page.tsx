"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function SignInForm() {
  const searchParams = useSearchParams();
  const message = searchParams.get("message");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid email or password");
        return;
      }
      window.location.href = "/dashboard";
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-[400px] rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">
          CMMC Control Plane
        </h1>
        <p className="mt-1 text-sm text-[var(--color-gray-600)]">
          Sign in to your organization to manage controls and evidence.
        </p>
      </div>

      {message === "account_created" && (
        <p
          className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-status-green)]/10 p-3 text-sm text-[#059669]"
          role="status"
        >
          Account created. Sign in below.
        </p>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="signin-email" className="mb-1 block text-sm font-medium text-[var(--color-gray-700)]">
            Email
          </label>
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-gray-900)] transition-colors focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20"
            required
            disabled={loading}
          />
        </div>
        <div>
          <label htmlFor="signin-password" className="mb-1 block text-sm font-medium text-[var(--color-gray-700)]">
            Password
          </label>
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-gray-900)] transition-colors focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20"
            required
            disabled={loading}
          />
        </div>
        {error && (
          <p className="text-sm text-[var(--color-status-red)]" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-[var(--color-gray-600)]">
        No account?{" "}
        <Link
          href="/auth/signup"
          className="font-medium text-[var(--color-blue-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 rounded"
        >
          Create account
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-muted)] px-4">
      <Suspense
        fallback={
          <div
            className="h-80 w-full max-w-[400px] rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] animate-pulse"
            aria-hidden
          />
        }
      >
        <SignInForm />
      </Suspense>
    </div>
  );
}
