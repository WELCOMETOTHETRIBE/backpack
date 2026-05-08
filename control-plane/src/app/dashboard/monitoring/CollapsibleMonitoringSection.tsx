"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Section wrapper that mirrors the monitoring page's existing
 * "uppercase header row + card body" pattern, but lets the body
 * collapse. Built as a client component so the rest of the page
 * stays a server component.
 */
export function CollapsibleMonitoringSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--color-gray-500)]">
            {title}
          </h2>
          {badge}
        </span>
        <span
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[var(--color-gray-500)] transition-transform duration-200 hover:bg-[var(--color-gray-100)]"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">{children}</div>
      </div>
    </section>
  );
}
