"use client";

import { useState } from "react";

interface Phase2Props {
  initialData?: Record<string, unknown>;
  onComplete: (data: Record<string, unknown>) => void;
}

// CUI Registry categories relevant to DoD contractors
// Source: NARA CUI Registry (cui.gov) — DoD-relevant categories
const CUI_CATEGORIES = [
  {
    group: "Defense & Military",
    items: [
      { id: "CTI", label: "Controlled Technical Information (CTI)", description: "Technical data with military or space application" },
      { id: "UCNI", label: "Unclassified Controlled Nuclear Information (UCNI)", description: "Nuclear security information" },
      { id: "NAVSEA", label: "Naval Nuclear Propulsion Information (NNPI)", description: "Naval nuclear propulsion data" },
      { id: "OPS_SEC", label: "Operations Security (OPSEC)", description: "Critical information identified in OPSEC plans" },
    ],
  },
  {
    group: "Export Control",
    items: [
      { id: "EAR", label: "Export Administration Regulations (EAR)", description: "Dual-use goods and technology" },
      { id: "ITAR", label: "International Traffic in Arms Regulations (ITAR)", description: "Defense articles and services" },
    ],
  },
  {
    group: "Acquisition & Contract",
    items: [
      { id: "PROCUREMENT", label: "Procurement and Acquisition", description: "Contract and procurement sensitive information" },
      { id: "PROPRIETARY", label: "Proprietary Business Information", description: "Contractor business confidential data" },
      { id: "SOURCE_SEL", label: "Source Selection", description: "Pre-decisional acquisition source selection data" },
    ],
  },
  {
    group: "Research & Engineering",
    items: [
      { id: "RDT_E", label: "Research, Development, Test & Evaluation (RDT&E)", description: "Federally funded R&D program data" },
      { id: "SBU_TECH", label: "Sensitive But Unclassified Technical Data", description: "Technical drawings, specifications, tolerances" },
      { id: "PATENT", label: "Patents (Pending/Sensitive)", description: "Patent applications and IP sensitive data" },
    ],
  },
  {
    group: "Privacy & Personnel",
    items: [
      { id: "PII", label: "Personally Identifiable Information (PII)", description: "Name, SSN, DOB, address, etc." },
      { id: "HIPAA", label: "Health Information (HIPAA)", description: "Protected health information" },
      { id: "HR", label: "Human Resources", description: "Employee background, performance, compensation data" },
    ],
  },
  {
    group: "Legal & Investigations",
    items: [
      { id: "LEGAL", label: "Legal", description: "Attorney-client privileged and legal proceedings data" },
      { id: "INVESTIGATIONS", label: "Investigations", description: "Law enforcement sensitive investigation data" },
    ],
  },
];

export function Phase2_CuiCategories({ initialData, onComplete }: Phase2Props) {
  const [selected, setSelected] = useState<string[]>(
    (initialData?.categories as string[]) ?? []
  );
  const [narrative, setNarrative] = useState(
    (initialData?.narrative as string) ?? ""
  );

  function toggleCategory(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  const canSubmit = selected.length > 0 && narrative.trim().length >= 50;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onComplete({
      categories: selected,
      narrative: narrative.trim(),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="border-l-4 border-[#0EA5E9] pl-4">
        <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
          CUI Category Declaration
        </h3>
        <p className="text-xs text-[#94A3B8] mt-1">
          Select all CUI categories that will be processed in this Vault. At minimum,
          Controlled Technical Information (CTI) is required for DoD CUI boundaries.
        </p>
      </div>

      {/* Category multi-select */}
      <div className="flex flex-col gap-4">
        {CUI_CATEGORIES.map((group) => (
          <div key={group.group}>
            <h4 className="text-xs font-mono text-[#6B7280] uppercase tracking-widest mb-2">
              {group.group}
            </h4>
            <div className="flex flex-col gap-1">
              {group.items.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 p-2 border cursor-pointer transition-colors ${
                    selected.includes(item.id)
                      ? "border-[#0EA5E9] bg-[#0EA5E9]/5"
                      : "border-[#1E2D3D] hover:border-[#374151]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(item.id)}
                    onChange={() => toggleCategory(item.id)}
                    className="mt-0.5 w-4 h-4 accent-[#0EA5E9] cursor-pointer flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm text-white font-mono">{item.label}</span>
                    <p className="text-xs text-[#6B7280] mt-0.5">{item.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Selected summary */}
      {selected.length > 0 && (
        <div className="border border-[#10B981]/30 bg-[#10B981]/5 p-3">
          <p className="text-xs font-mono text-[#10B981] uppercase tracking-wider mb-1">
            {selected.length} categor{selected.length === 1 ? "y" : "ies"} selected
          </p>
          <p className="text-xs text-[#94A3B8]">{selected.join(", ")}</p>
        </div>
      )}

      {/* Narrative */}
      <div>
        <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
          CUI Description Narrative *
          <span className="text-[#6B7280] ml-2 normal-case tracking-normal">
            (2–4 sentences describing the CUI you process in this Vault)
          </span>
        </label>
        <textarea
          value={narrative}
          onChange={(e) => setNarrative(e.target.value)}
          rows={5}
          required
          minLength={50}
          placeholder="Describe the specific CUI your organization processes in this Vault. Include the nature of the data, its origin (e.g., prime contract, government GFI), and the approximate number of users with access."
          className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9] resize-none"
        />
        <p className="text-xs text-[#6B7280] mt-1 font-mono">
          {narrative.length} characters — minimum 50 required
        </p>
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
          canSubmit
            ? "bg-[#0EA5E9] text-black hover:bg-[#38BDF8] cursor-pointer"
            : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
        }`}
      >
        CONFIRM CUI CATEGORIES &amp; CONTINUE
      </button>
    </form>
  );
}
