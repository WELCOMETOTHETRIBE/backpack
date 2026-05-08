"use client";

import { useState, useRef, useEffect } from "react";

interface Phase0Props {
  onComplete: (data: Record<string, unknown>) => void;
}

// Trust Codex full text — sourced from MacTech CUI Vault MSP agreement baseline.
// Customers must scroll to the end before the Accept button becomes enabled.
const TRUST_CODEX_TEXT = `
MACTECH CUI VAULT — TRUST CODEX
Version 1.0 | Effective Date: Upon Acceptance

AGREEMENT BETWEEN MACTECH SOLUTIONS LLC AND SUBSCRIBER ORGANIZATION

This Trust Codex ("Codex") governs the use of the MacTech CUI Vault — a managed
cloud enclave service for processing, storing, and transmitting Controlled Unclassified
Information (CUI) as defined in 32 CFR Part 2002 and the CUI Registry maintained by the
National Archives and Records Administration (NARA).

──────────────────────────────────────────────────────────────────────────────
ARTICLE 1 — SCOPE OF SERVICE
──────────────────────────────────────────────────────────────────────────────

1.1 MacTech Solutions LLC ("MacTech") provides the MacTech CUI Vault as a managed
    enclave hosted on Microsoft Azure Government. The Vault is designed and maintained
    to satisfy the requirements of NIST SP 800-171 Rev 2 (110 security controls) and
    CMMC Level 2.

1.2 The Subscriber Organization ("Subscriber") licenses access to the Vault for the
    exclusive purpose of processing CUI related to U.S. Department of Defense (DoD)
    contracts, subcontracts, and associated flowdown obligations.

1.3 MacTech is not a C3PAO. This Codex governs the managed service relationship.
    Subscriber remains solely responsible for scheduling and funding third-party
    CMMC Level 2 assessments required by DFARS 252.204-7021.

──────────────────────────────────────────────────────────────────────────────
ARTICLE 2 — SECURITY RESPONSIBILITIES
──────────────────────────────────────────────────────────────────────────────

2.1 MACTECH RESPONSIBILITIES. MacTech shall:
    (a) Maintain the Windows Server 2025 Datacenter VM baseline in compliance with
        applicable DISA STIGs and the hardening scripts documented in the Vault
        Collector Integration Package;
    (b) Deploy, configure, and maintain the security tooling stack (Microsoft Defender
        for Endpoint, Microsoft Sentinel, Azure Monitor, Log Analytics);
    (c) Provide and maintain the 28 governance policies and SOPs in the MacTech
        Trust Codex Policy Library (MAC-POL-XXX and MAC-SOP-XXX series);
    (d) Conduct monthly evidence collection runs using the Collect-CUI-Evidence-v2
        PowerShell collector and store results in the Vault Evidence Register;
    (e) Provide the Vault Compliance Portal including the evidence engine, SPRS
        calculator, SSP generator, and POA&M tracker;
    (f) Notify Subscriber within 72 hours of any security incident affecting CUI
        confidentiality, integrity, or availability.

2.2 SUBSCRIBER RESPONSIBILITIES. Subscriber shall:
    (a) Complete and maintain all 110 control adjudications in the Vault Compliance
        Portal, including attestation of all Subscriber-owned controls;
    (b) Deliver security awareness training to all personnel with Vault access within
        30 days of onboarding and annually thereafter;
    (c) Screen personnel prior to granting Vault access and revoke access within 24
        hours of personnel separation;
    (d) Operate an active incident response program, including tabletop exercises at
        least annually;
    (e) Submit required DoD SPRS self-assessments using scores computed in this Portal
        through the Supplier Performance Risk System (sprs.app.mil);
    (f) Notify MacTech within 24 hours of any suspected CUI breach or incident;
    (g) Maintain records and supporting documentation sufficient for a C3PAO assessment.

──────────────────────────────────────────────────────────────────────────────
ARTICLE 3 — EVIDENCE AND AUDIT
──────────────────────────────────────────────────────────────────────────────

3.1 Evidence collected by the Vault collector is stored with SHA-256 hashes.
    Subscriber acknowledges that evidence metadata may be reviewed by MacTech for
    quality assurance purposes.

3.2 Subscriber grants MacTech the right to access Vault telemetry, logs, and
    compliance portal data for the purpose of providing the managed service,
    diagnosing incidents, and supporting Subscriber's assessment preparation.

3.3 MacTech will retain compliance portal records for no less than three (3) years
    following termination of the service agreement.

──────────────────────────────────────────────────────────────────────────────
ARTICLE 4 — SPRS SCORE AND FALSE CLAIMS ACT
──────────────────────────────────────────────────────────────────────────────

4.1 Subscriber acknowledges that SPRS scores submitted to the U.S. Government must
    accurately reflect the Subscriber's security posture at the time of submission.

4.2 Intentional misrepresentation of SPRS scores or control implementation status
    may constitute a violation of 18 U.S.C. § 1001 (false statements) and the
    False Claims Act (31 U.S.C. §§ 3729–3733).

4.3 MacTech does not warrant that Subscriber's SPRS score will satisfy any particular
    contracting threshold. Subscriber is responsible for evaluating and disclosing
    its score to prime contractors and the Government as required by DFARS.

──────────────────────────────────────────────────────────────────────────────
ARTICLE 5 — CONFIDENTIALITY
──────────────────────────────────────────────────────────────────────────────

5.1 MacTech will treat all CUI processed through the Vault as confidential and will
    not disclose CUI to any third party except as required by law, court order, or
    U.S. Government directive.

5.2 Subscriber will treat MacTech's security procedures, hardening baselines, and
    policy library as MacTech Confidential Information and will not disclose them to
    competitors or parties outside the Subscriber's direct CMMC compliance effort.

──────────────────────────────────────────────────────────────────────────────
ARTICLE 6 — LIMITATION OF LIABILITY
──────────────────────────────────────────────────────────────────────────────

6.1 MacTech's aggregate liability under this Codex shall not exceed the fees paid
    by Subscriber in the twelve (12) months preceding the claim.

6.2 MacTech is not liable for Subscriber's failure to satisfy CMMC assessment
    requirements, loss of contract awards, or regulatory penalties resulting from
    Subscriber's implementation gaps.

──────────────────────────────────────────────────────────────────────────────
ARTICLE 7 — ACCEPTANCE AND LEGAL AUTHORITY
──────────────────────────────────────────────────────────────────────────────

7.1 By accepting this Codex, the signatory represents and warrants that:
    (a) They are authorized to bind the Subscriber Organization to this agreement;
    (b) The Subscriber Organization has authorized participation in the MacTech
        CUI Vault program;
    (c) All information provided during onboarding is accurate and complete.

7.2 This Codex constitutes a binding agreement between MacTech Solutions LLC and
    the Subscriber Organization. It supplements but does not replace any separately
    executed Master Service Agreement (MSA) or Statement of Work (SOW).

MacTech Solutions LLC
CUI Vault Program
Trust Codex Version 1.0

[END OF DOCUMENT]
`;

