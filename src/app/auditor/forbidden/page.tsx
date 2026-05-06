import Link from "next/link";

export default function AuditorForbiddenPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-xl font-semibold text-[var(--color-navy-primary)]">
        Auditor view — access denied
      </h1>
      <p className="text-sm text-[var(--color-gray-700)]">
        The /auditor/* route family is restricted to users with the
        Assessor, Admin, or Compliance role. Your account does not hold
        any of those roles.
      </p>
      <p className="text-sm text-[var(--color-gray-700)]">
        If you are the C3PAO assessor and were granted access for this
        engagement, ask the customer Admin to assign your account the
        Assessor role under{" "}
        <span className="font-mono">/dashboard/settings</span> or
        equivalent role-management UI.
      </p>
      <Link
        href="/dashboard"
        className="inline-block text-sm text-[var(--color-blue-accent)] hover:underline"
      >
        ← back to dashboard
      </Link>
    </div>
  );
}
