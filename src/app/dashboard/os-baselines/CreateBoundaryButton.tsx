"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { CreateSystemBoundaryModal } from "./CreateSystemBoundaryModal";

export function CreateBoundaryButton({
  disabled,
  label,
  preselect,
}: {
  disabled?: boolean;
  label?: string;
  preselect?: "mactech" | "azure" | "on_prem" | "other";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60"
      >
        {!label && <PlusCircle className="h-4 w-4" />}
        {label ?? "Create boundary"}
      </button>
      <CreateSystemBoundaryModal open={open} onClose={() => setOpen(false)} preselect={preselect} />
    </>
  );
}
