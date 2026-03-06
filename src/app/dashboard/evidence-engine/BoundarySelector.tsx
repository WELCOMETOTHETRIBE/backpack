"use client";

import { useCallback, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

const ACTIVE_BOUNDARY_KEY = "active_boundary";

export type BoundaryOption = {
  id: string;
  name: string;
  cloudProvider: string | null;
  azureEnvironment: string | null;
};

type Props = {
  boundaries: BoundaryOption[];
  currentBoundaryId: string | null;
};

export function BoundarySelector({ boundaries, currentBoundaryId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const syncUrlFromStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    const fromUrl = searchParams.get("boundary");
    if (fromUrl) return;
    const stored = localStorage.getItem(ACTIVE_BOUNDARY_KEY);
    if (stored && boundaries.some((b) => b.id === stored)) {
      const next = new URLSearchParams(searchParams.toString());
      next.set("boundary", stored);
      router.replace(`${pathname}?${next.toString()}`);
    }
  }, [pathname, searchParams, router, boundaries]);

  useEffect(() => {
    syncUrlFromStorage();
  }, [syncUrlFromStorage]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    if (typeof window !== "undefined") localStorage.setItem(ACTIVE_BOUNDARY_KEY, id);
    const next = new URLSearchParams(searchParams.toString());
    next.set("boundary", id);
    router.push(`${pathname}?${next.toString()}`);
  };

  if (boundaries.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="evidence-engine-boundary" className="text-sm font-medium text-[var(--color-gray-700)]">
        Boundary
      </label>
      <select
        id="evidence-engine-boundary"
        value={currentBoundaryId ?? ""}
        onChange={handleChange}
        className="rounded-md border border-[var(--color-border)] bg-white px-3 py-1.5 text-sm text-[var(--color-gray-900)] shadow-sm focus:border-[var(--color-blue-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-blue-accent)]"
      >
        <option value="">Select a boundary</option>
        {boundaries.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </div>
  );
}
