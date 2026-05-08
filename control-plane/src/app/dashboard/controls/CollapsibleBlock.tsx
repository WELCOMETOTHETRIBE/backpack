"use client";

import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";

type IconComponent = React.ComponentType<{ className?: string }>;

export function CollapsibleBlock({
  label,
  children,
  defaultOpen = false,
  icon: Icon = FileText,
  className = "",
  contentClassName = "",
}: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  icon?: IconComponent;
  className?: string;
  contentClassName?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={`rounded-xl border border-[var(--color-border)]/60 bg-white/90 shadow-sm shadow-black/5 overflow-hidden transition-shadow hover:shadow-md focus-within:ring-2 focus-within:ring-[var(--color-blue-accent)]/20 focus-within:ring-offset-1 ${className}`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium text-[var(--color-gray-800)] hover:bg-[var(--color-gray-50)]/80 focus:outline-none focus-visible:ring-0 transition-colors duration-150"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-gray-100)] text-[var(--color-gray-500)]">
            <Icon className="h-4 w-4" />
          </span>
          {label}
        </span>
        <span
          className="shrink-0 rounded p-1 text-[var(--color-gray-400)] transition-transform duration-200 ease-out"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={`border-t border-[var(--color-border)]/50 bg-[var(--color-gray-50)]/30 px-4 pb-4 pt-3 ${contentClassName}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
