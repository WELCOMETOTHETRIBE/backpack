"use client";

import { useState } from "react";
import { X, Network } from "lucide-react";
import { BoundaryDiagramCreator } from "@/components/adjudication/BoundaryDiagramCreator";

export function BoundaryDiagramModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-gray-700)] shadow-sm hover:bg-[var(--color-gray-50)]"
      >
        <Network className="h-4 w-4" />
        Create boundary diagram (Mermaid)
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="boundary-diagram-modal-title"
        >
          <div
            className="flex h-[95vh] w-full max-w-[min(96vw,88rem)] flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-3 sm:px-6 sm:py-4">
              <h2
                id="boundary-diagram-modal-title"
                className="text-lg font-semibold text-[var(--color-navy-primary)] sm:text-xl"
              >
                CUI boundary diagram (Mermaid)
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-[var(--color-gray-500)] hover:bg-[var(--color-gray-100)] hover:text-[var(--color-gray-700)]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6">
              <BoundaryDiagramCreator />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
