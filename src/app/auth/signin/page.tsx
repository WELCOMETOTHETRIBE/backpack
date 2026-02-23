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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <h1 className="mb-4 text-xl font-semibold text-zinc-900">CMMC Control Plane</h1>
      <p className="mb-4 text-sm text-zinc-500">
        Sign in to your organization.
      </p>
      {message === "account_created" && (
        <p className="mb-4 rounded bg-green-50 p-2 text-sm text-green-800">
          Account created. Sign in below.
        </p>
      )}
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-zinc-700">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
          required
        />
      </div>
      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-zinc-700">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-zinc-900"
          required
        />
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="w-full rounded bg-zinc-900 px-4 py-2 font-medium text-white hover:bg-zinc-800"
      >
        Sign in
      </button>
      <p className="mt-4 text-center text-sm text-zinc-500">
        No account?{" "}
        <Link href="/auth/signup" className="font-medium text-zinc-900 underline">
          Create account
        </Link>
      </p>
    </form>
  );
}

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100">
      <Suspense fallback={<div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-6 shadow-sm animate-pulse" />}>
        <SignInForm />
      </Suspense>
    </div>
  );
}
