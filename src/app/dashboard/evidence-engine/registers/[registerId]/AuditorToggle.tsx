"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function AuditorToggle({
  registerKey,
  auditorOnly,
}: {
  registerKey: string;
  auditorOnly: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggle = () => {
    const next = new URLSearchParams(searchParams?.toString() ?? "");
    if (auditorOnly) {
      next.delete("auditor");
    } else {
      next.set("auditor", "1");
    }
    const q = next.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  };

  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--color-gray-700)]">
      <input
        type="checkbox"
        checked={auditorOnly}
        onChange={toggle}
        className="rounded border-[var(--color-border)]"
      />
      <span>Auditor view (finalized only)</span>
    </label>
  );
}
