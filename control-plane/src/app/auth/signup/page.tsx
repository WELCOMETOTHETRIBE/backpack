"use client";

import { useState } from "react";
import Link from "next/link";

const inputClass =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[var(--color-gray-900)] transition-colors focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--color-blue-accent)]/20 disabled:opacity-60";
const labelClass = "mb-1 block text-sm font-medium text-[var(--color-gray-700)]";

export default function SignUpPage() {
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: organizationName.trim(),
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Sign up failed");
        return;
      }
      window.location.href = "/auth/signin?message=account_created";
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-muted)] px-4 py-8">
      <div className="w-full max-w-[400px] rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-8 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">
            Create an account
          </h1>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Create your company profile and admin account.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="signup-org" className={labelClass}>
              Organization name
            </label>
            <input
              id="signup-org"
              type="text"
              autoComplete="organization"
              value={organizationName}
              onChange={(e) => setOrganizationName(e.target.value)}
              className={inputClass}
              required
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="signup-email" className={labelClass}>
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
              required
              disabled={submitting}
            />
          </div>
          <div>
            <label htmlFor="signup-password" className={labelClass}>
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              required
              minLength={8}
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-[var(--color-gray-500)]">At least 8 characters</p>
          </div>
          <div>
            <label htmlFor="signup-name" className={labelClass}>
              Your name <span className="text-[var(--color-gray-500)]">(optional)</span>
            </label>
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--color-status-red)]" role="alert">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-[var(--radius-md)] bg-[var(--color-primary)] px-4 py-2.5 font-medium text-white transition-colors hover:bg-[var(--color-primary-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--color-gray-600)]">
          Already have an account?{" "}
          <Link
            href="/auth/signin"
            className="font-medium text-[var(--color-blue-accent)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-blue-accent)] focus-visible:ring-offset-2 rounded"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
