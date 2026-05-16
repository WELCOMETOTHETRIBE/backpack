"use client";

/**
 * Cross-walk chips for SCTM control detail header (Phase 3B of
 * AC.L2-3.1.4).
 *
 * Renders one chip per cross-walk for the current control. Each chip
 * links to the related control's SCTM detail. Hovering a chip surfaces
 * the rationale tooltip — the operational reason an assessor would
 * pivot from this control to the related one.
 *
 * Renders nothing when the current control has no declared cross-walks.
 * Defensive by design: it's better to skip the row entirely than to
 * show a single sad chip.
 */
import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { getCrossWalksFor } from "@/data/cmmc/control-cross-walks";
import { controlDetailHref } from "@/lib/compliance/control-detail-href";

export function ControlCrossWalkChips({ controlId }: { controlId: string }) {
  const crossWalks = getCrossWalksFor(controlId);
  if (crossWalks.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-gray-500)]">
        <ArrowLeftRight className="h-3 w-3" />
        Cross-walks
      </span>
      {crossWalks.map((cw) => (
        <Link
          key={cw.targetControlId}
          href={controlDetailHref(cw.targetControlId)}
          title={cw.rationale}
          className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 transition hover:bg-indigo-100 hover:text-indigo-900"
        >
          <span className="font-mono">{cw.label ?? cw.targetControlId}</span>
        </Link>
      ))}
    </div>
  );
}
