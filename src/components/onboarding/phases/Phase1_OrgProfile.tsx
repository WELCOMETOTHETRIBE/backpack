"use client";

import { useState } from "react";
import { getPhase1Defaults } from "../vault-defaults";

interface Seed {
  orgName: string;
  cageCode: string;  // collected in Phase 0; read-only display here if present
  ownerName: string;
  ownerEmail: string;
}

interface Phase1Props {
  initialData?: Record<string, unknown>;
  seed?: Seed;
  onComplete: (data: Record<string, unknown>) => void;
}

/**
 * Resolve each field's starting value with this precedence:
 *   1. Customer's previously-saved answer (initialData) — always wins
 *   2. Signed-in org/user seed from the server (org name, owner name/email, CAGE)
 *   3. MacTech Vault smart default (system name/description, MacTech ISSO checkbox)
 *   4. Empty string (for fields we have no reasonable default for)
 */
function resolve(initial: unknown, seed: string | undefined, def: string | undefined): string {
  if (typeof initial === "string" && initial.length > 0) return initial;
  if (seed && seed.length > 0) return seed;
  return def ?? "";
}

export function Phase1_OrgProfile({ initialData, seed, onComplete }: Phase1Props) {
  const defaults = getPhase1Defaults(seed?.orgName);

  const [orgName, setOrgName] = useState(resolve(initialData?.orgName, seed?.orgName, ""));
  const [address, setAddress] = useState((initialData?.address as string) ?? "");
  // CAGE was already captured in Phase 0 (Trust Codex signatory block) and
  // persisted to organizations.cage_code — no need to ask again here.
  const [systemName, setSystemName] = useState(
    resolve(initialData?.systemName, undefined, defaults.systemName)
  );
  const [systemDescription, setSystemDescription] = useState(
    resolve(initialData?.systemDescription, undefined, defaults.systemDescription)
  );
  const [ownerName, setOwnerName] = useState(resolve(initialData?.ownerName, seed?.ownerName, ""));
  const [ownerTitle, setOwnerTitle] = useState((initialData?.ownerTitle as string) ?? "");
  const [ownerEmail, setOwnerEmail] = useState(resolve(initialData?.ownerEmail, seed?.ownerEmail, ""));
  const [issoName, setIssoName] = useState((initialData?.issoName as string) ?? "");
  const [issoEmail, setIssoEmail] = useState((initialData?.issoEmail as string) ?? "");
  const [mactechIsso, setMactechIsso] = useState(
    typeof initialData?.mactechIsso === "boolean"
      ? (initialData.mactechIsso as boolean)
      : defaults.mactechIsso
  );
  const [aoName, setAoName] = useState((initialData?.aoName as string) ?? "");
  const [aoOrg, setAoOrg] = useState((initialData?.aoOrg as string) ?? "");

  const canSubmit = orgName.trim() && systemName.trim() && ownerName.trim() && ownerEmail.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onComplete({
      orgName: orgName.trim(),
      address: address.trim(),
      systemName: systemName.trim(),
      systemDescription: systemDescription.trim(),
      systemOwner: {
        name: ownerName.trim(),
        title: ownerTitle.trim(),
        email: ownerEmail.trim(),
      },
      isso: mactechIsso
        ? { mactech: true, name: "MacTech Solutions LLC", email: "isso@mactech.com" }
        : { name: issoName.trim(), email: issoEmail.trim() },
      authorizingOfficial: {
        name: aoName.trim(),
        organization: aoOrg.trim(),
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Org identity */}
      <section className="border border-[#1E2D3D] p-4 flex flex-col gap-4">
        <h3 className="text-xs font-mono font-bold text-[#0EA5E9] uppercase tracking-widest">
          Organization Identity
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
              Organization Legal Name *
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
              Primary Business Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, City, ST 12345"
              className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
            />
          </div>
          {seed?.cageCode && (
            <div className="sm:col-span-2">
              <label className="block text-xs font-mono text-[#6B7280] uppercase tracking-wider mb-1">
                CAGE Code (from Trust Codex acceptance)
              </label>
              <div className="px-3 py-2 text-sm font-mono text-[#94A3B8] bg-[#0A0D12] border border-[#1E2D3D]/50">
                {seed.cageCode}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* System profile */}
      <section className="border border-[#1E2D3D] p-4 flex flex-col gap-4">
        <h3 className="text-xs font-mono font-bold text-[#0EA5E9] uppercase tracking-widest">
          System Profile
        </h3>
        <div>
          <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
            System Name *
          </label>
          <input
            type="text"
            value={systemName}
            onChange={(e) => setSystemName(e.target.value)}
            required
            placeholder={orgName ? `${orgName} CUI Vault` : "CUI Vault"}
            className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
          />
        </div>
        <div>
          <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
            System Description (2–4 sentences)
          </label>
          <textarea
            value={systemDescription}
            onChange={(e) => setSystemDescription(e.target.value)}
            rows={4}
            placeholder="Describe the system's purpose, what CUI it processes, and the users who access it."
            className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9] resize-none"
          />
        </div>
      </section>

      {/* Roles */}
      <section className="border border-[#1E2D3D] p-4 flex flex-col gap-4">
        <h3 className="text-xs font-mono font-bold text-[#0EA5E9] uppercase tracking-widest">
          Key Roles
        </h3>

        <div>
          <p className="text-xs text-[#6B7280] font-mono mb-2 uppercase tracking-wider">
            System Owner
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-mono text-[#94A3B8] mb-1">Name *</label>
              <input
                type="text"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
                className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#94A3B8] mb-1">Title</label>
              <input
                type="text"
                value={ownerTitle}
                onChange={(e) => setOwnerTitle(e.target.value)}
                className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#94A3B8] mb-1">Email *</label>
              <input
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                required
                className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
              />
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs text-[#6B7280] font-mono mb-2 uppercase tracking-wider">
            Information System Security Officer (ISSO)
          </p>
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={mactechIsso}
              onChange={(e) => setMactechIsso(e.target.checked)}
              className="w-4 h-4 accent-[#0EA5E9]"
            />
            <span className="text-sm text-[#94A3B8] font-mono">
              MacTech Solutions LLC serves as ISSO under the MSP agreement
            </span>
          </label>
          {!mactechIsso && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-mono text-[#94A3B8] mb-1">ISSO Name</label>
                <input
                  type="text"
                  value={issoName}
                  onChange={(e) => setIssoName(e.target.value)}
                  className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-[#94A3B8] mb-1">ISSO Email</label>
                <input
                  type="email"
                  value={issoEmail}
                  onChange={(e) => setIssoEmail(e.target.value)}
                  className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs text-[#6B7280] font-mono mb-2 uppercase tracking-wider">
            Authorizing Official (optional for pilot)
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-mono text-[#94A3B8] mb-1">AO Name</label>
              <input
                type="text"
                value={aoName}
                onChange={(e) => setAoName(e.target.value)}
                className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[#94A3B8] mb-1">AO Organization</label>
              <input
                type="text"
                value={aoOrg}
                onChange={(e) => setAoOrg(e.target.value)}
                className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
              />
            </div>
          </div>
        </div>
      </section>

      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
          canSubmit
            ? "bg-[#0EA5E9] text-black hover:bg-[#38BDF8] cursor-pointer"
            : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
        }`}
      >
        SAVE PROFILE &amp; CONTINUE
      </button>
    </form>
  );
}
