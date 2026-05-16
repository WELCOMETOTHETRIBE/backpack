/**
 * vault-control-map.ts
 *
 * KEYSTONE ARTIFACT — Canonical adjudication map for all 110 NIST SP 800-171 Rev 2 controls.
 *
 * DERIVATION SOURCES (all values traced to one of these files):
 *   1. src/data/cmmc/control_responsibility_templates.v1.json  — responsibility model, mactech_provided, customer_required, evidence_registers
 *   2. src/data/os-evidence-nist-manifest.json                 — support_level, evidence_files (73 controls with OS baseline coverage)
 *   3. src/lib/compliance/scoping-presets.ts → CLOUD_ONLY_AZURE_PRESET — 10 N/A controls with verbatim justifications
 *   4. src/lib/sprs/sprs_scoring_data.ts → sprsScoringData     — DoD point weights (1, 3, or 5); never hardcoded here
 *   5. src/lib/governance/governance-matrix-data.json           — governanceDocIds per control
 *
 * INTEGRITY RULES:
 *   - Every narrative is derived from the source files above. No invented values.
 *   - SPRS weights come exclusively from sprsScoringData lookup.
 *   - needsReview: true is set only when implementation cannot be confirmed in any source file.
 *   - N/A justifications are verbatim from CLOUD_ONLY_AZURE_PRESET.
 */

import { sprsScoringData } from "@/lib/sprs/sprs_scoring_data";
import { CLOUD_ONLY_AZURE_PRESET } from "@/lib/compliance/scoping-presets";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ControlTier =
  | "azure_inherited"   // 100% provided by Azure Gov FedRAMP inheritance (PE family: 3.10.1-3.10.6)
  | "mactech_provided"  // Trust Codex + Vault baseline covers it (currently none pure mactech; all shared)
  | "shared"            // MacTech provides platform; customer must attest their portion (99 controls)
  | "customer_managed"  // Customer owns implementation; MacTech provides register/template (AT + PS = 5 controls)
  | "not_applicable";   // Architecturally N/A for single-VM Azure Gov boundary (10 controls)

export type TechnicalCoverage =
  | "STRONG"        // Collector evidence confirms this control (os-evidence-nist-manifest.json)
  | "PARTIAL"       // Collector evidence partially covers; governance docs also required
  | "GOVERNANCE_ONLY" // No technical check in collector; policy/procedure evidence only
  | "NONE"          // No OS baseline coverage at all
  | "NEEDS_REVIEW"; // Cannot determine without human verification

export interface VaultControl {
  controlId: string;             // "3.x.y" format
  family: string;                // "AC", "AU", "CM", etc. (abbreviation)
  familyName: string;            // Full NIST family name
  title: string;                 // Short control title from os-evidence-nist-manifest or NIST
  sprsWeight: 1 | 3 | 5;        // DoD point deduction — from sprsScoringData exclusively

  tier: ControlTier;

  // Populated for azure_inherited and shared tiers
  azureProvides?: string[];      // From azure_inherited[] in control_responsibility_templates.v1.json

  // Populated for mactech_provided, shared tiers
  mactechProvides?: string[];    // From mactech_provided[] in control_responsibility_templates.v1.json
  governanceDocIds?: string[];   // MAC-POL-XXX / MAC-SOP-XXX from governance-matrix-data.json
  technicalCoverage?: TechnicalCoverage;
  evidenceFiles?: string[];      // From os-evidence-nist-manifest.json collector bundle paths

  // Populated for shared and customer_managed tiers
  customerRequired?: string[];   // From customer_required[] in control_responsibility_templates.v1.json
  evidenceRegisters?: string[];  // From evidence_registers[] in control_responsibility_templates.v1.json
  customerQuestion?: string;     // Plain-English wizard question (derived from customer_required[])
  customerGuidanceHtml?: string; // What they need to do and upload (expanded HTML)

  // N/A tier
  naJustification?: string;      // Verbatim from CLOUD_ONLY_AZURE_PRESET.controls[].reason

  // Review flag — set when implementation cannot be verified from the source files
  needsReview?: boolean;
  needsReviewReason?: string;
}

// ─── Helper: SPRS weight lookup ───────────────────────────────────────────────

function sprsWeight(controlId: string): 1 | 3 | 5 {
  const entry = sprsScoringData.find((s) => s.id === controlId);
  if (!entry) throw new Error(`sprsScoringData missing entry for ${controlId}`);
  return entry.value;
}

// ─── Helper: N/A justification lookup ────────────────────────────────────────

const NA_JUSTIFICATIONS = new Map<string, string>(
  CLOUD_ONLY_AZURE_PRESET.controls.map((c) => [c.controlId, c.reason])
);

// ─── Helper: OS Evidence manifest (support_level + evidence_files) ────────────

interface OsEvidence {
  support_level: "STRONG" | "PARTIAL" | "GOVERNANCE_ONLY";
  evidence_files: string[];
}

