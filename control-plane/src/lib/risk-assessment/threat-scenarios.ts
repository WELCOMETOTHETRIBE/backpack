/**
 * Curated CUI Vault threat scenario library used by the Annual Risk
 * Assessment wizard (Phase 1).
 *
 * Each scenario is a pre-written, NIST 800-30 Rev 1 inspired risk statement
 * tailored to the canonical CUI Vault topology: Azure-hosted Windows hosts
 * inside a single subscription, EnclaveWatch service-account collectors,
 * Microsoft Entra ID + MFA in path, MDVM-backed vulnerability scanning,
 * digital-only media. Scenarios that are clearly N/A (e.g. wireless,
 * on-prem, alternate work sites) are intentionally omitted — those are
 * handled through their own N/A attestations.
 *
 * The wizard renders these as a checklist; the user picks which ones
 * apply, edits the language if needed, and assigns owner + treatment.
 * Each selection becomes a `risk_identified` entry in the risk_register.
 *
 * Suggested likelihood/impact reflect a baseline posture that has
 * compensating controls in place (MFA, MDVM, audit log review, JIT
 * RBAC). The user can override.
 */

export type Likelihood = "rare" | "unlikely" | "possible" | "likely" | "almost_certain";
export type Impact = "low" | "moderate" | "high" | "critical";
export type TreatmentStrategy = "mitigate" | "accept" | "transfer" | "avoid";

export type ThreatScenario = {
  id: string;
  category: "access" | "vulnerability" | "config" | "supply_chain" | "people" | "data" | "availability";
  title: string;
  riskStatement: string;
  threatSource: string;
  vulnerability: string;
  potentialImpact: string;
  suggestedLikelihood: Likelihood;
  suggestedImpact: Impact;
  suggestedTreatment: TreatmentStrategy;
  existingControls: string[];
  applicableControls: string[];
};

