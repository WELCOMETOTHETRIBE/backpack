"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { getScopeComponentLabels } from "../../scope-labels";
import { EditScopeModal } from "./EditScopeModal";

export function InScopeSection({
  boundaryId,
  initialScopeComponents,
}: {
  boundaryId: string;
  initialScopeComponents: string[] | null;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const scopeLabels = getScopeComponentLabels(initialScopeComponents);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-[var(--color-gray-800)]">
          In-scope components
        </h2>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
        >
          <Pencil className="h-4 w-4" />
          Edit scope
        </button>
      </div>
      {scopeLabels.length > 0 ? (
        <p className="mt-2 text-sm text-[var(--color-gray-600)]">
          {scopeLabels.join(", ")}
        </p>
      ) : (
        <p className="mt-2 text-sm text-[var(--color-gray-500)]">
          No components selected. Edit scope to add Windows Server VM(s), Azure Cloud, network devices, etc.
        </p>
      )}
      <EditScopeModal
        boundaryId={boundaryId}
        initialScopeComponents={initialScopeComponents}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