export function Phase0_TrustCodex({ onComplete }: Phase0Props) {
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
  const [signatoryName, setSignatoryName] = useState("");
  const [signatoryTitle, setSignatoryTitle] = useState("");
  const [cageCode, setCageCode] = useState("");
  const [primeContractNumber, setPrimeContractNumber] = useState("");
  const [attested, setAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    // Allow 4px tolerance for fractional pixel rendering
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      setHasScrolledToEnd(true);
    }
  }

  const canSubmit =
    hasScrolledToEnd &&
    attested &&
    signatoryName.trim().length > 0 &&
    signatoryTitle.trim().length > 0 &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/onboarding/accept-trust-codex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signatoryName: signatoryName.trim(),
          signatoryTitle: signatoryTitle.trim(),
          cageCode: cageCode.trim() || undefined,
          primeContractNumber: primeContractNumber.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Acceptance failed");
      }

      const data = await res.json();
      onComplete({
        acceptedAt: data.acceptedAt,
        signatoryName: signatoryName.trim(),
        signatoryTitle: signatoryTitle.trim(),
        cageCode: cageCode.trim() || null,
        primeContractNumber: primeContractNumber.trim() || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="border-l-4 border-[#0EA5E9] pl-4">
        <h2 className="text-lg font-bold text-white tracking-wide uppercase font-mono">
          MACTECH CUI VAULT — TRUST CODEX
        </h2>
        <p className="text-sm text-[#94A3B8] mt-1">
          Version 1.0 &mdash; Read the full document and scroll to the end before accepting.
        </p>
      </div>

      {/* Scrollable document */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-[400px] overflow-y-auto bg-[#0D1117] border border-[#1E2D3D] p-4 font-mono text-xs text-[#94A3B8] leading-relaxed whitespace-pre-wrap"
        aria-label="Trust Codex document"
      >
        {TRUST_CODEX_TEXT}
      </div>

      {/* Scroll gate indicator */}
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-none ${
            hasScrolledToEnd ? "bg-[#10B981]" : "bg-[#374151]"
          }`}
        />
        <span
          className={`text-xs font-mono ${
            hasScrolledToEnd ? "text-[#10B981]" : "text-[#6B7280]"
          }`}
        >
          {hasScrolledToEnd
            ? "DOCUMENT READ — You may proceed to acceptance."
            : "Scroll to the end of the document to enable acceptance."}
        </span>
      </div>

      {/* Acceptance form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
              Signatory Full Name *
            </label>
            <input
              type="text"
              value={signatoryName}
              onChange={(e) => setSignatoryName(e.target.value)}
              required
              maxLength={255}
              placeholder="First Last"
              className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
              Title / Role *
            </label>
            <input
              type="text"
              value={signatoryTitle}
              onChange={(e) => setSignatoryTitle(e.target.value)}
              required
              maxLength={255}
              placeholder="e.g. Chief Information Security Officer"
              className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
              CAGE Code (optional)
            </label>
            <input
              type="text"
              value={cageCode}
              onChange={(e) => setCageCode(e.target.value.toUpperCase())}
              maxLength={10}
              placeholder="5-character code from SAM.gov"
              className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
            />
          </div>
          <div>
            <label className="block text-xs font-mono text-[#94A3B8] uppercase tracking-wider mb-1">
              Prime Contract Number (optional)
            </label>
            <input
              type="text"
              value={primeContractNumber}
              onChange={(e) => setPrimeContractNumber(e.target.value)}
              maxLength={100}
              placeholder="e.g. W91QVN-23-C-0042"
              className="w-full bg-[#0D1117] border border-[#1E2D3D] text-white px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#0EA5E9]"
            />
          </div>
        </div>

        {/* Attestation checkbox */}
        <label className="flex items-start gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={attested}
            onChange={(e) => setAttested(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-[#0EA5E9] cursor-pointer"
          />
          <span className="text-sm text-[#94A3B8] leading-relaxed">
            I am authorized to bind{" "}
            <strong className="text-white">my organization</strong> to this Trust
            Codex, I have read the full document, and I accept these terms on behalf
            of my organization.
          </span>
        </label>

        {error && (
          <div className="border border-[#EF4444] bg-[#7F1D1D]/20 text-[#EF4444] text-sm font-mono px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-3 text-sm font-mono font-bold uppercase tracking-widest transition-colors ${
            canSubmit
              ? "bg-[#0EA5E9] text-black hover:bg-[#38BDF8] cursor-pointer"
              : "bg-[#1E2D3D] text-[#4B5563] cursor-not-allowed"
          }`}
        >
          {submitting ? "RECORDING ACCEPTANCE..." : "ACCEPT TRUST CODEX"}
        </button>
      </form>
    </div>
  );
}
