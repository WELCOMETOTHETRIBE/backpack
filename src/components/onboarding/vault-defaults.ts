// ────────────────────────────────────────────────────────────────────────────
// Vault Onboarding — Smart Defaults
//
// Pre-fills onboarding fields for the MacTech CUI Vault deployment model:
// a single Windows Server 2025 Datacenter VM running in Microsoft Azure
// Government, managed by MacTech Solutions LLC under a MSP/ISSO agreement.
//
// These values are STARTING POINTS — every field remains editable, so
// customers with unique configurations (different CUI categories, self-
// managed ISSO, etc.) can override.
//
// Design rule: if a default would be wrong for a non-trivial portion of
// customers, leave it empty. We pre-fill only what's architecturally
// identical across every MacTech Vault deployment.
// ────────────────────────────────────────────────────────────────────────────

export interface Phase1Defaults {
  systemName: string;
  systemDescription: string;
  mactechIsso: boolean;
}

export interface Phase2Defaults {
  categories: string[];
  narrative: string;
}

/**
 * Build Phase 1 defaults, templating the organization name into the system
 * name and description.
 */
export function getPhase1Defaults(orgName: string | null | undefined): Phase1Defaults {
  const safeName = (orgName ?? "").trim() || "Customer Organization";
  return {
    systemName: `${safeName} CUI Vault — Azure Government Enclave`,
    systemDescription: [
      `${safeName} operates a single-VM CUI enclave managed under the MacTech Solutions`,
      `Vault program. The boundary consists of one Windows Server 2025 Datacenter virtual`,
      `machine hosted in Microsoft Azure Government (FedRAMP High Authorized, East US Gov`,
      `region), hardened to DISA STIG baselines. Access is restricted to named, trained`,
      `personnel authenticated via Microsoft Entra ID with phishing-resistant MFA. The`,
      `Vault processes Controlled Unclassified Information (CUI) received from DoD prime`,
      `contractors in fulfillment of active contracts requiring NIST SP 800-171 Rev 2`,
      `and CMMC Level 2 compliance.`,
    ].join(" "),
    mactechIsso: true, // MacTech Vault customers typically use the MSP ISSO by default
  };
}

/**
 * Phase 2 defaults — the typical DIB contractor CUI category mix.
 * Customers with different scopes should uncheck what doesn't apply and add any that are missing.
 */
export function getPhase2Defaults(orgName: string | null | undefined): Phase2Defaults {
  const safeName = (orgName ?? "").trim() || "the organization";
  return {
    // Most common CUI types handled by DIB contractors under DFARS 252.204-7012
    categories: ["CTI", "PROCUREMENT", "PROPRIETARY", "SBU_TECH"],
    narrative: [
      `${safeName} processes Controlled Technical Information (CTI) received from DoD`,
      `prime contractors in support of active defense contracts, including technical`,
      `drawings, specifications, tolerances, and test data subject to DFARS 252.204-7012`,
      `safeguarding requirements. The Vault also stores procurement-sensitive contract`,
      `documents, proprietary engineering data, and internal research products tied to`,
      `federally-funded programs. All CUI is handled exclusively within the Azure`,
      `Government boundary described above and accessed by a named, trained workforce.`,
    ].join(" "),
  };
}

/**
 * Phase 6 — default control status for customer-adjudicated controls.
 *
 * In the MacTech Vault deployment model, every shared and customer_managed
 * control has a turnkey implementation: MacTech's Azure Gov enclave,
 * governance document set, and operational runbooks are designed to satisfy
 * NIST SP 800-171 Rev 2 out of the box. Customers attest that they have
 * reviewed and accept the MacTech implementation for their boundary.
 *
 * Set to "implemented" by default — customer overrides on a per-control
 * basis if their environment has a specific gap (e.g., incident response
 * hasn't been exercised yet → mark as "planned" with POA&M date).
 *
 * null = leave customer to adjudicate manually (use when the answer is
 * genuinely customer-specific and varies).
 */
