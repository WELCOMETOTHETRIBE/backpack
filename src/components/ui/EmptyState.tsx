"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";

function isComponent(value: unknown): value is React.ComponentType<{ className?: string }> {
  if (typeof value === "function") return true;
  if (value && typeof value === "object" && "$$typeof" in value && !React.isValidElement(value))
    return true;
  return false;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  callToAction,
}: {
  icon: React.ReactNode | LucideIcon;
  title: string;
  description: string;
  callToAction?: React.ReactNode;
}) {
  const iconEl = isComponent(Icon) ? (
    <Icon className="mx-auto h-12 w-12 text-slate-400" aria-hidden />
  ) : (
    <span className="flex justify-center" aria-hidden>{Icon}</span>
  );

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50/50 px-8 py-12 text-center">
      <div className="mb-4">{iconEl}</div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>
      {callToAction && <div className="mt-6">{callToAction}</div>}
    </div>
  );
}