// Source: src/data/os-evidence-nist-manifest.json — all 73 entries inlined here
// so this module has zero runtime JSON import (static data, no async boundary).
const OS_EVIDENCE: Record<string, OsEvidence> = {
  "3.1.1":  { support_level: "STRONG",  evidence_files: ["policy/local-accounts.txt", "policy/local-groups.txt", "policy/secpol.cfg"] },
  "3.1.2":  { support_level: "STRONG",  evidence_files: ["apps/applocker-policy.txt"] },
  "3.1.3":  { support_level: "STRONG",  evidence_files: ["network/firewall-rules-summary.txt", "network/listening-ports.txt", "policy/secpol.cfg"] },
  "3.1.5":  { support_level: "STRONG",  evidence_files: ["policy/local-groups.txt", "policy/local-accounts.txt", "policy/user-rights-assignments.txt"] },
  "3.1.6":  { support_level: "STRONG",  evidence_files: ["policy/local-accounts.txt", "policy/local-admins.txt", "policy/user-rights-assignments.txt"] },
  "3.1.7":  { support_level: "STRONG",  evidence_files: ["policy/secpol.cfg", "policy/user-rights-assignments.txt"] },
  "3.1.8":  { support_level: "STRONG",  evidence_files: ["policy/account-policy.txt", "policy/secpol.cfg"] },
  "3.1.9":  { support_level: "STRONG",  evidence_files: ["policy/interactive-logon-notice.txt", "policy/auth-ux-policy.txt"] },
  "3.1.10": { support_level: "STRONG",  evidence_files: ["policy/secpol.cfg", "policy/rsop.xml", "policy/machine-inactivity-limit.txt", "policy/screensaver-policy.txt"] },
  "3.1.11": { support_level: "STRONG",  evidence_files: ["network/firewall-rules-summary.txt", "network/listening-ports.txt", "policy/secpol.cfg"] },
  "3.1.12": { support_level: "STRONG",  evidence_files: ["audit/auditpol.txt", "network/rdp-policy.txt", "network/listening-ports.txt"] },
  "3.1.13": { support_level: "STRONG",  evidence_files: ["network/firewall.txt", "network/firewall-rules-summary.txt", "crypto/fips.txt", "crypto/schannel-protocols.txt"] },
  "3.1.21": { support_level: "STRONG",  evidence_files: ["storage/removable-storage-policies.txt", "storage/usbstor.txt", "policy/secpol.cfg"] },
  "3.1.22": { support_level: "PARTIAL", evidence_files: ["network/firewall.txt", "network/firewall-rules-summary.txt", "policy/local-accounts.txt"] },
  "3.3.1":  { support_level: "STRONG",  evidence_files: ["audit/auditpol.txt", "audit/auditpol-subcategories.txt", "audit/eventlog-security.txt", "audit/eventlog-system.txt"] },
  "3.3.2":  { support_level: "STRONG",  evidence_files: ["audit/auditpol-subcategories.txt", "audit/eventlog-security-sample.txt"] },
  "3.3.4":  { support_level: "STRONG",  evidence_files: ["audit/auditpol.txt", "audit/eventlog-security.txt"] },
  "3.3.5":  { support_level: "PARTIAL", evidence_files: ["audit/auditpol-subcategories.txt", "audit/eventlog-security-sample.txt", "audit/eventlog-system-sample.txt"] },
  "3.3.6":  { support_level: "PARTIAL", evidence_files: ["audit/auditpol.txt", "audit/eventlog-security.txt", "audit/eventlog-application.txt"] },
  "3.3.7":  { support_level: "STRONG",  evidence_files: ["host/time-sync.txt"] },
  "3.3.8":  { support_level: "STRONG",  evidence_files: ["audit/security-evtx-acl.txt"] },
  "3.3.9":  { support_level: "STRONG",  evidence_files: ["policy/secpol.cfg", "policy/user-rights-assignments.txt"] },
  "3.4.1":  { support_level: "STRONG",  evidence_files: ["policy/secpol.cfg", "policy/rsop.xml", "meta/manifest.json", "meta/bundle.json"] },
  "3.4.2":  { support_level: "STRONG",  evidence_files: ["policy/rsop.xml", "policy/gpresult.html", "policy/gpresult-computer.txt", "policy/gpresult-user.txt"] },
  "3.4.3":  { support_level: "PARTIAL", evidence_files: ["meta/collector-transcript.txt", "meta/manifest.json"] },
  "3.4.5":  { support_level: "PARTIAL", evidence_files: ["policy/user-rights-assignments.txt", "policy/secpol.cfg"] },
  "3.4.6":  { support_level: "STRONG",  evidence_files: ["network/listening-ports.txt", "host/services-security-relevant.txt", "host/installed-software.txt"] },
  "3.4.7":  { support_level: "STRONG",  evidence_files: ["apps/applocker-policy.txt"] },
  "3.4.8":  { support_level: "STRONG",  evidence_files: ["network/firewall.txt", "network/firewall-rules-summary.txt", "apps/applocker-policy.txt"] },
  "3.4.9":  { support_level: "STRONG",  evidence_files: ["apps/applocker-policy.txt", "policy/rsop.xml"] },
  "3.5.1":  { support_level: "STRONG",  evidence_files: ["policy/local-accounts.txt", "host/whoami-all.txt"] },
  "3.5.2":  { support_level: "STRONG",  evidence_files: ["policy/secpol.cfg", "policy/local-accounts.txt", "policy/lsa.txt"] },
  "3.5.3":  { support_level: "PARTIAL", evidence_files: ["policy/local-admins.txt", "network/rdp-policy.txt"] },
  "3.5.4":  { support_level: "PARTIAL", evidence_files: ["policy/secpol.cfg", "policy/lsa.txt", "policy/ntlm-policy.txt"] },
  "3.5.5":  { support_level: "STRONG",  evidence_files: ["policy/secpol.cfg", "policy/local-accounts.txt"] },
  "3.5.6":  { support_level: "PARTIAL", evidence_files: ["network/firewall-rules-summary.txt", "policy/account-policy.txt"] },
  "3.5.7":  { support_level: "STRONG",  evidence_files: ["policy/account-policy.txt", "policy/secpol.cfg"] },
  "3.5.8":  { support_level: "STRONG",  evidence_files: ["policy/account-policy.txt", "policy/secpol.cfg"] },
  "3.5.9":  { support_level: "PARTIAL", evidence_files: ["policy/secpol.cfg", "policy/local-accounts.txt"] },
  "3.5.10": { support_level: "PARTIAL", evidence_files: ["crypto/fips.txt", "policy/lsa.txt"] },
  "3.5.11": { support_level: "PARTIAL", evidence_files: ["policy/auth-ux-policy.txt", "policy/interactive-logon-notice.txt"] },
  "3.7.1":  { support_level: "PARTIAL", evidence_files: ["host/services-security-relevant.txt", "meta/collector-transcript.txt"] },
  "3.7.2":  { support_level: "PARTIAL", evidence_files: ["policy/local-admins.txt", "network/firewall-rules-summary.txt", "host/services-remote.txt"] },
  "3.7.5":  { support_level: "PARTIAL", evidence_files: ["network/rdp-policy.txt", "network/rdp-tcp.txt", "policy/local-remote-desktop-users.txt"] },
  "3.8.1":  { support_level: "PARTIAL", evidence_files: ["storage/bitlocker-status.txt", "storage/removable-storage-policies.txt"] },
  "3.8.2":  { support_level: "PARTIAL", evidence_files: ["storage/bitlocker-status.txt", "policy/local-accounts.txt"] },
  "3.8.5":  { support_level: "PARTIAL", evidence_files: ["storage/bitlocker-status.txt", "crypto/fips.txt"] },
  "3.8.6":  { support_level: "STRONG",  evidence_files: ["storage/bitlocker-status.txt"] },
  "3.8.7":  { support_level: "STRONG",  evidence_files: ["storage/removable-storage-policies.txt", "storage/usbstor.txt"] },
  "3.8.8":  { support_level: "PARTIAL", evidence_files: ["storage/removable-storage-policies.txt", "policy/secpol.cfg"] },
  "3.11.2": { support_level: "PARTIAL", evidence_files: ["defender/defender-status.txt", "host/hotfixes.txt", "host/windows-update-services.txt"] },
  "3.11.3": { support_level: "PARTIAL", evidence_files: ["host/hotfixes.txt", "defender/defender-scan-ages.txt"] },
  "3.13.1": { support_level: "STRONG",  evidence_files: ["network/firewall.txt", "network/firewall-rules-summary.txt"] },
  "3.13.2": { support_level: "PARTIAL", evidence_files: ["network/listening-ports.txt", "network/firewall-rules-summary.txt", "meta/manifest.json"] },
  "3.13.3": { support_level: "PARTIAL", evidence_files: ["policy/local-admins.txt", "host/whoami-all.txt", "policy/user-rights-assignments.txt"] },
  "3.13.4": { support_level: "PARTIAL", evidence_files: ["network/firewall-rules-summary.txt", "network/smb-signing.txt", "storage/removable-storage-policies.txt"] },
  "3.13.5": { support_level: "PARTIAL", evidence_files: ["network/listening-ports.txt", "network/firewall-rules-summary.txt"] },
  "3.13.6": { support_level: "STRONG",  evidence_files: ["network/firewall.txt", "network/firewall-rules-summary.txt"] },
  "3.13.8": { support_level: "STRONG",  evidence_files: ["crypto/fips.txt", "crypto/tls-ciphersuites.txt", "crypto/schannel-protocols.txt"] },
  "3.13.9": { support_level: "PARTIAL", evidence_files: ["network/firewall-rules-summary.txt", "policy/machine-inactivity-limit.txt"] },
  "3.13.10":{ support_level: "PARTIAL", evidence_files: ["crypto/fips.txt", "crypto/schannel-protocols.txt"] },
  "3.13.11":{ support_level: "STRONG",  evidence_files: ["crypto/fips.txt"] },
  "3.13.12":{ support_level: "PARTIAL", evidence_files: ["network/rdp-policy.txt", "network/rdp-tcp.txt"] },
  "3.13.13":{ support_level: "PARTIAL", evidence_files: ["apps/applocker-policy.txt", "defender/defender-preferences.txt"] },
  "3.13.15":{ support_level: "PARTIAL", evidence_files: ["network/smb-signing.txt", "crypto/fips.txt"] },
  "3.13.16":{ support_level: "STRONG",  evidence_files: ["storage/bitlocker-status.txt"] },
  "3.14.1": { support_level: "STRONG",  evidence_files: ["host/hotfixes.txt", "host/installed-software.txt", "host/windows-update-policy.txt"] },
  "3.14.2": { support_level: "STRONG",  evidence_files: ["defender/defender-status.txt", "defender/defender-preferences.txt"] },
  "3.14.3": { support_level: "PARTIAL", evidence_files: ["defender/defender-status.txt", "defender/defender-threat-detections.txt", "audit/eventlog-security-sample.txt"] },
  "3.14.4": { support_level: "STRONG",  evidence_files: ["defender/defender-status.txt", "defender/defender-scan-ages.txt"] },
  "3.14.5": { support_level: "STRONG",  evidence_files: ["defender/defender-preferences.txt", "defender/defender-scan-ages.txt"] },
  "3.14.6": { support_level: "STRONG",  evidence_files: ["audit/auditpol.txt", "defender/defender-status.txt", "network/listening-ports.txt"] },
  "3.14.7": { support_level: "PARTIAL", evidence_files: ["audit/eventlog-4625-failed-logons.txt", "audit/eventlog-security-sample.txt", "defender/defender-threat-detections.txt"] },
};

// ─── Helper: Governance doc IDs per control ───────────────────────────────────
// Source: src/lib/governance/governance-matrix-data.json — mactechDocument filename → doc ID
const GOV_DOCS: Record<string, string[]> = {
  "3.1.1":  ["MAC-POL-210"],
  "3.1.2":  ["MAC-POL-210"],
  "3.1.4":  ["MAC-POL-210", "MAC-POL-235", "MAC-SOP-235"],
  "3.1.12": ["MAC-SOP-224"],
  "3.2.1":  ["MAC-POL-219", "MAC-SOP-227"],
  "3.2.2":  ["MAC-POL-219", "MAC-SOP-227"],
  "3.2.3":  ["MAC-POL-219", "MAC-SOP-227"],
  "3.3.1":  ["MAC-POL-218"],
  "3.3.2":  ["MAC-SOP-226"],
  "3.4.1":  ["MAC-POL-220", "MAC-CMP-001"],
  "3.4.2":  ["MAC-POL-220", "MAC-SOP-225"],
  "3.4.3":  ["MAC-POL-220", "MAC-CMP-001"],
  "3.4.5":  ["MAC-POL-220", "MAC-SOP-225"],
  "3.4.6":  ["MAC-POL-220", "MAC-SOP-225"],
  "3.5.1":  ["MAC-POL-211", "MAC-SOP-221"],
  "3.5.3":  ["MAC-POL-211", "MAC-SOP-224"],
  "3.5.4":  ["MAC-POL-211", "MAC-SOP-221"],
  "3.5.5":  ["MAC-POL-211"],
  "3.5.6":  ["MAC-POL-211"],
  "3.5.7":  ["MAC-POL-211"],
  "3.5.8":  ["MAC-POL-211"],
  "3.5.9":  ["MAC-SOP-221"],
  "3.5.10": ["MAC-SOP-221"],
  "3.5.11": ["MAC-POL-228"],
  "3.6.1":  ["MAC-POL-215"],
  "3.6.2":  ["MAC-POL-215"],
  "3.6.3":  ["MAC-SOP-232"],
  "3.7.1":  ["MAC-POL-221"],
  "3.7.2":  ["MAC-POL-221"],
  "3.7.4":  ["MAC-POL-221"],
  "3.7.5":  ["MAC-POL-221"],
  "3.7.6":  ["MAC-POL-221"],
  "3.9.1":  ["MAC-POL-222", "MAC-SOP-233"],
  "3.11.1": ["MAC-POL-223"],
  "3.11.3": ["MAC-POL-214"],
  "3.12.1": ["MAC-POL-224"],
  "3.12.2": ["MAC-POL-224"],
  "3.12.3": ["MAC-POL-224"],
  "3.13.9": ["MAC-SOP-240"],
  "3.13.13":["MAC-POL-214"],
  "3.14.2": ["MAC-POL-214"],
  "3.14.3": ["MAC-SOP-239"],
  "3.14.6": ["MAC-SOP-239"],
  "3.14.7": ["MAC-SOP-239"],
};

