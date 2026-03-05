"use client";

import Link from "next/link";

export function CreateEntryLink({ registerKey }: { registerKey: string }) {
  return (
    <Link
      href={`/dashboard/evidence-engine/registers/${encodeURIComponent(registerKey)}/new`}
      className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--color-primary)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
    >
      Create entry
    </Link>
  );
}
