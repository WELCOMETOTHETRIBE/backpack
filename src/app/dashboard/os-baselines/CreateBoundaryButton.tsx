"use client";

import { useState } from "react";
import { PlusCircle } from "lucide-react";
import { CreateSystemBoundaryModal } from "./CreateSystemBoundaryModal";

export function CreateBoundaryButton({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => !disabled && setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-blue-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:opacity-60"
      >
        <PlusCircle className="h-4 w-4" />
        Create boundary
      </button>
      <CreateSystemBoundaryModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