// ─── NIST family names (for display) ─────────────────────────────────────────
const FAMILY_NAMES: Record<string, string> = {
  AC: "Access Control",
  AT: "Awareness and Training",
  AU: "Audit and Accountability",
  CM: "Configuration Management",
  IA: "Identification and Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PS: "Personnel Security",
  PE: "Physical Protection",
  RA: "Risk Assessment",
  CA: "Security Assessment",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
};

// ─── Control titles (from os-evidence-nist-manifest + NIST 800-171 Rev 2) ────
// Source: os-evidence-nist-manifest.json titles + NIST publication for controls not in manifest
const CONTROL_TITLES: Record<string, string> = {
  "3.1.1":  "Limit system access to authorized users, processes, devices",
  "3.1.2":  "Limit access to types of transactions and functions",
  "3.1.3":  "Control the flow of CUI",
  "3.1.4":  "Separate duties of individuals",
  "3.1.5":  "Employ least privilege",
  "3.1.6":  "Use non-privileged accounts for non-privileged activities",
  "3.1.7":  "Prevent non-privileged users from executing privileged functions",
  "3.1.8":  "Limit unsuccessful logon attempts",
  "3.1.9":  "Display privacy and security notices",
  "3.1.10": "Use session lock after inactivity period",
  "3.1.11": "Terminate sessions after defined conditions",
  "3.1.12": "Monitor and control remote access sessions",
  "3.1.13": "Use cryptographic mechanisms for remote access",
  "3.1.14": "Route remote access via managed access control points",
  "3.1.15": "Authorize remote execution of privileged commands via remote access",
  "3.1.16": "Authorize wireless access prior to connecting",
  "3.1.17": "Protect wireless access using authentication and encryption",
  "3.1.18": "Control connection of mobile devices",
  "3.1.19": "Encrypt CUI on mobile devices and mobile computing platforms",
  "3.1.20": "Verify and control all external system connections",
  "3.1.21": "Limit use of portable storage devices",
  "3.1.22": "Control CUI posted or processed on publicly accessible systems",
  "3.2.1":  "Ensure personnel are aware of security risks",
  "3.2.2":  "Train personnel to carry out assigned security responsibilities",
  "3.2.3":  "Provide security awareness training on recognizing threats",
  "3.3.1":  "Create and retain system audit logs",
  "3.3.2":  "Ensure actions of individual users are traceable",
  "3.3.3":  "Review and update logged events",
  "3.3.4":  "Alert in the event of an audit logging process failure",
  "3.3.5":  "Correlate audit record review, analysis, and reporting processes",
  "3.3.6":  "Provide audit record reduction and report generation",
  "3.3.7":  "Provide system capability that compares and synchronizes internal clocks",
  "3.3.8":  "Protect audit information and tools from unauthorized access",
  "3.3.9":  "Limit management of audit logging to subset of privileged users",
  "3.4.1":  "Establish and maintain baseline configurations",
  "3.4.2":  "Establish and enforce security configuration settings",
  "3.4.3":  "Track, review, approve, and log changes to systems",
  "3.4.4":  "Analyze security impact of changes before implementation",
  "3.4.5":  "Define and document access restrictions for changes",
  "3.4.6":  "Employ principle of least functionality",
  "3.4.7":  "Restrict, disable, or prevent the use of nonessential programs",
  "3.4.8":  "Apply deny-by-exception policy for unauthorized software",
  "3.4.9":  "Control and monitor user-installed software",
  "3.5.1":  "Identify system users, processes, and devices",
  "3.5.2":  "Authenticate the identities of those users, processes, or devices",
  "3.5.3":  "Use multifactor authentication for local and network access to privileged accounts",
  "3.5.4":  "Employ replay-resistant authentication mechanisms",
  "3.5.5":  "Employ identifier management practices to prevent reuse",
  "3.5.6":  "Disable identifiers after defined inactivity period",
  "3.5.7":  "Enforce minimum password complexity and change requirements",
  "3.5.8":  "Prohibit password reuse for a specified number of generations",
  "3.5.9":  "Allow temporary password use with immediate change requirement",
  "3.5.10": "Store and transmit only cryptographically-protected passwords",
  "3.5.11": "Obscure feedback of authentication information",
  "3.6.1":  "Establish operational incident-handling capability",
  "3.6.2":  "Track, document, and report incidents",
  "3.6.3":  "Test the organizational incident response capability",
  "3.7.1":  "Perform maintenance on organizational systems",
  "3.7.2":  "Provide controls on the tools, techniques, mechanisms, and personnel for maintenance",
  "3.7.3":  "Ensure equipment removed for off-site maintenance is sanitized",
  "3.7.4":  "Check media containing diagnostic programs for malicious code",
  "3.7.5":  "Require MFA to establish remote maintenance sessions",
  "3.7.6":  "Supervise maintenance activities of personnel without required access authorization",
  "3.8.1":  "Protect system media containing CUI, both paper and digital",
  "3.8.2":  "Limit access to CUI on system media to authorized users",
  "3.8.3":  "Sanitize or destroy system media before disposal or reuse",
  "3.8.4":  "Mark media with necessary CUI markings and distribution limitations",
  "3.8.5":  "Control access to media containing CUI during transport",
  "3.8.6":  "Implement cryptographic mechanisms to protect CUI during transport",
  "3.8.7":  "Control the use of removable media on system components",
  "3.8.8":  "Prohibit the use of portable storage without identifiable owner",
  "3.8.9":  "Protect the backup copies of CUI",
  "3.9.1":  "Screen individuals prior to authorizing access to organizational systems containing CUI",
  "3.9.2":  "Ensure CUI is protected during and after personnel actions (termination/transfer)",
  "3.10.1": "Limit physical access to authorized individuals",
  "3.10.2": "Protect and monitor the physical facility and support infrastructure",
  "3.10.3": "Escort visitors and monitor visitor activity",
  "3.10.4": "Maintain audit logs of physical access",
  "3.10.5": "Control and manage physical access devices",
  "3.10.6": "Enforce safeguarding measures for CUI at alternate work sites",
  "3.11.1": "Periodically assess risk to organizational operations and assets",
  "3.11.2": "Scan for vulnerabilities in organizational systems and applications",
  "3.11.3": "Remediate vulnerabilities in accordance with assessments of risk",
  "3.12.1": "Periodically assess the security controls in organizational systems",
  "3.12.2": "Develop and implement plans of action to correct deficiencies",
  "3.12.3": "Monitor security controls on an ongoing basis",
  "3.12.4": "Develop, document, and periodically update system security plans",
  "3.13.1": "Monitor, control, and protect communications at external boundaries",
  "3.13.2": "Employ architectural designs to separate CUI from non-CUI",
  "3.13.3": "Separate user functionality from system management functionality",
  "3.13.4": "Prevent unauthorized and unintended information transfer",
  "3.13.5": "Implement subnetworks for publicly accessible system components",
  "3.13.6": "Deny network communications traffic by default",
  "3.13.7": "Prevent remote devices from simultaneously connecting to the system and other resources",
  "3.13.8": "Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI in transit",
  "3.13.9": "Terminate network connections after defined period of inactivity",
  "3.13.10":"Establish and manage cryptographic keys",
  "3.13.11":"Employ FIPS-validated cryptography",
  "3.13.12":"Prohibit remote activation of collaborative computing devices",
  "3.13.13":"Control and monitor the use of mobile code",
  "3.13.14":"Control and monitor the use of VoIP",
  "3.13.15":"Protect the authenticity of communications sessions",
  "3.13.16":"Protect CUI at rest",
  "3.14.1": "Identify, report, and correct system flaws in a timely manner",
  "3.14.2": "Provide protection from malicious code at appropriate locations",
  "3.14.3": "Monitor system security alerts and advisories",
  "3.14.4": "Update malicious code protection mechanisms",
  "3.14.5": "Perform periodic scans and real-time scans of files from external sources",
  "3.14.6": "Monitor systems to detect attacks and indicators of potential attacks",
  "3.14.7": "Identify unauthorized use of organizational systems",
};

