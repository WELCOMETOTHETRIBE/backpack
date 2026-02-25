"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import AddPoamModal from "./AddPoamModal";

export function AddPoamButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <Plus className="h-4 w-4" />
        Add POA&M with tasks
      </button>
      <AddPoamModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