export const PHASE6_DEFAULT_STATUS: Record<string, "implemented" | "planned" | null> = {
  // AC — Access Control (customer has reviewed the MacTech access matrix)
  "3.1.1": "implemented", "3.1.2": "implemented", "3.1.3": "implemented",
  "3.1.4": "implemented", "3.1.5": "implemented", "3.1.6": "implemented",
  "3.1.7": "implemented", "3.1.8": "implemented", "3.1.9": "implemented",
  "3.1.10": "implemented", "3.1.11": "implemented", "3.1.12": "implemented",
  "3.1.13": "implemented", "3.1.14": "implemented", "3.1.15": "implemented",
  "3.1.18": "implemented", "3.1.19": "implemented", "3.1.20": "implemented",
  "3.1.21": "implemented", "3.1.22": "implemented",
  // 3.1.16, 3.1.17 are N/A (wireless — auto-applied by cloud preset in Phase 3)

  // AT — Awareness & Training (customer-managed: requires actual training completion)
  "3.2.1": "implemented", "3.2.2": "implemented", "3.2.3": "implemented",

  // AU — Audit & Accountability (Sentinel + Log Analytics)
  "3.3.1": "implemented", "3.3.2": "implemented", "3.3.3": "implemented",
  "3.3.4": "implemented", "3.3.5": "implemented", "3.3.6": "implemented",
  "3.3.7": "implemented", "3.3.8": "implemented", "3.3.9": "implemented",

  // CM — Configuration Management
  "3.4.1": "implemented", "3.4.2": "implemented", "3.4.3": "implemented",
  "3.4.4": "implemented", "3.4.5": "implemented", "3.4.6": "implemented",
  "3.4.7": "implemented", "3.4.8": "implemented", "3.4.9": "implemented",

  // IA — Identification & Authentication (Entra ID + phishing-resistant MFA)
  "3.5.1": "implemented", "3.5.2": "implemented", "3.5.3": "implemented",
  "3.5.4": "implemented", "3.5.5": "implemented", "3.5.6": "implemented",
  "3.5.7": "implemented", "3.5.8": "implemented", "3.5.9": "implemented",
  "3.5.10": "implemented", "3.5.11": "implemented",

  // IR — Incident Response (MacTech MSSP runbooks)
  "3.6.1": "implemented", "3.6.2": "implemented", "3.6.3": "implemented",

  // MA — Maintenance (MacTech maintenance schedule)
  "3.7.1": "implemented", "3.7.2": "implemented", "3.7.3": "implemented",
  "3.7.4": "implemented", "3.7.5": "implemented", "3.7.6": "implemented",

  // MP — Media Protection (BitLocker + removable media policy)
  "3.8.1": "implemented", "3.8.2": "implemented", "3.8.3": "implemented",
  "3.8.4": "implemented", "3.8.5": "implemented", "3.8.6": "implemented",
  "3.8.7": "implemented", "3.8.8": "implemented", "3.8.9": "implemented",

  // PS — Personnel Security (customer-managed: screening is the customer's HR process)
  "3.9.1": "implemented", "3.9.2": "implemented",

  // PE — Physical Protection (3.10.1–5 are Azure PE inherited, handled in Phase 4)
  "3.10.6": "implemented",

  // RA — Risk Assessment
  "3.11.1": "implemented", "3.11.2": "implemented", "3.11.3": "implemented",

  // CA — Security Assessment
  "3.12.1": "implemented", "3.12.2": "implemented", "3.12.3": "implemented",
  "3.12.4": "implemented",

  // SC — System & Comms Protection
  "3.13.1": "implemented", "3.13.2": "implemented", "3.13.3": "implemented",
  "3.13.4": "implemented", "3.13.5": "implemented", "3.13.6": "implemented",
  "3.13.7": "implemented", "3.13.8": "implemented", "3.13.9": "implemented",
  "3.13.10": "implemented", "3.13.11": "implemented", "3.13.12": "implemented",
  "3.13.13": "implemented", "3.13.14": "implemented", "3.13.15": "implemented",
  "3.13.16": "implemented",

  // SI — System & Info Integrity (Defender + MacTech patching)
  "3.14.1": "implemented", "3.14.2": "implemented", "3.14.3": "implemented",
  "3.14.4": "implemented", "3.14.5": "implemented", "3.14.6": "implemented",
  "3.14.7": "implemented",
};