// ─── customerQuestion derivation ─────────────────────────────────────────────
// Plain-English questions derived from customer_required[] per the orientation rules:
// - No NIST jargon. No control IDs. No unexpanded acronyms.
// - Answerable with "Yes / Not yet / Doesn't apply to us."
const CUSTOMER_QUESTIONS: Record<string, string> = {
  // AC family — shared
  "3.1.1":  "Have you approved and documented who has access to the Vault, and do you review and remove access when people change roles or leave?",
  "3.1.2":  "Have you limited what each person can do in the system to only what their job requires, and do you review those limits regularly?",
  "3.1.3":  "Have you reviewed and approved any connections from the Vault to external systems, and documented exceptions for removable media use?",
  "3.1.4":  "Are sensitive duties divided so no single person can complete a high-risk action alone (for example, approving their own access)?",
  "3.1.5":  "Does each user have only the access they need to do their job, and do you review access periodically to remove what's no longer needed?",
  "3.1.6":  "Do your administrators use a separate, unprivileged account for routine tasks and only elevate when necessary?",
  "3.1.7":  "Is there a documented process ensuring that privileged commands can only be executed by authorized administrators?",
  "3.1.8":  "Have you confirmed the lockout policy is active and that accounts lock after repeated failed login attempts?",
  "3.1.9":  "Is there a system notice displayed at login that informs users they are accessing a monitored system subject to CUI handling rules?",
  "3.1.10": "Does the Vault automatically lock the screen after a defined period of inactivity, requiring re-authentication to resume?",
  "3.1.11": "Are sessions automatically terminated after a defined condition, such as a period of inactivity or end of a work session?",
  "3.1.12": "Do you have logs and records showing that remote access sessions are monitored and that your policy for remote access is enforced?",
  "3.1.13": "Are all remote access sessions encrypted, and is there documentation confirming the encryption standards in use?",
  "3.1.14": "Is all remote access routed through a managed entry point (such as a VPN or bastion host) rather than direct connections?",
  "3.1.15": "Are privileged commands over remote access explicitly authorized in writing, with justification documented?",
  "3.1.16": "N/A — No wireless infrastructure in this boundary (auto-applied by cloud preset).",
  "3.1.17": "N/A — No wireless infrastructure in this boundary (auto-applied by cloud preset).",
  "3.1.18": "Have you documented which mobile devices, if any, are authorized to connect to the Vault, and enforced controls on those connections?",
  "3.1.19": "Is CUI encrypted on any mobile devices or laptops that may connect to or store data from the Vault?",
  "3.1.20": "Have you approved and documented all connections between the Vault and systems outside your organization?",
  "3.1.21": "Have you reviewed and authorized any use of portable storage (USB drives, external drives) with the Vault, and are unauthorized devices blocked?",
  "3.1.22": "Have you reviewed and confirmed that no CUI is posted, accessible, or stored on any publicly accessible website or server?",
  // AT family — customer_managed
  "3.2.1":  "Have all personnel who access the Vault completed security awareness training this year, and do you have completion records for each person?",
  "3.2.2":  "Have all personnel with specific security responsibilities (such as administrators and incident responders) completed role-based security training?",
  "3.2.3":  "Does your security awareness training include specific instruction on recognizing and reporting insider threats?",
  // AU family — shared
  "3.3.1":  "Do you perform and document routine reviews of the audit logs generated by the Vault, and do you retain those logs per your policy?",
  "3.3.2":  "Can you trace each logged event to a specific, identified user, and do your logs contain enough detail to support an investigation?",
  "3.3.3":  "Have you reviewed and updated the list of events your system logs to ensure it remains current and appropriate?",
  "3.3.4":  "Do you receive alerts when the audit logging system fails, and do you have a documented response procedure for those alerts?",
  "3.3.5":  "Do you correlate log data from multiple sources to identify patterns or potential incidents that would not be visible in a single log?",
  "3.3.6":  "Does your team use tools to reduce and report on audit log data, making it practical to review and act on?",
  "3.3.7":  "Have you confirmed that all system clocks in the Vault are synchronized to an authoritative time source?",
  "3.3.8":  "Are audit logs and the tools used to manage them protected from unauthorized access, modification, or deletion?",
  "3.3.9":  "Is the ability to configure, manage, or clear audit logs restricted to a small group of specifically authorized administrators?",
  // CM family — shared
  "3.4.1":  "Do you have a documented, approved baseline configuration for the Vault, and do you track deviations from that baseline?",
  "3.4.2":  "Have you approved and documented the security configuration settings applied to the Vault, and are deviations from those settings logged?",
  "3.4.3":  "Do all changes to the Vault go through an approval process with a written record of what changed, when, why, and by whom?",
  "3.4.4":  "Do you analyze the security impact of proposed changes before implementing them in the Vault?",
  "3.4.5":  "Are access restrictions for making changes to the Vault's configuration documented and enforced?",
  "3.4.6":  "Have you disabled or removed all system functions, ports, protocols, and services not required for business operations?",
  "3.4.7":  "Is there a policy restricting or preventing the installation and use of software not explicitly authorized for use in the Vault?",
  "3.4.8":  "Is there a deny-by-exception (allow-list) policy for software, where only explicitly approved software is permitted to run?",
  "3.4.9":  "Do you prevent or control the installation of software by users who are not administrators, and do you log such activity?",
  // IA family — shared
  "3.5.1":  "Does every user, process, and device that accesses the Vault have a unique, documented identity that is managed throughout their lifecycle?",
  "3.5.2":  "Does every user, process, and device prove their identity before gaining access (for example, via password or certificate)?",
  "3.5.3":  "Do all privileged (administrator) accounts require multi-factor authentication — meaning both a password and a second factor such as an authenticator app?",
  "3.5.4":  "Does your authentication system prevent replay attacks, where a captured login credential could be reused by an attacker?",
  "3.5.5":  "Does your identity management process prevent the reuse of usernames or account IDs after they have been deactivated or deleted?",
  "3.5.6":  "Are accounts or credentials disabled automatically after a defined period of inactivity?",
  "3.5.7":  "Does your password policy enforce minimum length, complexity, and change frequency requirements?",
  "3.5.8":  "Does your system prevent users from reusing recent passwords, and is that history limit documented?",
  "3.5.9":  "When temporary passwords are issued (for new accounts or resets), are users required to change them immediately upon first use?",
  "3.5.10": "Are passwords stored and transmitted only in a hashed or otherwise cryptographically protected form — never in plaintext?",
  "3.5.11": "When users type their password, does the system mask it so it cannot be observed by someone nearby or in a screen recording?",
  // IR family — shared
  "3.6.1":  "Does your organization have an active incident response program, and have you declared and documented at least one incident drill or tabletop exercise this year?",
  "3.6.2":  "Are security incidents tracked from detection through resolution with a written record of timeline, impact, and actions taken?",
  "3.6.3":  "Have you tested your incident response plan within the last year, through a tabletop exercise, drill, or simulated incident?",
  // MA family — shared (N/A ones will be overridden)
  "3.7.1":  "Do you coordinate and document maintenance windows, ensure only authorized personnel perform maintenance, and keep maintenance records?",
  "3.7.2":  "Are the tools and techniques used for system maintenance approved and controlled, and are maintenance personnel verified before access?",
  "3.7.3":  "N/A — No physical equipment requiring sanitization before off-site maintenance (cloud-only, auto-applied).",
  "3.7.4":  "N/A — No removable diagnostic media used for system maintenance (cloud-only, auto-applied).",
  "3.7.5":  "Do remote maintenance sessions require multi-factor authentication, and are those sessions logged and supervised?",
  "3.7.6":  "N/A — No external maintenance personnel with physical access (cloud-only, auto-applied).",
  // MP family — shared (some are N/A)
  "3.8.1":  "Do you have documented procedures for protecting system media (drives, backups, exports) containing CUI?",
  "3.8.2":  "Is access to media containing CUI restricted to specifically authorized individuals, with access logged?",
  "3.8.3":  "Do you have a documented, verified procedure for securely sanitizing or destroying media before it is disposed of or repurposed?",
  "3.8.4":  "N/A — Digital-only environment; no physical media to mark (auto-applied by cloud preset).",
  "3.8.5":  "N/A — No physical media transport; all CUI is transmitted digitally over encrypted channels (auto-applied by cloud preset).",
  "3.8.6":  "Is CUI encrypted when stored on portable or removable media, and is that encryption policy documented?",
  "3.8.7":  "Is the use of removable storage devices (USB drives, external hard drives) controlled and limited to specifically authorized personnel and purposes?",
  "3.8.8":  "Is every portable storage device used with the Vault tracked to an identified owner, and are unidentified devices prohibited?",
  "3.8.9":  "Are backups of CUI protected with access controls and encryption equivalent to the primary data, and are backup restores tested?",
  // PS family — customer_managed
  "3.9.1":  "Do you screen (background check) personnel before granting them access to the Vault and to CUI, and do you have documentation of that screening?",
  "3.9.2":  "When an employee or contractor with Vault access leaves or changes roles, is their access revoked promptly and documented?",
  // PE family — azure_inherited (questions not needed; inherited)
  "3.10.1": "Azure Government datacenter physical access controls are fully inherited. No customer action required for this boundary.",
  "3.10.2": "Azure Government datacenter physical access controls are fully inherited. No customer action required for this boundary.",
  "3.10.3": "Azure Government datacenter visitor controls are fully inherited. No customer action required for this boundary.",
  "3.10.4": "Azure Government datacenter physical access audit logs are fully inherited. No customer action required for this boundary.",
  "3.10.5": "Azure Government datacenter physical access device management is fully inherited. No customer action required for this boundary.",
  "3.10.6": "Azure Government alternate work site safeguards are fully inherited. No customer action required for this boundary.",
  // RA family — shared
  "3.11.1": "Do you periodically assess and document the risks to your organization from operating the Vault, and do you update that risk register based on changes?",
  "3.11.2": "Do you run vulnerability scans against the Vault and document the results, including findings that could not be immediately remediated?",
  "3.11.3": "When vulnerability scans identify issues, do you remediate them in accordance with a written, risk-prioritized timeline?",
  // CA family — shared
  "3.12.1": "Do you periodically (at least annually) assess the security controls protecting the Vault and document your findings?",
  "3.12.2": "For any security control deficiency you find, do you create a Plan of Action and Milestones (POA&M) with a target date and mitigation steps?",
  "3.12.3": "Do you continuously monitor your security controls — for example, through automated scans, log reviews, or periodic re-assessments?",
  "3.12.4": "Do you maintain an up-to-date System Security Plan (SSP) that describes how all 110 controls are addressed for this system?",
  // SC family — shared (N/A ones will be overridden)
  "3.13.1": "Have you approved and documented any exceptions to the network communications rules protecting the Vault, and are those approvals current?",
  "3.13.2": "Have you confirmed and documented that CUI systems are architecturally separated from non-CUI systems in your environment?",
  "3.13.3": "Is administrative access to the Vault managed separately from regular user access, both technically and procedurally?",
  "3.13.4": "Are there controls in place preventing unauthorized data from moving between the Vault and other systems or storage locations?",
  "3.13.5": "Have you confirmed that the network architecture places the Vault's public-facing components in a separate, protected subnet?",
  "3.13.6": "Is the network configured to block all traffic by default, permitting only explicitly authorized communications to and from the Vault?",
  "3.13.7": "N/A — All organizational access is remote by design; split-tunneling prevention is enforced at the endpoint level (auto-applied by cloud preset).",
  "3.13.8": "Have you confirmed that CUI in transit is encrypted using approved protocols, and is that encryption configuration documented?",
  "3.13.9": "Are network connections to the Vault terminated automatically after a defined period of inactivity?",
  "3.13.10":"Have you documented how cryptographic keys used by the Vault are generated, stored, distributed, and rotated?",
  "3.13.11":"Have you verified that all cryptography used in the Vault is FIPS 140-2 or 140-3 validated, and is that validation documented?",
  "3.13.12":"N/A — No collaborative computing devices (cameras, microphones) are present in this boundary (auto-applied by cloud preset).",
  "3.13.13":"Are controls in place to restrict or prevent the use of mobile code (scripts, macros) that has not been explicitly authorized?",
  "3.13.14":"N/A — No VoIP functionality is deployed in this boundary (auto-applied by cloud preset).",
  "3.13.15":"Are communications sessions authenticated, and is session integrity protected against hijacking or modification?",
  "3.13.16":"Is CUI stored on the Vault encrypted at rest, and has that encryption been verified and documented?",
  // SI family — shared
  "3.14.1": "Do you have a patch management process that identifies and applies security patches to the Vault within a documented, risk-based timeline?",
  "3.14.2": "Are antimalware tools deployed and active on the Vault, and do you document their configuration and update status?",
  "3.14.3": "Do you monitor and act on security alerts and advisories relevant to the Vault, and document the outcome of each alert reviewed?",
  "3.14.4": "Are antimalware signatures and engines on the Vault updated automatically or on a frequent, documented schedule?",
  "3.14.5": "Are periodic and real-time malware scans configured and running on the Vault, with scan results retained as evidence?",
  "3.14.6": "Do you actively monitor the Vault for indicators of attack, including anomalous network traffic, unexpected processes, and unauthorized access attempts?",
  "3.14.7": "Do you have a process for detecting and documenting unauthorized use of the Vault — including user activity that falls outside authorized patterns?",
};

