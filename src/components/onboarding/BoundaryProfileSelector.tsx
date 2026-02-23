"use client";

import { Check } from "lucide-react";
import { BOUNDARY_TECHNOLOGY_OPTIONS } from "@/lib/compliance/technical_evidence_requirements";

export function BoundaryProfileSelector({
  selectedTechnologies,
  onChange,
}: {
  selectedTechnologies: string[];
  onChange: (selected: string[]) => void;
}) {
  function toggle(value: string) {
    const set = new Set(selectedTechnologies);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange([...set]);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-zinc-600">
        Select the technologies in your CUI environment. This determines which evidence requirements you will see in the compliance wizard.
      </p>
      {BOUNDARY_TECHNOLOGY_OPTIONS.map((group) => (
        <div key={group.category}>
          <h3 className="mb-3 text-sm font-semibold text-zinc-800">{group.category}</h3>
          <ul className="space-y-2">
            {group.options.map((opt) => (
              <li key={opt.value}>
                <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 hover:border-zinc-300 hover:bg-zinc-50/50">
                  <input
                    type="checkbox"
                    checked={selectedTechnologies.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="h-4 w-4 rounded border-zinc-300 text-[#3B82F6] focus:ring-[#3B82F6]"
                  />
                  <span className="flex-1 text-zinc-900">{opt.label}</span>
                  {selectedTechnologies.includes(opt.value) && (
                    <Check className="h-4 w-4 text-[#3B82F6]" />
                  )}
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