export const THREAT_SCENARIOS: ThreatScenario[] = [
  // ── ACCESS ────────────────────────────────────────────────────────────
  {
    id: "TS-001",
    category: "access",
    title: "Privileged account credential compromise",
    riskStatement:
      "An adversary obtains a privileged Entra ID account credential (admin/operator) and gains interactive access to CUI vault hosts.",
    threatSource: "External adversary; credential phishing or credential stuffing.",
    vulnerability: "Privileged account exists with broad Azure RBAC scope and is reachable through Entra ID sign-in surface.",
    potentialImpact:
      "Full read/write access to CUI on the vault host(s); ability to disable logging, exfiltrate, or destroy evidence.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "critical",
    suggestedTreatment: "mitigate",
    existingControls: [
      "MFA enforced on all privileged accounts (Entra Conditional Access mfa_in_path policy)",
      "Just-in-time elevation via PIM where applicable",
      "Sign-in risk policies block high-risk sessions",
      "Audit log review SOP catches anomalous privileged activity",
    ],
    applicableControls: ["3.1.1", "3.1.2", "3.5.3", "3.5.7", "3.5.8"],
  },
  {
    id: "TS-002",
    category: "access",
    title: "Service principal / managed identity over-permissioned",
    riskStatement:
      "A managed identity or service principal (e.g. EnclaveWatch collector MSI) accumulates Azure RBAC roles beyond least privilege and is abused to read CUI it should not see.",
    threatSource: "Insider mistake during role grant; misconfigured automation.",
    vulnerability: "Lack of periodic least-privilege review for non-human identities.",
    potentialImpact:
      "Unauthorized read of CUI by an automated process; collection scope creep that breaks the architectural isolation story.",
    suggestedLikelihood: "possible",
    suggestedImpact: "high",
    suggestedTreatment: "mitigate",
    existingControls: [
      "EnclaveWatch MSI scoped to Reader on the resource group only (verified via az role assignment list)",
      "Defender XDR API access restricted to read-only Graph app roles",
      "Quarterly identity review captured in identity_management register",
    ],
    applicableControls: ["3.1.5", "3.1.6", "3.1.7"],
  },
  {
    id: "TS-003",
    category: "access",
    title: "Stale or orphaned account left active",
    riskStatement:
      "A departed contractor's Entra ID account, an old service account, or a tenant-orphan MSI is left enabled and is later abused for access.",
    threatSource: "Insider mistake or external adversary discovering a forgotten identity.",
    vulnerability: "Joiner/Mover/Leaver workflow does not consistently disable identities tied to vault access.",
    potentialImpact:
      "Unmonitored adversary foothold; bypass of the MFA-in-path control if the stale account predates the policy.",
    suggestedLikelihood: "possible",
    suggestedImpact: "high",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Monthly identity_management register review",
      "EnclaveWatch flags inactive privileged accounts >30d in weekly review packet",
      "Tenant-merge cleanup completed 2026-04 (orphaned MSIs from old tenant removed)",
    ],
    applicableControls: ["3.1.1", "3.5.6"],
  },
  {
    id: "TS-004",
    category: "access",
    title: "MFA bypass via legacy authentication or enrolled device theft",
    riskStatement:
      "MFA is bypassed because a legacy auth protocol is reachable, an enrolled device (phone with Authenticator app) is stolen and unlocked, or a session token is exfiltrated and replayed.",
    threatSource: "External adversary; sophisticated credential theft.",
    vulnerability: "Legacy auth not fully blocked; session-token theft via malware on a managed endpoint.",
    potentialImpact: "Sign-in to CUI vault with valid MFA factor; full credentialed access.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "critical",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Entra Conditional Access blocks legacy auth (mfa_in_path attestation)",
      "Sign-in frequency control on privileged sessions",
      "Continuous Access Evaluation revokes tokens on risk events",
    ],
    applicableControls: ["3.5.3", "3.5.7", "3.5.8"],
  },

  // ── VULNERABILITY ────────────────────────────────────────────────────
  {
    id: "TS-101",
    category: "vulnerability",
    title: "Critical CVE remains unpatched past remediation SLA",
    riskStatement:
      "An MDVM-detected critical or high CVE on a CUI vault host remains in 'open' remediation status beyond the documented 14/30-day SLA.",
    threatSource: "External adversary leveraging public exploit code.",
    vulnerability: "Patch deferred for operational reasons; remediation tracking missed in cadence.",
    potentialImpact: "Remote code execution on a CUI vault host; potential CUI exfiltration.",
    suggestedLikelihood: "possible",
    suggestedImpact: "high",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Microsoft Defender Vulnerability Management (MDVM) weekly cadence pushes findings into vuln_remediation register",
      "Codex 3.11.2/3.11.3 status auto-recompute on every MDVM upload",
      "Open critical+high count surfaced on Monitoring dashboard Host Vitals strip",
    ],
    applicableControls: ["3.11.2", "3.11.3", "3.14.1"],
  },
  {
    id: "TS-102",
    category: "vulnerability",
    title: "MDVM scan cadence breaks (weekly miss)",
    riskStatement:
      "MDVM cadence stops producing scan evidenceRuns for >14 days, leaving the vault without recent vulnerability visibility.",
    threatSource: "Operational gap; collector token expiry; Azure permission drift.",
    vulnerability: "Cadence health depends on a single collector identity and one upload pathway.",
    potentialImpact:
      "Newly published CVEs go undetected on the vault; 3.11.2 evidence pipeline staleness; assessor finding.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "moderate",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Monitoring dashboard freshness pill turns amber at 8d and red at 21d",
      "EnclaveWatch agent retries failed uploads with exponential backoff",
      "Token rotation procedure documented in EnclaveWatch runbook",
    ],
    applicableControls: ["3.11.2"],
  },
  {
    id: "TS-103",
    category: "vulnerability",
    title: "Zero-day exploited before MDVM signature published",
    riskStatement:
      "A zero-day vulnerability is exploited on a CUI vault host before Microsoft publishes detection/remediation guidance through MDVM.",
    threatSource: "Sophisticated adversary; nation-state-grade exploitation.",
    vulnerability: "Inherent gap between vulnerability discovery and signature publication.",
    potentialImpact: "Initial access; subsequent lateral movement bounded by architectural isolation.",
    suggestedLikelihood: "rare",
    suggestedImpact: "critical",
    suggestedTreatment: "accept",
    existingControls: [
      "Defender for Endpoint EDR provides behavioral detection independent of CVE signatures",
      "Architectural isolation limits blast radius (vault has no inbound from corp)",
      "Audit log review SOP looks for anomalous behavior independent of CVE",
    ],
    applicableControls: ["3.14.1", "3.14.2", "3.14.6"],
  },

  // ── CONFIG ───────────────────────────────────────────────────────────
  {
    id: "TS-201",
    category: "config",
    title: "Hardening baseline drift on CUI vault host",
    riskStatement:
      "A CUI vault host drifts from the documented Windows Server hardening baseline (e.g., a debug setting left on, an unintended firewall rule added) without being caught by configuration management.",
    threatSource: "Operational mistake; emergency change without ticket.",
    vulnerability: "Manual change applied that isn't reflected in the configuration baseline.",
    potentialImpact: "Weakened defensive posture; opens new attack surface; baseline non-compliance.",
    suggestedLikelihood: "possible",
    suggestedImpact: "moderate",
    suggestedTreatment: "mitigate",
    existingControls: [
      "windows_server_hardening evidenceRuns cadence runs the OS validator weekly",
      "Hardening pass/total visible on Monitoring dashboard Host Vitals strip",
      "Configuration baseline tracked as artifact in configuration_management register",
    ],
    applicableControls: ["3.4.1", "3.4.2", "3.4.6"],
  },
  {
    id: "TS-202",
    category: "config",
    title: "Audit logging disabled or pipeline broken",
    riskStatement:
      "Windows audit policies are disabled, the EnclaveWatch audit collector is stopped, or the manifest pipeline breaks, producing days/weeks of missing audit evidence.",
    threatSource: "Insider tampering; software fault; collector service crash.",
    vulnerability: "Audit pipeline visibility relies on a single collector service per host.",
    potentialImpact: "No detection of malicious activity during the gap; assessor finding on §3.3 family.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "high",
    suggestedTreatment: "mitigate",
    existingControls: [
      "EnclaveWatch daily-manifest cadence with 24h freshness window",
      "Manifest hash verification catches tampering",
      "Codex Monitoring dashboard alerts on cadence breakage",
      "Independent review (quarterly) examines audit pipeline health",
    ],
    applicableControls: ["3.3.1", "3.3.2", "3.3.4", "3.3.5", "3.3.8"],
  },
  {
    id: "TS-203",
    category: "config",
    title: "Backup encryption or retention misconfigured",
    riskStatement:
      "Azure Backup recovery vault is configured with insufficient retention, or backup data is not encrypted at rest with customer-managed keys.",
    threatSource: "Configuration mistake during initial setup; adversary attempts ransomware-style encryption-of-backups.",
    vulnerability: "Backup configuration not periodically validated against the documented standard.",
    potentialImpact:
      "Loss of CUI restore capability after a destructive event; non-compliance with media protection retention obligations.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "high",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Azure Backup configured with 30d short-term + 7y long-term retention",
      "Soft delete + immutable vault enabled",
      "azure_managed_disposal attestation covers digital media disposal path",
    ],
    applicableControls: ["3.8.9"],
  },

  // ── SUPPLY_CHAIN ─────────────────────────────────────────────────────
  {
    id: "TS-301",
    category: "supply_chain",
    title: "Compromised Microsoft / Azure platform component",
    riskStatement:
      "A platform-level compromise of Microsoft (Entra ID, Azure compute, Defender XDR API) impacts the CUI vault tenancy.",
    threatSource: "Sophisticated adversary targeting cloud provider.",
    vulnerability: "Inherent shared-fate of any Azure-resident workload.",
    potentialImpact:
      "Loss of tenancy isolation; mass authentication or telemetry compromise. Largely outside customer remediation scope.",
    suggestedLikelihood: "rare",
    suggestedImpact: "critical",
    suggestedTreatment: "transfer",
    existingControls: [
      "Microsoft FedRAMP High / DoD IL5 (commercial Azure equivalent) provides residual assurance",
      "Customer-managed encryption keys reduce trust dependency on platform key management",
      "External system connection register tracks Microsoft-to-customer trust boundaries",
    ],
    applicableControls: ["3.1.20", "3.13.16"],
  },
  {
    id: "TS-302",
    category: "supply_chain",
    title: "EnclaveWatch / Codex software defect introduces evidence gap",
    riskStatement:
      "A defect in EnclaveWatch collector code or Codex evidence-engine ingestion causes silent loss of evidenceRuns or register entries.",
    threatSource: "Software defect; regression introduced in release.",
    vulnerability: "Both products are first-party software with limited deployed user base.",
    potentialImpact: "Compliance evidence gaps not visible to operator; downstream assessor finding.",
    suggestedLikelihood: "possible",
    suggestedImpact: "moderate",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Canonical scripts pinned at git tag enclavewatch-canonical-2026-05-02",
      "Independent quarterly review (Q2 2026 was first) examines ingestion completeness",
      "Codex dashboard freshness pills surface stale cadences within days",
    ],
    applicableControls: ["3.11.2", "3.14.1"],
  },

  // ── PEOPLE ───────────────────────────────────────────────────────────
  {
    id: "TS-401",
    category: "people",
    title: "Insider with legitimate access exfiltrates CUI",
    riskStatement:
      "A privileged user with legitimate vault access copies CUI to unauthorized media or external destinations.",
    threatSource: "Malicious insider; disgruntled employee.",
    vulnerability: "Privileged access is necessary for operations; cannot be eliminated.",
    potentialImpact: "Direct CUI disclosure; reputational and contractual exposure.",
    suggestedLikelihood: "rare",
    suggestedImpact: "high",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Audit log review SOP looks for high-volume read/copy events",
      "Defender for Cloud Apps DLP policy on outbound channels",
      "Quarterly access review confirms least-privilege scope",
      "Personnel screening in hiring (separate HR control)",
    ],
    applicableControls: ["3.1.1", "3.1.5", "3.3.5", "3.9.1"],
  },
  {
    id: "TS-402",
    category: "people",
    title: "Untrained user mishandles CUI",
    riskStatement:
      "A user newly granted vault access mishandles CUI (e.g. emails to wrong recipient, prints to non-vault printer) due to insufficient training or unclear marking.",
    threatSource: "Operational mistake by authorized user.",
    vulnerability: "Onboarding training cadence may not catch transient access grants.",
    potentialImpact: "CUI disclosure to unauthorized party; reportable incident.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "moderate",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Annual security awareness training tracked in training_records register",
      "CUI handling specifically covered in onboarding module",
      "Visual marking standards enforced via document templates",
    ],
    applicableControls: ["3.2.1", "3.2.2", "3.2.3"],
  },
  {
    id: "TS-403",
    category: "people",
    title: "Phishing leads to malware on endpoint with vault access",
    riskStatement:
      "A user with vault access is successfully phished; malware lands on their endpoint and harvests credentials or session tokens.",
    threatSource: "External adversary; commodity phishing or targeted spearphish.",
    vulnerability: "Endpoint is the same device that authenticates to the vault.",
    potentialImpact: "Credential or session compromise; vault access via a now-untrusted endpoint.",
    suggestedLikelihood: "possible",
    suggestedImpact: "high",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Defender for Endpoint EDR with automated investigation/response",
      "Conditional Access requires compliant device for vault sign-in",
      "Phishing-resistant MFA (FIDO2 / Windows Hello for Business) for privileged users",
      "Quarterly phishing simulation and remedial training",
    ],
    applicableControls: ["3.2.1", "3.5.3", "3.14.2"],
  },

  // ── DATA ─────────────────────────────────────────────────────────────
  {
    id: "TS-501",
    category: "data",
    title: "CUI leakage via screenshot / clipboard / copy-paste",
    riskStatement:
      "Authorized vault users intentionally or accidentally copy CUI out of the vault session via clipboard or screenshot to non-vault contexts.",
    threatSource: "Insider mistake or malicious action.",
    vulnerability: "Standard Windows session permits screen capture and clipboard sharing.",
    potentialImpact: "CUI disclosure outside the boundary; weakens architectural isolation guarantee.",
    suggestedLikelihood: "possible",
    suggestedImpact: "moderate",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Vault host configured with clipboard redirection disabled in RDP/AVD policy",
      "Session recording enabled on privileged sessions",
      "DLP policy on outbound email blocks CUI markers",
    ],
    applicableControls: ["3.1.3", "3.1.4", "3.13.2"],
  },
  {
    id: "TS-502",
    category: "data",
    title: "Encryption at rest misconfigured (key not customer-managed)",
    riskStatement:
      "CUI volumes end up using Microsoft-managed keys instead of customer-managed keys, weakening the cryptographic boundary the customer controls.",
    threatSource: "Configuration drift; default behavior on new disk attach.",
    vulnerability: "New disks default to platform-managed keys unless explicitly configured.",
    potentialImpact: "Reduced crypto sovereignty; potential 3.13.11 finding.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "moderate",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Azure Policy enforces customer-managed keys on managed disks in the vault subscription",
      "Disk encryption status surfaced in monthly compliance scan",
      "FIPS 140-2 validated module attestation on file (FIPS validation)",
    ],
    applicableControls: ["3.13.8", "3.13.11"],
  },

  // ── AVAILABILITY ─────────────────────────────────────────────────────
  {
    id: "TS-601",
    category: "availability",
    title: "Ransomware encrypts CUI data on vault host",
    riskStatement:
      "Ransomware reaches a vault host (via phished credential or supply-chain compromise) and encrypts CUI data, demanding payment for restore.",
    threatSource: "External adversary; commodity or targeted ransomware.",
    vulnerability: "Vault hosts run general-purpose Windows; cannot be made fully read-only.",
    potentialImpact: "Loss of CUI availability; potential extortion-driven secondary disclosure.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "critical",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Azure Backup with immutable vault + soft delete = adversary cannot delete backups",
      "Defender for Endpoint EDR with automated remediation blocks known ransomware families",
      "Incident Response runbook covers ransomware specifically (tabletop exercise scheduled annually)",
      "Network segmentation limits lateral movement off the initial host",
    ],
    applicableControls: ["3.6.1", "3.6.2", "3.14.2"],
  },
  {
    id: "TS-602",
    category: "availability",
    title: "Azure region or platform outage affects vault",
    riskStatement:
      "An Azure regional outage or platform incident makes the CUI vault inaccessible for an extended period.",
    threatSource: "Cloud provider availability event.",
    vulnerability: "Vault is single-region for cost reasons.",
    potentialImpact: "Loss of operational use of CUI; missed contractual deadlines.",
    suggestedLikelihood: "unlikely",
    suggestedImpact: "moderate",
    suggestedTreatment: "accept",
    existingControls: [
      "Azure region SLA + Microsoft platform redundancy",
      "Backup data replicated to paired region (geo-redundant)",
      "Documented manual failover procedure for cross-region restore in extreme cases",
    ],
    applicableControls: ["3.8.9"],
  },
  {
    id: "TS-603",
    category: "availability",
    title: "EnclaveWatch service halt blocks compliance evidence",
    riskStatement:
      "The EnclaveWatch Windows service stops on the vault host (crash, manual stop, OS update) and no telemetry/manifests reach Codex.",
    threatSource: "Software fault, OS update, operator error.",
    vulnerability: "Single Windows service per host is the canonical evidence pipeline.",
    potentialImpact: "Compliance evidence gap; cadence freshness goes red on Codex Monitoring dashboard.",
    suggestedLikelihood: "possible",
    suggestedImpact: "moderate",
    suggestedTreatment: "mitigate",
    existingControls: [
      "Service auto-restart on failure (Windows SCM recovery actions)",
      "Codex Monitoring dashboard freshness pill turns amber at 8d, red at 21d",
      "EnclaveWatch heartbeats logged in evidenceRuns; gap is detectable",
    ],
    applicableControls: ["3.3.4", "3.14.1"],
  },
];

export const SCENARIO_CATEGORIES: { id: ThreatScenario["category"]; label: string }[] = [
  { id: "access", label: "Access & Identity" },
  { id: "vulnerability", label: "Vulnerability" },
  { id: "config", label: "Configuration & Logging" },
  { id: "supply_chain", label: "Supply Chain" },
  { id: "people", label: "People & Process" },
  { id: "data", label: "Data Handling" },
  { id: "availability", label: "Availability" },
];

export function scenarioById(id: string): ThreatScenario | undefined {
  return THREAT_SCENARIOS.find((s) => s.id === id);
}