// ─── Build function ───────────────────────────────────────────────────────────

function buildVaultControlMap(): VaultControl[] {
  const naControlIds = new Set(CLOUD_ONLY_AZURE_PRESET.controls.map((c) => c.controlId));

  // All 110 NIST SP 800-171 Rev 2 control IDs in canonical order
  const ALL_CONTROLS: Array<{ id: string; family: string; model: "azure_inherited" | "shared" | "customer_managed" }> = [
    // AC — Access Control (22 controls)
    { id: "3.1.1",  family: "AC", model: "shared" },
    { id: "3.1.2",  family: "AC", model: "shared" },
    { id: "3.1.3",  family: "AC", model: "shared" },
    { id: "3.1.4",  family: "AC", model: "shared" },
    { id: "3.1.5",  family: "AC", model: "shared" },
    { id: "3.1.6",  family: "AC", model: "shared" },
    { id: "3.1.7",  family: "AC", model: "shared" },
    { id: "3.1.8",  family: "AC", model: "shared" },
    { id: "3.1.9",  family: "AC", model: "shared" },
    { id: "3.1.10", family: "AC", model: "shared" },
    { id: "3.1.11", family: "AC", model: "shared" },
    { id: "3.1.12", family: "AC", model: "shared" },
    { id: "3.1.13", family: "AC", model: "shared" },
    { id: "3.1.14", family: "AC", model: "shared" },
    { id: "3.1.15", family: "AC", model: "shared" },
    { id: "3.1.16", family: "AC", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.1.17", family: "AC", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.1.18", family: "AC", model: "shared" },
    { id: "3.1.19", family: "AC", model: "shared" },
    { id: "3.1.20", family: "AC", model: "shared" },
    { id: "3.1.21", family: "AC", model: "shared" },
    { id: "3.1.22", family: "AC", model: "shared" },
    // AT — Awareness and Training (3 controls)
    { id: "3.2.1",  family: "AT", model: "customer_managed" },
    { id: "3.2.2",  family: "AT", model: "customer_managed" },
    { id: "3.2.3",  family: "AT", model: "customer_managed" },
    // AU — Audit and Accountability (9 controls)
    { id: "3.3.1",  family: "AU", model: "shared" },
    { id: "3.3.2",  family: "AU", model: "shared" },
    { id: "3.3.3",  family: "AU", model: "shared" },
    { id: "3.3.4",  family: "AU", model: "shared" },
    { id: "3.3.5",  family: "AU", model: "shared" },
    { id: "3.3.6",  family: "AU", model: "shared" },
    { id: "3.3.7",  family: "AU", model: "shared" },
    { id: "3.3.8",  family: "AU", model: "shared" },
    { id: "3.3.9",  family: "AU", model: "shared" },
    // CM — Configuration Management (9 controls)
    { id: "3.4.1",  family: "CM", model: "shared" },
    { id: "3.4.2",  family: "CM", model: "shared" },
    { id: "3.4.3",  family: "CM", model: "shared" },
    { id: "3.4.4",  family: "CM", model: "shared" },
    { id: "3.4.5",  family: "CM", model: "shared" },
    { id: "3.4.6",  family: "CM", model: "shared" },
    { id: "3.4.7",  family: "CM", model: "shared" },
    { id: "3.4.8",  family: "CM", model: "shared" },
    { id: "3.4.9",  family: "CM", model: "shared" },
    // IA — Identification and Authentication (11 controls)
    { id: "3.5.1",  family: "IA", model: "shared" },
    { id: "3.5.2",  family: "IA", model: "shared" },
    { id: "3.5.3",  family: "IA", model: "shared" },
    { id: "3.5.4",  family: "IA", model: "shared" },
    { id: "3.5.5",  family: "IA", model: "shared" },
    { id: "3.5.6",  family: "IA", model: "shared" },
    { id: "3.5.7",  family: "IA", model: "shared" },
    { id: "3.5.8",  family: "IA", model: "shared" },
    { id: "3.5.9",  family: "IA", model: "shared" },
    { id: "3.5.10", family: "IA", model: "shared" },
    { id: "3.5.11", family: "IA", model: "shared" },
    // IR — Incident Response (3 controls)
    { id: "3.6.1",  family: "IR", model: "shared" },
    { id: "3.6.2",  family: "IR", model: "shared" },
    { id: "3.6.3",  family: "IR", model: "shared" },
    // MA — Maintenance (6 controls, 3 are N/A via cloud preset)
    { id: "3.7.1",  family: "MA", model: "shared" },
    { id: "3.7.2",  family: "MA", model: "shared" },
    { id: "3.7.3",  family: "MA", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.7.4",  family: "MA", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.7.5",  family: "MA", model: "shared" },
    { id: "3.7.6",  family: "MA", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    // MP — Media Protection (9 controls, 2 are N/A via cloud preset)
    { id: "3.8.1",  family: "MP", model: "shared" },
    { id: "3.8.2",  family: "MP", model: "shared" },
    { id: "3.8.3",  family: "MP", model: "shared" },
    { id: "3.8.4",  family: "MP", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.8.5",  family: "MP", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.8.6",  family: "MP", model: "shared" },
    { id: "3.8.7",  family: "MP", model: "shared" },
    { id: "3.8.8",  family: "MP", model: "shared" },
    { id: "3.8.9",  family: "MP", model: "shared" },
    // PS — Personnel Security (2 controls)
    { id: "3.9.1",  family: "PS", model: "customer_managed" },
    { id: "3.9.2",  family: "PS", model: "customer_managed" },
    // PE — Physical Protection (6 controls, all azure_inherited)
    { id: "3.10.1", family: "PE", model: "azure_inherited" },
    { id: "3.10.2", family: "PE", model: "azure_inherited" },
    { id: "3.10.3", family: "PE", model: "azure_inherited" },
    { id: "3.10.4", family: "PE", model: "azure_inherited" },
    { id: "3.10.5", family: "PE", model: "azure_inherited" },
    { id: "3.10.6", family: "PE", model: "azure_inherited" },
    // RA — Risk Assessment (3 controls)
    { id: "3.11.1", family: "RA", model: "shared" },
    { id: "3.11.2", family: "RA", model: "shared" },
    { id: "3.11.3", family: "RA", model: "shared" },
    // CA — Security Assessment (4 controls)
    { id: "3.12.1", family: "CA", model: "shared" },
    { id: "3.12.2", family: "CA", model: "shared" },
    { id: "3.12.3", family: "CA", model: "shared" },
    { id: "3.12.4", family: "CA", model: "shared" },
    // SC — System and Communications Protection (16 controls, 3 N/A via cloud preset)
    { id: "3.13.1",  family: "SC", model: "shared" },
    { id: "3.13.2",  family: "SC", model: "shared" },
    { id: "3.13.3",  family: "SC", model: "shared" },
    { id: "3.13.4",  family: "SC", model: "shared" },
    { id: "3.13.5",  family: "SC", model: "shared" },
    { id: "3.13.6",  family: "SC", model: "shared" },
    { id: "3.13.7",  family: "SC", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.13.8",  family: "SC", model: "shared" },
    { id: "3.13.9",  family: "SC", model: "shared" },
    { id: "3.13.10", family: "SC", model: "shared" },
    { id: "3.13.11", family: "SC", model: "shared" },
    { id: "3.13.12", family: "SC", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.13.13", family: "SC", model: "shared" },
    { id: "3.13.14", family: "SC", model: "shared" }, // N/A via CLOUD_ONLY_AZURE_PRESET
    { id: "3.13.15", family: "SC", model: "shared" },
    { id: "3.13.16", family: "SC", model: "shared" },
    // SI — System and Information Integrity (7 controls)
    { id: "3.14.1", family: "SI", model: "shared" },
    { id: "3.14.2", family: "SI", model: "shared" },
    { id: "3.14.3", family: "SI", model: "shared" },
    { id: "3.14.4", family: "SI", model: "shared" },
    { id: "3.14.5", family: "SI", model: "shared" },
    { id: "3.14.6", family: "SI", model: "shared" },
    { id: "3.14.7", family: "SI", model: "shared" },
  ];

  // Responsibility template data inlined (derived from control_responsibility_templates.v1.json)
  const AZURE_PROVIDED: Record<string, string[]> = {
    // AC controls — Azure provides cloud access control primitives
    "3.1.1":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.2":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.3":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.4":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.5":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.6":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.7":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.8":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.9":  ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.10": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.11": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.12": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.13": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.14": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.15": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.16": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.17": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.18": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.19": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.20": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.21": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    "3.1.22": ["Cloud access control primitives (NSG/RBAC/Entra) are provided by Azure (shared responsibility)"],
    // AU controls
    "3.3.1":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    "3.3.2":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    "3.3.3":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    "3.3.4":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    "3.3.5":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    "3.3.6":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    "3.3.7":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    "3.3.8":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    "3.3.9":  ["Logging platform availability and service controls for Azure Monitor/Log Analytics/Sentinel (shared responsibility)"],
    // IA controls
    "3.5.1":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.2":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.3":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.4":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.5":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.6":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.7":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.8":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.9":  ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.10": ["Entra ID / MFA platform capabilities (shared responsibility)"],
    "3.5.11": ["Entra ID / MFA platform capabilities (shared responsibility)"],
    // IR controls
    "3.6.1":  ["Platform-level security telemetry services used by Sentinel/Defender (shared responsibility)"],
    "3.6.2":  ["Platform-level security telemetry services used by Sentinel/Defender (shared responsibility)"],
    "3.6.3":  ["Platform-level security telemetry services used by Sentinel/Defender (shared responsibility)"],
    // MA controls
    "3.7.1":  ["CSP-maintained infrastructure maintenance for underlying platform components (shared responsibility)"],
    "3.7.2":  ["CSP-maintained infrastructure maintenance for underlying platform components (shared responsibility)"],
    "3.7.3":  ["CSP-maintained infrastructure maintenance for underlying platform components (shared responsibility)"],
    "3.7.4":  ["CSP-maintained infrastructure maintenance for underlying platform components (shared responsibility)"],
    "3.7.5":  ["CSP-maintained infrastructure maintenance for underlying platform components (shared responsibility)"],
    "3.7.6":  ["CSP-maintained infrastructure maintenance for underlying platform components (shared responsibility)"],
    // PE controls (azure_inherited)
    "3.10.1": ["Datacenter physical access controls (guards, badges, CCTV)", "Visitor controls and physical access logging within Microsoft facilities", "Environmental protections and physical boundary enforcement of Azure regions"],
    "3.10.2": ["Datacenter physical access controls (guards, badges, CCTV)", "Visitor controls and physical access logging within Microsoft facilities", "Environmental protections and physical boundary enforcement of Azure regions"],
    "3.10.3": ["Datacenter physical access controls (guards, badges, CCTV)", "Visitor controls and physical access logging within Microsoft facilities", "Environmental protections and physical boundary enforcement of Azure regions"],
    "3.10.4": ["Datacenter physical access controls (guards, badges, CCTV)", "Visitor controls and physical access logging within Microsoft facilities", "Environmental protections and physical boundary enforcement of Azure regions"],
    "3.10.5": ["Datacenter physical access controls (guards, badges, CCTV)", "Visitor controls and physical access logging within Microsoft facilities", "Environmental protections and physical boundary enforcement of Azure regions"],
    "3.10.6": ["Datacenter physical access controls (guards, badges, CCTV)", "Visitor controls and physical access logging within Microsoft facilities", "Environmental protections and physical boundary enforcement of Azure regions"],
    // RA controls
    "3.11.1": ["Underlying platform security monitoring and advisories for Azure services (shared responsibility)"],
    "3.11.2": ["Underlying platform security monitoring and advisories for Azure services (shared responsibility)"],
    "3.11.3": ["Underlying platform security monitoring and advisories for Azure services (shared responsibility)"],
    // SC controls
    "3.13.1":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.2":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.3":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.4":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.5":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.6":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.7":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.8":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.9":  ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.10": ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.11": ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.12": ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.13": ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.14": ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.15": ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    "3.13.16": ["Platform network/security capabilities (VNets, NSGs, TLS endpoints, Azure crypto services)", "Availability of FIPS-validated modules where applicable in Azure services (shared responsibility)"],
    // SI controls
    "3.14.1": ["Security service platform features (Defender, update services availability) where used (shared responsibility)"],
    "3.14.2": ["Security service platform features (Defender, update services availability) where used (shared responsibility)"],
    "3.14.3": ["Security service platform features (Defender, update services availability) where used (shared responsibility)"],
    "3.14.4": ["Security service platform features (Defender, update services availability) where used (shared responsibility)"],
    "3.14.5": ["Security service platform features (Defender, update services availability) where used (shared responsibility)"],
    "3.14.6": ["Security service platform features (Defender, update services availability) where used (shared responsibility)"],
    "3.14.7": ["Security service platform features (Defender, update services availability) where used (shared responsibility)"],
  };

  const MACTECH_PROVIDED: Record<string, string[]> = {
    // AC
    "3.1.1":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.2":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.3":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.4":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.5":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.6":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.7":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.8":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.9":  ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.10": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.11": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.12": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.13": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.14": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.15": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.16": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.17": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.18": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.19": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.20": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.21": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    "3.1.22": ["RBAC patterns for vault resources and least privilege role design recommendations", "Hardened remote access patterns (VPN/Bastion) and privileged access pathways", "Register workflows for access authorization and periodic reviews"],
    // AT
    "3.2.1":  ["Provide register tracking and optional training templates"],
    "3.2.2":  ["Provide register tracking and optional training templates"],
    "3.2.3":  ["Provide register tracking and optional training templates"],
    // AU
    "3.3.1":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    "3.3.2":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    "3.3.3":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    "3.3.4":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    "3.3.5":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    "3.3.6":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    "3.3.7":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    "3.3.8":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    "3.3.9":  ["Deploy and configure vault logging stack (e.g., Azure Monitor/Log Analytics/Sentinel) per reference design", "Maintain log source onboarding patterns and retention baselines", "Provide audit review workflows and dashboards"],
    // CM
    "3.4.1":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    "3.4.2":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    "3.4.3":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    "3.4.4":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    "3.4.5":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    "3.4.6":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    "3.4.7":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    "3.4.8":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    "3.4.9":  ["Provide STIG-aligned baseline configuration templates for the vault", "Provide change management workflows and baseline exception handling"],
    // IA
    "3.5.1":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.2":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.3":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.4":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.5":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.6":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.7":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.8":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.9":  ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.10": ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    "3.5.11": ["Reference architecture for identity integration (Entra ID) and vault access paths (VPN/Bastion)", "MFA enforcement patterns for vault access (where tenant licensing allows)", "Authenticator management workflow support"],
    // IR
    "3.6.1":  ["Provide incident logging workflows and templates", "Provide detection stack integrations (Sentinel/Defender) and alert routing patterns for the vault"],
    "3.6.2":  ["Provide incident logging workflows and templates", "Provide detection stack integrations (Sentinel/Defender) and alert routing patterns for the vault"],
    "3.6.3":  ["Provide incident logging workflows and templates", "Provide detection stack integrations (Sentinel/Defender) and alert routing patterns for the vault"],
    // MA
    "3.7.1":  ["Provide hardened maintenance procedures for the vault", "Provide maintenance logging workflows and remote maintenance supervision patterns"],
    "3.7.2":  ["Provide hardened maintenance procedures for the vault", "Provide maintenance logging workflows and remote maintenance supervision patterns"],
    "3.7.3":  ["Provide hardened maintenance procedures for the vault", "Provide maintenance logging workflows and remote maintenance supervision patterns"],
    "3.7.4":  ["Provide hardened maintenance procedures for the vault", "Provide maintenance logging workflows and remote maintenance supervision patterns"],
    "3.7.5":  ["Provide hardened maintenance procedures for the vault", "Provide maintenance logging workflows and remote maintenance supervision patterns"],
    "3.7.6":  ["Provide hardened maintenance procedures for the vault", "Provide maintenance logging workflows and remote maintenance supervision patterns"],
    // MP
    "3.8.1":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    "3.8.2":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    "3.8.3":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    "3.8.4":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    "3.8.5":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    "3.8.6":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    "3.8.7":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    "3.8.8":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    "3.8.9":  ["Provide controls to restrict removable media and log usage within the vault", "Provide media destruction/sanitization logging workflows"],
    // PS
    "3.9.1":  ["Provide workflow and registers to record screening/offboarding evidence"],
    "3.9.2":  ["Provide workflow and registers to record screening/offboarding evidence"],
    // PE
    "3.10.1": ["Define enclave physical scope as cloud-hosted; document inherited controls and applicable boundary statements"],
    "3.10.2": ["Define enclave physical scope as cloud-hosted; document inherited controls and applicable boundary statements"],
    "3.10.3": ["Define enclave physical scope as cloud-hosted; document inherited controls and applicable boundary statements"],
    "3.10.4": ["Define enclave physical scope as cloud-hosted; document inherited controls and applicable boundary statements"],
    "3.10.5": ["Define enclave physical scope as cloud-hosted; document inherited controls and applicable boundary statements"],
    "3.10.6": ["Define enclave physical scope as cloud-hosted; document inherited controls and applicable boundary statements"],
    // RA
    "3.11.1": ["Provide vulnerability scanning/remediation tooling for the vault baseline", "Provide risk register workflows and reporting"],
    "3.11.2": ["Provide vulnerability scanning/remediation tooling for the vault baseline", "Provide risk register workflows and reporting"],
    "3.11.3": ["Provide vulnerability scanning/remediation tooling for the vault baseline", "Provide risk register workflows and reporting"],
    // CA
    "3.12.1": ["Provide evidence engine, scoring, SSP draft generation, and audit bundle exports", "Provide baseline assessment scripts for vault technical checks"],
    "3.12.2": ["Provide evidence engine, scoring, SSP draft generation, and audit bundle exports", "Provide baseline assessment scripts for vault technical checks"],
    "3.12.3": ["Provide evidence engine, scoring, SSP draft generation, and audit bundle exports", "Provide baseline assessment scripts for vault technical checks"],
    "3.12.4": ["Provide evidence engine, scoring, SSP draft generation, and audit bundle exports", "Provide baseline assessment scripts for vault technical checks"],
    // SC
    "3.13.1":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.2":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.3":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.4":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.5":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.6":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.7":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.8":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.9":  ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.10": ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.11": ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.12": ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.13": ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.14": ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.15": ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    "3.13.16": ["Vault network segmentation and boundary architecture", "Encryption configuration guidance (at rest/in transit) and secure admin paths", "Baseline hardening and monitoring checks for communications protections"],
    // SI
    "3.14.1": ["Reference security tooling stack (Defender for Endpoint/Cloud, Sentinel) for the vault", "Vulnerability remediation workflow and monitoring patterns"],
    "3.14.2": ["Reference security tooling stack (Defender for Endpoint/Cloud, Sentinel) for the vault", "Vulnerability remediation workflow and monitoring patterns"],
    "3.14.3": ["Reference security tooling stack (Defender for Endpoint/Cloud, Sentinel) for the vault", "Vulnerability remediation workflow and monitoring patterns"],
    "3.14.4": ["Reference security tooling stack (Defender for Endpoint/Cloud, Sentinel) for the vault", "Vulnerability remediation workflow and monitoring patterns"],
    "3.14.5": ["Reference security tooling stack (Defender for Endpoint/Cloud, Sentinel) for the vault", "Vulnerability remediation workflow and monitoring patterns"],
    "3.14.6": ["Reference security tooling stack (Defender for Endpoint/Cloud, Sentinel) for the vault", "Vulnerability remediation workflow and monitoring patterns"],
    "3.14.7": ["Reference security tooling stack (Defender for Endpoint/Cloud, Sentinel) for the vault", "Vulnerability remediation workflow and monitoring patterns"],
  };

  const CUSTOMER_REQUIRED: Record<string, string[]> = {
    // AC (shared)
    "3.1.1":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.2":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.3":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.4":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.5":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.6":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.7":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.8":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.9":  ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.10": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.11": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.12": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.13": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.14": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.15": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.16": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.17": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.18": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.19": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.20": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.21": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    "3.1.22": ["Approve access requests and assign roles", "Perform periodic access reviews and remove unnecessary access", "Authorize external connections/removable media exceptions (as applicable)"],
    // AT (customer_managed)
    "3.2.1":  ["Deliver security awareness and role-based training", "Maintain training records and completion attestations"],
    "3.2.2":  ["Deliver security awareness and role-based training", "Maintain training records and completion attestations"],
    "3.2.3":  ["Deliver security awareness and role-based training", "Maintain training records and completion attestations"],
    // AU (shared)
    "3.3.1":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    "3.3.2":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    "3.3.3":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    "3.3.4":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    "3.3.5":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    "3.3.6":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    "3.3.7":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    "3.3.8":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    "3.3.9":  ["Perform routine log reviews per policy and document outcomes", "Investigate alerts and record dispositions/incident escalation"],
    // CM (shared)
    "3.4.1":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    "3.4.2":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    "3.4.3":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    "3.4.4":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    "3.4.5":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    "3.4.6":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    "3.4.7":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    "3.4.8":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    "3.4.9":  ["Approve changes, manage change tickets, and ensure changes follow policy", "Operate configuration control board (if applicable)"],
    // IA (shared)
    "3.5.1":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.2":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.3":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.4":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.5":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.6":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.7":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.8":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.9":  ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.10": ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    "3.5.11": ["Manage identity lifecycle (joiners/movers/leavers) and enroll users in MFA", "Approve and review privileged access assignments"],
    // IR (shared)
    "3.6.1":  ["Operate the incident response program, declare incidents, and coordinate communications", "Run exercises/tabletops and retain reports"],
    "3.6.2":  ["Operate the incident response program, declare incidents, and coordinate communications", "Run exercises/tabletops and retain reports"],
    "3.6.3":  ["Operate the incident response program, declare incidents, and coordinate communications", "Run exercises/tabletops and retain reports"],
    // MA (shared)
    "3.7.1":  ["Approve/coordinate maintenance windows and ensure authorized personnel", "Maintain records for customer-performed maintenance and vendor activities"],
    "3.7.2":  ["Approve/coordinate maintenance windows and ensure authorized personnel", "Maintain records for customer-performed maintenance and vendor activities"],
    "3.7.3":  ["Approve/coordinate maintenance windows and ensure authorized personnel", "Maintain records for customer-performed maintenance and vendor activities"],
    "3.7.4":  ["Approve/coordinate maintenance windows and ensure authorized personnel", "Maintain records for customer-performed maintenance and vendor activities"],
    "3.7.5":  ["Approve/coordinate maintenance windows and ensure authorized personnel", "Maintain records for customer-performed maintenance and vendor activities"],
    "3.7.6":  ["Approve/coordinate maintenance windows and ensure authorized personnel", "Maintain records for customer-performed maintenance and vendor activities"],
    // MP (shared)
    "3.8.1":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    "3.8.2":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    "3.8.3":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    "3.8.4":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    "3.8.5":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    "3.8.6":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    "3.8.7":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    "3.8.8":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    "3.8.9":  ["Define and enforce media handling procedures for any removable media use", "Approve exceptions and ensure appropriate labeling/handling"],
    // PS (customer_managed)
    "3.9.1":  ["Personnel screening prior to access authorization", "Offboarding/termination procedures and timely access revocation", "Maintain HR records and screening attestations"],
    "3.9.2":  ["Personnel screening prior to access authorization", "Offboarding/termination procedures and timely access revocation", "Maintain HR records and screening attestations"],
    // PE (azure_inherited — customer retains boundary responsibility)
    "3.10.1": ["Maintain physical security for any customer-controlled facilities/endpoints that access the enclave (out of boundary unless explicitly included)", "Retain and present Azure Government inherited control evidence packages during assessment"],
    "3.10.2": ["Maintain physical security for any customer-controlled facilities/endpoints that access the enclave (out of boundary unless explicitly included)", "Retain and present Azure Government inherited control evidence packages during assessment"],
    "3.10.3": ["Maintain physical security for any customer-controlled facilities/endpoints that access the enclave (out of boundary unless explicitly included)", "Retain and present Azure Government inherited control evidence packages during assessment"],
    "3.10.4": ["Maintain physical security for any customer-controlled facilities/endpoints that access the enclave (out of boundary unless explicitly included)", "Retain and present Azure Government inherited control evidence packages during assessment"],
    "3.10.5": ["Maintain physical security for any customer-controlled facilities/endpoints that access the enclave (out of boundary unless explicitly included)", "Retain and present Azure Government inherited control evidence packages during assessment"],
    "3.10.6": ["Maintain physical security for any customer-controlled facilities/endpoints that access the enclave (out of boundary unless explicitly included)", "Retain and present Azure Government inherited control evidence packages during assessment"],
    // RA (shared)
    "3.11.1": ["Own and approve risk decisions (accept/transfer/avoid/mitigate)", "Maintain enterprise risk posture and context"],
    "3.11.2": ["Own and approve risk decisions (accept/transfer/avoid/mitigate)", "Maintain enterprise risk posture and context"],
    "3.11.3": ["Own and approve risk decisions (accept/transfer/avoid/mitigate)", "Maintain enterprise risk posture and context"],
    // CA (shared)
    "3.12.1": ["Schedule/perform periodic self-assessments and maintain POA&M", "Provide governance documentation and assessment records to auditors"],
    "3.12.2": ["Schedule/perform periodic self-assessments and maintain POA&M", "Provide governance documentation and assessment records to auditors"],
    "3.12.3": ["Schedule/perform periodic self-assessments and maintain POA&M", "Provide governance documentation and assessment records to auditors"],
    "3.12.4": ["Schedule/perform periodic self-assessments and maintain POA&M", "Provide governance documentation and assessment records to auditors"],
    // SC (shared)
    "3.13.1":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.2":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.3":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.4":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.5":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.6":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.7":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.8":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.9":  ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.10": ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.11": ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.12": ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.13": ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.14": ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.15": ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    "3.13.16": ["Approve exceptions and ensure secure communications policies are followed", "Maintain external connection approvals when required"],
    // SI (shared)
    "3.14.1": ["Operate patch/vulnerability cycles and respond to findings", "Approve risk acceptance where vulnerabilities cannot be remediated"],
    "3.14.2": ["Operate patch/vulnerability cycles and respond to findings", "Approve risk acceptance where vulnerabilities cannot be remediated"],
    "3.14.3": ["Operate patch/vulnerability cycles and respond to findings", "Approve risk acceptance where vulnerabilities cannot be remediated"],
    "3.14.4": ["Operate patch/vulnerability cycles and respond to findings", "Approve risk acceptance where vulnerabilities cannot be remediated"],
    "3.14.5": ["Operate patch/vulnerability cycles and respond to findings", "Approve risk acceptance where vulnerabilities cannot be remediated"],
    "3.14.6": ["Operate patch/vulnerability cycles and respond to findings", "Approve risk acceptance where vulnerabilities cannot be remediated"],
    "3.14.7": ["Operate patch/vulnerability cycles and respond to findings", "Approve risk acceptance where vulnerabilities cannot be remediated"],
  };

  const EVIDENCE_REGISTERS: Record<string, string[]> = {
    "3.1.1":  ["access_authorization", "termination"],
    "3.1.2":  ["access_authorization", "termination"],
    "3.1.3":  ["control_monitoring"],
    "3.1.4":  ["role_assignment_matrix", "sod_matrix"],
    "3.1.5":  ["access_authorization", "role_assignment_matrix", "termination"],
    "3.1.6":  ["access_authorization", "termination"],
    "3.1.7":  ["access_authorization", "termination"],
    "3.1.8":  ["control_monitoring"],
    "3.1.9":  ["control_monitoring"],
    "3.1.10": ["control_monitoring"],
    "3.1.11": ["control_monitoring"],
    "3.1.12": ["control_monitoring"],
    "3.1.13": ["control_monitoring"],
    "3.1.14": ["control_monitoring"],
    "3.1.15": ["access_authorization", "change_log", "termination"],
    "3.1.16": ["access_authorization", "change_log", "termination"],
    "3.1.17": ["control_monitoring"],
    "3.1.18": ["media_access"],
    "3.1.19": ["control_monitoring"],
    "3.1.20": ["access_authorization", "change_log"],
    "3.1.21": ["media_access"],
    "3.1.22": ["control_monitoring"],
    "3.2.1":  ["training_completion"],
    "3.2.2":  ["training_completion"],
    "3.2.3":  ["training_completion"],
    "3.3.1":  ["audit_config"],
    "3.3.2":  ["audit_config"],
    "3.3.3":  ["audit_config"],
    "3.3.4":  ["audit_config", "incident_log"],
    "3.3.5":  ["audit_log_review", "incident_log"],
    "3.3.6":  ["audit_config"],
    "3.3.7":  ["audit_config"],
    "3.3.8":  ["audit_config"],
    "3.3.9":  ["audit_config"],
    "3.4.1":  ["baseline_config", "policy_review"],
    "3.4.2":  ["baseline_config", "policy_review"],
    "3.4.3":  ["baseline_config", "policy_review"],
    "3.4.4":  ["baseline_config", "policy_review"],
    "3.4.5":  ["change_log", "assessment_findings"],
    "3.4.6":  ["change_log", "assessment_findings"],
    "3.4.7":  ["change_log", "assessment_findings"],
    "3.4.8":  ["change_log", "assessment_findings"],
    "3.4.9":  ["change_log", "assessment_findings"],
    "3.5.1":  ["access_authorization", "termination"],
    "3.5.2":  ["authenticator_mgmt", "audit_log_review"],
    "3.5.3":  ["authenticator_mgmt", "audit_log_review"],
    "3.5.4":  ["authenticator_mgmt"],
    "3.5.5":  ["authenticator_mgmt"],
    "3.5.6":  ["authenticator_mgmt"],
    "3.5.7":  ["authenticator_mgmt"],
    "3.5.8":  ["authenticator_mgmt"],
    "3.5.9":  ["authenticator_mgmt"],
    "3.5.10": ["authenticator_mgmt"],
    "3.5.11": ["authenticator_mgmt"],
    "3.6.1":  ["incident_log"],
    "3.6.2":  ["incident_log"],
    "3.6.3":  ["incident_log", "assessment_findings"],
    "3.7.1":  ["maintenance_log"],
    "3.7.2":  ["maintenance_log"],
    "3.7.3":  ["maintenance_log", "change_log"],
    "3.7.4":  ["maintenance_log", "change_log"],
    "3.7.5":  ["maintenance_log"],
    "3.7.6":  ["maintenance_log"],
    "3.8.1":  ["media_access"],
    "3.8.2":  ["media_access"],
    "3.8.3":  ["media_access"],
    "3.8.4":  ["media_access"],
    "3.8.5":  ["media_destruction"],
    "3.8.6":  ["media_destruction"],
    "3.8.7":  ["media_destruction"],
    "3.8.8":  ["media_destruction"],
    "3.8.9":  ["media_destruction"],
    "3.9.1":  ["personnel_screening"],
    "3.9.2":  ["termination"],
    "3.10.1": ["facility_access"],
    "3.10.2": ["facility_access"],
    "3.10.3": ["visitor_log"],
    "3.10.4": ["visitor_log", "facility_access"],
    "3.10.5": ["visitor_log", "facility_access"],
    "3.10.6": ["facility_access"],
    "3.11.1": ["risk_register"],
    "3.11.2": ["risk_register", "vuln_remediation"],
    "3.11.3": ["risk_register"],
    "3.12.1": ["assessment_findings", "control_monitoring"],
    "3.12.2": ["poam"],
    "3.12.3": ["assessment_findings", "control_monitoring"],
    "3.12.4": ["policy_review"],
    "3.13.1":  ["control_monitoring"],
    "3.13.2":  ["control_monitoring"],
    "3.13.3":  ["control_monitoring"],
    "3.13.4":  [],
    "3.13.5":  ["control_monitoring"],
    "3.13.6":  [],
    "3.13.7":  ["control_monitoring"],
    "3.13.8":  ["control_monitoring"],
    "3.13.9":  [],
    "3.13.10": ["control_monitoring"],
    "3.13.11": ["control_monitoring"],
    "3.13.12": ["control_monitoring"],
    "3.13.13": ["control_monitoring"],
    "3.13.14": ["control_monitoring"],
    "3.13.15": ["control_monitoring"],
    "3.13.16": ["control_monitoring"],
    "3.14.1": ["vuln_remediation", "control_monitoring"],
    "3.14.2": ["vuln_remediation", "control_monitoring"],
    "3.14.3": ["vuln_remediation", "control_monitoring"],
    "3.14.4": ["vuln_remediation", "control_monitoring"],
    "3.14.5": ["vuln_remediation", "control_monitoring"],
    "3.14.6": ["vuln_remediation", "control_monitoring"],
    "3.14.7": ["vuln_remediation", "control_monitoring", "incident_log"],
  };

  return ALL_CONTROLS.map(({ id, family, model }) => {
    const isNA = naControlIds.has(id);
    const osEvidence = OS_EVIDENCE[id];
    const title = CONTROL_TITLES[id] ?? `Control ${id}`;

    // Determine tier
    let tier: ControlTier;
    if (isNA) {
      tier = "not_applicable";
    } else if (model === "azure_inherited") {
      tier = "azure_inherited";
    } else if (model === "customer_managed") {
      tier = "customer_managed";
    } else {
      tier = "shared";
    }

    const ctrl: VaultControl = {
      controlId: id,
      family,
      familyName: FAMILY_NAMES[family] ?? family,
      title,
      sprsWeight: sprsWeight(id),
      tier,
      azureProvides: AZURE_PROVIDED[id],
      mactechProvides: MACTECH_PROVIDED[id],
      governanceDocIds: GOV_DOCS[id],
      customerRequired: CUSTOMER_REQUIRED[id],
      evidenceRegisters: EVIDENCE_REGISTERS[id],
      customerQuestion: CUSTOMER_QUESTIONS[id],
    };

    // Apply N/A justification (verbatim from CLOUD_ONLY_AZURE_PRESET)
    if (isNA) {
      ctrl.naJustification = NA_JUSTIFICATIONS.get(id);
    }

    // Apply OS evidence coverage
    if (osEvidence) {
      ctrl.technicalCoverage = osEvidence.support_level;
      ctrl.evidenceFiles = osEvidence.evidence_files;
    } else if (!isNA && tier !== "azure_inherited") {
      ctrl.technicalCoverage = "GOVERNANCE_ONLY";
    }

    return ctrl;
  });
}

export const VAULT_CONTROL_MAP: VaultControl[] = buildVaultControlMap();

// ─── Derived views (convenience accessors) ────────────────────────────────────

/** The 6 PE controls fully inherited from Azure Gov FedRAMP */
export const AZURE_INHERITED_CONTROLS = VAULT_CONTROL_MAP.filter(
  (c) => c.tier === "azure_inherited"
);

/** The 5 AT+PS controls the customer owns entirely */
export const CUSTOMER_MANAGED_CONTROLS = VAULT_CONTROL_MAP.filter(
  (c) => c.tier === "customer_managed"
);

/** The 10 N/A controls from CLOUD_ONLY_AZURE_PRESET */
export const NOT_APPLICABLE_CONTROLS = VAULT_CONTROL_MAP.filter(
  (c) => c.tier === "not_applicable"
);

/** The 99 shared controls (all shared controls including those also N/A) */
export const SHARED_CONTROLS = VAULT_CONTROL_MAP.filter(
  (c) => c.tier === "shared"
);

/** Controls the customer must attest in Phase 6 */
export const CUSTOMER_ATTESTATION_CONTROLS = VAULT_CONTROL_MAP.filter(
  (c) => c.tier === "shared" || c.tier === "customer_managed"
);

/** Controls grouped by NIST family */
export function getControlsByFamily(): Record<string, VaultControl[]> {
  return VAULT_CONTROL_MAP.reduce<Record<string, VaultControl[]>>((acc, ctrl) => {
    if (!acc[ctrl.family]) acc[ctrl.family] = [];
    acc[ctrl.family].push(ctrl);
    return acc;
  }, {});
}

/** Look up a single control by ID */
export function getControl(controlId: string): VaultControl | undefined {
  return VAULT_CONTROL_MAP.find((c) => c.controlId === controlId);
}

// ─── Integrity assertion (runs at module load, catches missing SPRS data) ─────
if (VAULT_CONTROL_MAP.length !== 110) {
  throw new Error(
    `vault-control-map: expected 110 controls, got ${VAULT_CONTROL_MAP.length}. ` +
    `Check ALL_CONTROLS array for duplicates or omissions.`
  );
}
