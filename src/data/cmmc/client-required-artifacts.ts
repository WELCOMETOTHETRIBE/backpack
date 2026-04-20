/**
 * Client-required artifact catalog for CMMC L2 / NIST 800-171 Rev 2.
 *
 * This file is the single source of truth for the artifacts the *client* must
 * produce for each control, ON TOP OF what MacTech delivers (technical OS &
 * Cloud evidence metadata via the OS Collector, Azure Gov / FedRAMP High
 * inheritance evidence, and governing Policies / Procedures).
 *
 * Used by `src/lib/onboarding/generate-client-poams.ts` to auto-generate open
 * POA&M entries at onboarding completion, so the customer has a concrete,
 * actionable worklist of deliverables the moment the wizard finishes.
 *
 * Controls with `milestones: []` are fully vendor-covered and will NOT get a
 * POAM. Controls with milestones get one POAM per control, with one milestone
 * per distinct deliverable.
 */

export type ClientArtifactClosureType =
  | "upload"
  | "attestation"
  | "register_pointer"
  | "system_pointer";

export type ClientArtifactEvidenceType =
  | "certificate"
  | "roster"
  | "log"
  | "photo"
  | "scan_report"
  | "report"
  | "attestation_letter"
  | "ticket"
  | "fips_cert"
  | "diagram"
  | "plan"
  | "policy_exception"
  | "checklist";

export type ClientArtifactCadence =
  | "one_time"
  | "monthly"
  | "quarterly"
  | "annual"
  | "per_event"
  | "continuous";

export type ClientArtifactInheritance = "client" | "shared";

export type ClientArtifactMilestone = {
  /** Stable id, e.g. "AC.3.1.1.user_roster". */
  key: string;
  title: string;
  description: string;
  closureType: ClientArtifactClosureType;
  evidenceType: ClientArtifactEvidenceType;
  cadence: ClientArtifactCadence;
  /** Days from onboarding completion when this milestone is due. */
  dueOffsetDays: number;
  inheritanceSource: ClientArtifactInheritance;
  /** Populated when closureType === "register_pointer". */
  registerKey?: string;
};

export type ControlClientArtifacts = {
  controlId: string;
  family:
    | "AC" | "AT" | "AU" | "CM" | "IA" | "IR" | "MA" | "MP"
    | "PS" | "PE" | "RA" | "CA" | "SC" | "SI";
  /** Short human-readable summary used in the POAM weakness description. */
  weaknessSummary: string;
  milestones: ClientArtifactMilestone[];
};

// ----------------------------------------------------------------------------
// Helper shorthand for building milestone entries without repeating defaults.
// ----------------------------------------------------------------------------
const M = (
  key: string,
  title: string,
  description: string,
  opts: Partial<ClientArtifactMilestone> & {
    evidenceType: ClientArtifactEvidenceType;
    cadence: ClientArtifactCadence;
    dueOffsetDays: number;
  }
): ClientArtifactMilestone => ({
  key,
  title,
  description,
  closureType: opts.closureType ?? "upload",
  evidenceType: opts.evidenceType,
  cadence: opts.cadence,
  dueOffsetDays: opts.dueOffsetDays,
  inheritanceSource: opts.inheritanceSource ?? "client",
  registerKey: opts.registerKey,
});

// ============================================================================
// CATALOG
// ============================================================================

export const CLIENT_REQUIRED_ARTIFACTS: ControlClientArtifacts[] = [
  // --------------------------------------------------------------------------
  // AC — Access Control (3.1.1 – 3.1.22)
  // --------------------------------------------------------------------------
  {
    controlId: "3.1.1",
    family: "AC",
    weaknessSummary:
      "Client must evidence authorized-user management: roster reconciled to HR system, account lifecycle tickets, and signed access authorizations.",
    milestones: [
      M(
        "AC.3.1.1.user_roster",
        "Upload authorized user roster reconciled to HR system of record",
        "Export the current authorized user list from your IdP and reconcile it to your HR system. Upload the reconciled roster (CSV/PDF) with a dated cover page and the reconciler's signature.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 30 }
      ),
      M(
        "AC.3.1.1.lifecycle_tickets",
        "Upload account lifecycle ticket samples (create / modify / disable / delete)",
        "Provide at least one ticket sample per lifecycle action within the last 90 days, showing requester, approver, and timestamp.",
        { evidenceType: "ticket", cadence: "continuous", dueOffsetDays: 60 }
      ),
      M(
        "AC.3.1.1.access_authorizations",
        "Finalize access-authorization register entries for every active account",
        "Populate the Access Authorizations register with an entry per active account (user, role, justification, approver, date).",
        {
          closureType: "register_pointer",
          evidenceType: "roster",
          cadence: "continuous",
          dueOffsetDays: 45,
          registerKey: "access_authorizations",
        }
      ),
      M(
        "AC.3.1.1.quarterly_review",
        "Upload the most recent quarterly access review sign-off",
        "Conduct a quarterly access review and upload the signed review record (reviewer name, date, accounts reviewed, exceptions).",
        { evidenceType: "report", cadence: "quarterly", dueOffsetDays: 90 }
      ),
    ],
  },
  {
    controlId: "3.1.2",
    family: "AC",
    weaknessSummary:
      "Client must evidence that access enforcement is tied to transaction/function authorizations with quarterly reviews.",
    milestones: [
      M(
        "AC.3.1.2.approved_privileges",
        "Upload list of approved user privileges and authorizations",
        "Export the RBAC matrix showing which roles may perform which transactions/functions, signed by the system owner.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 45 }
      ),
      M(
        "AC.3.1.2.quarterly_review",
        "Upload quarterly access review evidence for enforced transactions/functions",
        "Provide the review record demonstrating enforced privileges were verified against authorization baselines.",
        { evidenceType: "report", cadence: "quarterly", dueOffsetDays: 90 }
      ),
    ],
  },
  {
    controlId: "3.1.3",
    family: "AC",
    weaknessSummary:
      "Client must document CUI flow control decisions between internal components and external partners.",
    milestones: [
      M(
        "AC.3.1.3.cui_flow_decisions",
        "Upload CUI flow decisions (who may send CUI to whom, internally and externally)",
        "Document approved CUI flows in a table/diagram with sender, receiver, transport, encryption, and approving official.",
        { evidenceType: "diagram", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.4",
    family: "AC",
    weaknessSummary:
      "Client must evidence separation of duties for sensitive functions beyond policy text.",
    milestones: [
      M(
        "AC.3.1.4.sod_matrix",
        "Finalize separation-of-duties matrix register entries",
        "Populate the Separation of Duties Matrix register identifying conflicting duties and the individuals/roles assigned to each.",
        {
          closureType: "register_pointer",
          evidenceType: "roster",
          cadence: "annual",
          dueOffsetDays: 60,
          registerKey: "separation_of_duties_matrix",
        }
      ),
    ],
  },
  {
    controlId: "3.1.5",
    family: "AC",
    weaknessSummary:
      "Client must maintain a privileged user list with written justification per account and quarterly review.",
    milestones: [
      M(
        "AC.3.1.5.privileged_user_list",
        "Upload privileged user list with written justification per account",
        "For every privileged account (local admin, domain admin, security admin, DB admin, etc.) provide the user, business justification, and approving official.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 30 }
      ),
      M(
        "AC.3.1.5.privileged_review",
        "Upload quarterly privileged account review sign-off",
        "Reviewer attests each privileged account is still justified. Upload the signed review.",
        { evidenceType: "report", cadence: "quarterly", dueOffsetDays: 90 }
      ),
    ],
  },
  {
    controlId: "3.1.6",
    family: "AC",
    weaknessSummary:
      "Client must attest that privileged users use non-privileged accounts for non-privileged work.",
    milestones: [
      M(
        "AC.3.1.6.nonpriv_attestation",
        "Upload signed attestation that privileged users hold separate non-privileged accounts for routine work",
        "System owner-signed attestation letter listing each privileged user and their paired non-privileged account.",
        { closureType: "attestation", evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 45 }
      ),
    ],
  },
  {
    controlId: "3.1.7",
    family: "AC",
    weaknessSummary: "",
    milestones: [],
  },
  { controlId: "3.1.8", family: "AC", weaknessSummary: "", milestones: [] },
  { controlId: "3.1.9", family: "AC", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.1.10",
    family: "AC",
    weaknessSummary:
      "Client must attest session lock is configured on endpoints operating outside the vault (laptops, workstations).",
    milestones: [
      M(
        "AC.3.1.10.session_lock_attestation",
        "Upload signed session-lock configuration attestation for client-managed endpoints",
        "Document the session lock timeout configured on every laptop/workstation accessing the vault, with MDM/GPO screenshot evidence.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.11",
    family: "AC",
    weaknessSummary:
      "Client must attest session termination is enforced on client-managed endpoints.",
    milestones: [
      M(
        "AC.3.1.11.session_termination_attestation",
        "Upload session-termination configuration attestation for client-managed endpoints",
        "Document the idle/forced-termination policy for endpoints outside the vault.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.12",
    family: "AC",
    weaknessSummary:
      "Client must maintain remote access authorizations per user with approval records.",
    milestones: [
      M(
        "AC.3.1.12.remote_access_auth",
        "Upload remote access authorization list (per user, with approver)",
        "Every user permitted to remote into CUI systems must have a signed authorization on file with approver and date.",
        { evidenceType: "roster", cadence: "annual", dueOffsetDays: 45 }
      ),
    ],
  },
  {
    controlId: "3.1.13",
    family: "AC",
    weaknessSummary:
      "Client must evidence cryptographic protection of remote access sessions on client endpoints.",
    milestones: [
      M(
        "AC.3.1.13.remote_crypto_attestation",
        "Upload attestation of FIPS-validated crypto used on client-side remote access (VPN / RDP gateway)",
        "Attestation naming the VPN/RDP gateway product, FIPS validation certificate number, and cipher suite enforced.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.14",
    family: "AC",
    weaknessSummary:
      "Client must document routing of remote access through managed access control points.",
    milestones: [
      M(
        "AC.3.1.14.managed_ap_diagram",
        "Upload diagram showing remote access routed through managed access control points",
        "Network diagram identifying the managed gateway/VPN concentrator that all remote access traverses.",
        { evidenceType: "diagram", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.15",
    family: "AC",
    weaknessSummary:
      "Client must authorize remote execution of privileged commands and access to security-relevant information.",
    milestones: [
      M(
        "AC.3.1.15.privileged_remote_auth",
        "Upload remote privileged-command authorization list",
        "Per-user authorization to execute privileged commands remotely, with approver, scope, and expiration.",
        { evidenceType: "roster", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.16",
    family: "AC",
    weaknessSummary:
      "Client must authorize wireless access and document approved SSIDs (if wireless is in scope).",
    milestones: [
      M(
        "AC.3.1.16.wireless_ssid_auth",
        "Upload wireless device / SSID authorization list (or signed 'no wireless in scope' attestation)",
        "If wireless is in scope, list every approved SSID and its purpose. If not, upload a signed attestation that no wireless network is used for CUI.",
        { evidenceType: "roster", cadence: "annual", dueOffsetDays: 45 }
      ),
    ],
  },
  {
    controlId: "3.1.17",
    family: "AC",
    weaknessSummary:
      "Client must evidence wireless protections (WPA2/WPA3 Enterprise, authentication) or attest no wireless in scope.",
    milestones: [
      M(
        "AC.3.1.17.wireless_protection",
        "Upload wireless protection configuration evidence (or 'no wireless' attestation)",
        "Screenshot or config export of wireless authentication/encryption settings, or the 'no wireless in scope' attestation.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.18",
    family: "AC",
    weaknessSummary:
      "Client must maintain a mobile device authorization list and connection controls.",
    milestones: [
      M(
        "AC.3.1.18.mobile_auth_list",
        "Upload mobile device authorization list",
        "Every mobile device (phone, tablet) authorized to touch CUI must appear on this list with user, device model, OS, MDM enrollment date.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 45 }
      ),
    ],
  },
  {
    controlId: "3.1.19",
    family: "AC",
    weaknessSummary:
      "Client must evidence encryption of CUI on mobile devices / platforms.",
    milestones: [
      M(
        "AC.3.1.19.mobile_crypto_attestation",
        "Upload attestation of FIPS-validated encryption on mobile devices holding CUI",
        "Attestation naming the mobile encryption solution and FIPS cert, or signed 'no CUI on mobile' attestation.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.20",
    family: "AC",
    weaknessSummary:
      "Client must authorize external connections and document the CUI flow with external systems.",
    milestones: [
      M(
        "AC.3.1.20.external_connections",
        "Upload external system connection authorizations and ISAs",
        "Every authorized external connection (vendor, partner, customer) must have a signed ISA/MOU on file.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  {
    controlId: "3.1.21",
    family: "AC",
    weaknessSummary:
      "Client must limit use of portable storage on external systems and document the authorization.",
    milestones: [
      M(
        "AC.3.1.21.portable_storage_auth",
        "Upload portable storage authorization list (or 'no portable storage' attestation)",
        "List of users authorized to use portable storage with CUI and the devices assigned, or signed 'prohibited' attestation.",
        { evidenceType: "roster", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.1.22",
    family: "AC",
    weaknessSummary:
      "Client must maintain an authorized publicly accessible content list and review it.",
    milestones: [
      M(
        "AC.3.1.22.public_content_list",
        "Upload authorized publicly accessible content list + latest review log",
        "List of company websites/portals where public content is posted, with a signed review log demonstrating the last scrub for CUI.",
        { evidenceType: "report", cadence: "quarterly", dueOffsetDays: 45 }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // AT — Awareness & Training (3.2.1 – 3.2.3)
  // --------------------------------------------------------------------------
  {
    controlId: "3.2.1",
    family: "AT",
    weaknessSummary:
      "Client must provide initial + annual security awareness training certificates for every user, reconciled to the user roster.",
    milestones: [
      M(
        "AT.3.2.1.initial_annual_certs",
        "Upload initial + annual security awareness training certificates for every user",
        "One certificate per user (PDF), or an LMS completion export listing every user with completion date and score.",
        { evidenceType: "certificate", cadence: "annual", dueOffsetDays: 60 }
      ),
      M(
        "AT.3.2.1.training_roster_reconciliation",
        "Upload training roster reconciled to authorized user roster (gap report)",
        "Side-by-side of completions vs. authorized-user roster with explicit gap list and remediation plan for any missing user.",
        {
          closureType: "register_pointer",
          evidenceType: "report",
          cadence: "annual",
          dueOffsetDays: 75,
          registerKey: "training_completion",
        }
      ),
    ],
  },
  {
    controlId: "3.2.2",
    family: "AT",
    weaknessSummary:
      "Client must provide role-based training certificates for privileged users, IR team, and sysadmins.",
    milestones: [
      M(
        "AT.3.2.2.role_based_certs",
        "Upload role-based training certificates (privileged users, IR team, sysadmins)",
        "Role-specific training certs (e.g., secure admin training for sysadmins, IR tabletop participation certs for IR members).",
        { evidenceType: "certificate", cadence: "annual", dueOffsetDays: 90 }
      ),
    ],
  },
  {
    controlId: "3.2.3",
    family: "AT",
    weaknessSummary:
      "Client must provide insider threat training completion records.",
    milestones: [
      M(
        "AT.3.2.3.insider_threat_certs",
        "Upload insider threat training completion records for all users",
        "LMS export or per-user certificates covering insider threat awareness training within the last 12 months.",
        { evidenceType: "certificate", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // AU — Audit & Accountability (3.3.1 – 3.3.9)
  // --------------------------------------------------------------------------
  {
    controlId: "3.3.1",
    family: "AU",
    weaknessSummary:
      "Client must document the audit record retention period decision.",
    milestones: [
      M(
        "AU.3.3.1.retention_decision",
        "Upload signed record of the audit-log retention period decision",
        "Management memo naming the retention period (minimum 90 days online, 1 year archive per DFARS) and the risk rationale.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 45 }
      ),
    ],
  },
  { controlId: "3.3.2", family: "AU", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.3.3",
    family: "AU",
    weaknessSummary:
      "Client must designate an audit-log reviewer and maintain sign-off records for periodic reviews.",
    milestones: [
      M(
        "AU.3.3.3.reviewer_letter",
        "Upload designated audit log reviewer assignment letter",
        "Signed letter naming the individual(s) responsible for reviewing audit logs, the cadence, and escalation path.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 30 }
      ),
      M(
        "AU.3.3.3.review_signoffs",
        "Finalize audit log review sign-off register entries (weekly / monthly)",
        "The vault generates logs; the client must review and document it. Finalize sign-off entries per configured cadence.",
        {
          closureType: "register_pointer",
          evidenceType: "log",
          cadence: "monthly",
          dueOffsetDays: 45,
          registerKey: "audit_log_review_records",
        }
      ),
    ],
  },
  {
    controlId: "3.3.4",
    family: "AU",
    weaknessSummary:
      "Client must maintain tickets documenting response to audit process failures.",
    milestones: [
      M(
        "AU.3.3.4.audit_failure_tickets",
        "Upload audit failure response ticket samples (or 'no failures' attestation for the period)",
        "Ticket samples showing detection, response, and closure of audit-logging failures in the last 12 months.",
        { evidenceType: "ticket", cadence: "per_event", dueOffsetDays: 90 }
      ),
    ],
  },
  { controlId: "3.3.5", family: "AU", weaknessSummary: "", milestones: [] },
  { controlId: "3.3.6", family: "AU", weaknessSummary: "", milestones: [] },
  { controlId: "3.3.7", family: "AU", weaknessSummary: "", milestones: [] },
  { controlId: "3.3.8", family: "AU", weaknessSummary: "", milestones: [] },
  { controlId: "3.3.9", family: "AU", weaknessSummary: "", milestones: [] },

  // --------------------------------------------------------------------------
  // CM — Configuration Management (3.4.1 – 3.4.9)
  // --------------------------------------------------------------------------
  {
    controlId: "3.4.1",
    family: "CM",
    weaknessSummary:
      "Client must maintain a full asset inventory (endpoints, mobile devices, network gear) beyond the vault itself.",
    milestones: [
      M(
        "CM.3.4.1.asset_inventory",
        "Upload full asset inventory (endpoints, mobile devices, network gear)",
        "CSV or report enumerating every asset touching CUI with categorization (CUI Asset, SPA, CRMA, Specialized, Out-of-Scope), owner, and baseline OS.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 45 }
      ),
      M(
        "CM.3.4.1.endpoint_baselines",
        "Upload endpoint baseline configurations for all Windows/Mac laptops accessing the vault",
        "The CIS/STIG baseline applied, the GPO/MDM profile export showing it, and the date of last compliance scan.",
        { evidenceType: "report", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  {
    controlId: "3.4.2",
    family: "CM",
    weaknessSummary:
      "Client must enforce endpoint security configuration settings (baselines).",
    milestones: [
      M(
        "CM.3.4.2.baseline_enforcement",
        "Upload endpoint baseline enforcement evidence (MDM/GPO compliance report)",
        "Compliance report from your MDM or GPO showing deviations and remediation for every in-scope endpoint.",
        { evidenceType: "report", cadence: "quarterly", dueOffsetDays: 75 }
      ),
    ],
  },
  {
    controlId: "3.4.3",
    family: "CM",
    weaknessSummary:
      "Client must evidence change management for the client environment (laptops, network changes, endpoints).",
    milestones: [
      M(
        "CM.3.4.3.change_tickets",
        "Upload change management ticket samples from the client environment",
        "At least 3 representative change tickets (last 90 days) showing request, approval, test, deploy, and validation steps.",
        { evidenceType: "ticket", cadence: "continuous", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.4.4", family: "CM", weaknessSummary: "", milestones: [] },
  { controlId: "3.4.5", family: "CM", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.4.6",
    family: "CM",
    weaknessSummary:
      "Client must document least-functionality decisions (disabled ports, services, protocols) on endpoints.",
    milestones: [
      M(
        "CM.3.4.6.least_functionality",
        "Upload least functionality decisions (disabled ports, services, protocols on endpoints)",
        "A documented list of what is disabled on each endpoint class, signed by the system owner, with the business rationale.",
        { evidenceType: "report", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  { controlId: "3.4.7", family: "CM", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.4.8",
    family: "CM",
    weaknessSummary:
      "Client must maintain an approved software list and evidence deny-by-default enforcement.",
    milestones: [
      M(
        "CM.3.4.8.approved_software",
        "Upload approved software list for client endpoints",
        "Explicit allow-list (or deny-list with enforcement evidence) covering every in-scope endpoint.",
        { evidenceType: "roster", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.4.9",
    family: "CM",
    weaknessSummary:
      "Client must enforce and evidence the user-installed software policy.",
    milestones: [
      M(
        "CM.3.4.9.user_installed_software",
        "Upload user-installed software policy enforcement evidence",
        "MDM/EDR report showing unauthorized installs blocked or flagged, with remediation tickets for any violations.",
        { evidenceType: "report", cadence: "quarterly", dueOffsetDays: 60 }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // IA — Identification & Authentication (3.5.1 – 3.5.11)
  // --------------------------------------------------------------------------
  {
    controlId: "3.5.1",
    family: "IA",
    weaknessSummary:
      "Client must evidence identity proofing for new hires before account issuance.",
    milestones: [
      M(
        "IA.3.5.1.identity_proofing",
        "Upload identity proofing records for new hires",
        "HR identity verification records (I-9 receipt, signed onboarding checklist with ID verification) for every new account provisioned in the last 12 months.",
        { evidenceType: "checklist", cadence: "per_event", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.5.2", family: "IA", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.5.3",
    family: "IA",
    weaknessSummary:
      "Client must evidence MFA enrollment for every user and privileged account.",
    milestones: [
      M(
        "IA.3.5.3.mfa_roster",
        "Upload MFA enrollment roster (every user, every account)",
        "IdP export listing each user and MFA factor registered. Privileged accounts must show phishing-resistant factor.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 30 }
      ),
    ],
  },
  { controlId: "3.5.4", family: "IA", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.5.5",
    family: "IA",
    weaknessSummary:
      "Client must maintain a service/system account inventory with owners and non-reuse evidence.",
    milestones: [
      M(
        "IA.3.5.5.service_account_inventory",
        "Upload service/system account inventory with owner assignments",
        "Every service account with owner, purpose, rotation schedule, and last rotation date.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.5.6", family: "IA", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.5.7",
    family: "IA",
    weaknessSummary:
      "Client must attest to password manager deployment and/or password complexity enforcement on client endpoints.",
    milestones: [
      M(
        "IA.3.5.7.password_manager_attestation",
        "Upload password manager / complexity enforcement attestation",
        "Signed attestation naming the password manager deployed or documenting the GPO/MDM complexity enforcement on client endpoints.",
        { closureType: "attestation", evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.5.8", family: "IA", weaknessSummary: "", milestones: [] },
  { controlId: "3.5.9", family: "IA", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.5.10",
    family: "IA",
    weaknessSummary:
      "Client must evidence cryptographic protection of stored passwords on client-managed directories.",
    milestones: [
      M(
        "IA.3.5.10.password_crypto_attestation",
        "Upload attestation for cryptographically-protected password storage on client-managed identity providers",
        "If the client runs any local directory (e.g., on-prem AD hybrid), attest the hashing algorithm in use and its FIPS status.",
        { closureType: "attestation", evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  { controlId: "3.5.11", family: "IA", weaknessSummary: "", milestones: [] },

  // --------------------------------------------------------------------------
  // IR — Incident Response (3.6.1 – 3.6.3)
  // --------------------------------------------------------------------------
  {
    controlId: "3.6.1",
    family: "IR",
    weaknessSummary:
      "Client must maintain IR team roster with on-call rotation and sample incident tickets (or 'no incidents' monitoring records).",
    milestones: [
      M(
        "IR.3.6.1.ir_team_roster",
        "Upload IR team roster with contact info and on-call rotation",
        "Current roster naming each IR team member, role, phone/email, after-hours contact, and on-call weeks for the next quarter.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 30 }
      ),
      M(
        "IR.3.6.1.incident_tickets",
        "Upload sample incident tickets (or signed monitoring record for zero-incident period)",
        "At least one ticket sample per quarter. If none, a signed monitoring record explaining the zero-incident posture.",
        {
          closureType: "register_pointer",
          evidenceType: "ticket",
          cadence: "quarterly",
          dueOffsetDays: 60,
          registerKey: "incident_log",
        }
      ),
    ],
  },
  {
    controlId: "3.6.2",
    family: "IR",
    weaknessSummary:
      "Client must register with DIBNet/DC3 and maintain a Medium Assurance Certificate for incident reporting.",
    milestones: [
      M(
        "IR.3.6.2.dibnet_registration",
        "Upload DIBNet / DC3 reporting account registration proof + Medium Assurance Certificate",
        "Screenshot/email of DIBNet account confirmation plus a copy of the current ECA Medium Assurance Certificate (not the private key).",
        { evidenceType: "certificate", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  {
    controlId: "3.6.3",
    family: "IR",
    weaknessSummary:
      "Client must conduct an IR tabletop exercise at least annually and deliver an after-action report.",
    milestones: [
      M(
        "IR.3.6.3.tabletop_aar",
        "Upload IR tabletop exercise after-action report (within last 12 months)",
        "AAR covering: scenario, participants, timeline, gaps identified, and corrective actions with owners.",
        { evidenceType: "report", cadence: "annual", dueOffsetDays: 120 }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // MA — Maintenance (3.7.1 – 3.7.6)
  // --------------------------------------------------------------------------
  {
    controlId: "3.7.1",
    family: "MA",
    weaknessSummary:
      "Client must maintain maintenance logs for client-owned hardware that touches CUI.",
    milestones: [
      M(
        "MA.3.7.1.maintenance_logs",
        "Finalize maintenance log register entries for client-owned hardware",
        "Populate the Maintenance Log register with every maintenance event (scheduled and unscheduled) in the last 12 months.",
        {
          closureType: "register_pointer",
          evidenceType: "log",
          cadence: "continuous",
          dueOffsetDays: 60,
          registerKey: "maintenance_log",
        }
      ),
    ],
  },
  { controlId: "3.7.2", family: "MA", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.7.3",
    family: "MA",
    weaknessSummary:
      "Client must evidence sanitization of equipment leaving the facility for repair.",
    milestones: [
      M(
        "MA.3.7.3.sanitization_certs",
        "Upload sanitization certificates for equipment leaving the facility for repair",
        "NIST SP 800-88-compliant sanitization certificate per device (vendor-provided or in-house with chain-of-custody).",
        { evidenceType: "certificate", cadence: "per_event", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.7.4", family: "MA", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.7.5",
    family: "MA",
    weaknessSummary:
      "Client must authorize and document nonlocal maintenance sessions.",
    milestones: [
      M(
        "MA.3.7.5.nonlocal_approvals",
        "Upload nonlocal maintenance session approval records",
        "Signed approval per remote maintenance session showing approver, vendor, scope, session timestamps, and teardown confirmation.",
        { evidenceType: "ticket", cadence: "per_event", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.7.6",
    family: "MA",
    weaknessSummary:
      "Client must maintain an approved maintenance personnel list and escort records for uncleared maintenance staff.",
    milestones: [
      M(
        "MA.3.7.6.approved_personnel",
        "Upload approved maintenance personnel list",
        "Current list of approved maintenance personnel with their sponsoring organization, clearance status, and authorization scope.",
        { evidenceType: "roster", cadence: "annual", dueOffsetDays: 45 }
      ),
      M(
        "MA.3.7.6.escort_records",
        "Upload escort records for uncleared maintenance staff",
        "Signed escort log for every uncleared maintenance visit in the last 12 months.",
        { evidenceType: "log", cadence: "per_event", dueOffsetDays: 75 }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // MP — Media Protection (3.8.1 – 3.8.9)
  // --------------------------------------------------------------------------
  {
    controlId: "3.8.1",
    family: "MP",
    weaknessSummary:
      "Client must maintain a media access authorization list.",
    milestones: [
      M(
        "MP.3.8.1.media_access_list",
        "Upload media access authorization list",
        "List of users authorized to access CUI media (digital and non-digital) with their role and scope.",
        { evidenceType: "roster", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.8.2", family: "MP", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.8.3",
    family: "MP",
    weaknessSummary:
      "Client must produce NIST SP 800-88-compliant sanitization / destruction certificates per device.",
    milestones: [
      M(
        "MP.3.8.3.destruction_certs",
        "Upload media sanitization / destruction certificates (NIST SP 800-88 compliant)",
        "Vendor-provided destruction certificate per device, or in-house sanitization record with operator signature.",
        {
          closureType: "register_pointer",
          evidenceType: "certificate",
          cadence: "per_event",
          dueOffsetDays: 75,
          registerKey: "media_destruction_log",
        }
      ),
    ],
  },
  {
    controlId: "3.8.4",
    family: "MP",
    weaknessSummary:
      "Client must evidence CUI marking conventions in practice (labels on drives, folders, printouts).",
    milestones: [
      M(
        "MP.3.8.4.marking_photos",
        "Upload photos of CUI marking conventions in practice",
        "Photos of labels on drives, file headers/footers, folder markings, and printouts for a representative sample.",
        { evidenceType: "photo", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.8.5", family: "MP", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.8.6",
    family: "MP",
    weaknessSummary:
      "Client must maintain media transport logs with encryption verification.",
    milestones: [
      M(
        "MP.3.8.6.transport_logs",
        "Upload media transport logs with encryption verification",
        "Per transport event: sender, recipient, carrier, tracking number, encryption method, and chain-of-custody signatures.",
        { evidenceType: "log", cadence: "per_event", dueOffsetDays: 75 }
      ),
    ],
  },
  {
    controlId: "3.8.7",
    family: "MP",
    weaknessSummary:
      "Client must maintain a removable media authorization list.",
    milestones: [
      M(
        "MP.3.8.7.removable_media_auth",
        "Upload removable media authorization list (users + media types)",
        "Explicit allow-list of users and media types. If removable media is prohibited, upload signed attestation instead.",
        { evidenceType: "roster", cadence: "annual", dueOffsetDays: 45 }
      ),
    ],
  },
  { controlId: "3.8.8", family: "MP", weaknessSummary: "", milestones: [] },
  { controlId: "3.8.9", family: "MP", weaknessSummary: "", milestones: [] },

  // --------------------------------------------------------------------------
  // PS — Personnel Security (3.9.1 – 3.9.2)
  // --------------------------------------------------------------------------
  {
    controlId: "3.9.1",
    family: "PS",
    weaknessSummary:
      "Client must evidence background screening and signed NDA/CUI acknowledgment per user.",
    milestones: [
      M(
        "PS.3.9.1.background_checks",
        "Upload background check completion records (or HR attestation letter)",
        "HR-signed letter attesting every CUI-access user has completed the required background screening, or individual records.",
        {
          closureType: "register_pointer",
          evidenceType: "attestation_letter",
          cadence: "per_event",
          dueOffsetDays: 75,
          registerKey: "personnel_screening",
        }
      ),
      M(
        "PS.3.9.1.nda_cui_ack",
        "Upload signed NDAs and CUI acknowledgment forms per user",
        "Every user accessing CUI must have a signed NDA and CUI handling acknowledgment on file.",
        { evidenceType: "attestation_letter", cadence: "per_event", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.9.2",
    family: "PS",
    weaknessSummary:
      "Client must evidence termination checklists with access revocation inside the required SLA, and transfer/role-change access adjustments.",
    milestones: [
      M(
        "PS.3.9.2.termination_checklists",
        "Upload termination checklists with access revocation timestamps (< 24h typical)",
        "Per termination: checklist showing access disabled with timestamp, manager sign-off, and IT confirmation.",
        {
          closureType: "register_pointer",
          evidenceType: "checklist",
          cadence: "per_event",
          dueOffsetDays: 45,
          registerKey: "terminations",
        }
      ),
      M(
        "PS.3.9.2.transfer_records",
        "Upload transfer / role-change access adjustment records",
        "Ticket samples showing privilege recalculation at each role change in the last 12 months.",
        { evidenceType: "ticket", cadence: "per_event", dueOffsetDays: 60 }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // PE — Physical Protection (3.10.1 – 3.10.6)
  // --------------------------------------------------------------------------
  {
    controlId: "3.10.1",
    family: "PE",
    weaknessSummary:
      "Client must provide floor plans, secure-room photos, badge access reports, and a physical access roster.",
    milestones: [
      M(
        "PE.3.10.1.floor_plans",
        "Upload facility floor plans showing CUI areas",
        "Floor plan(s) with CUI work areas, server rooms, and wiring closets clearly marked.",
        { evidenceType: "diagram", cadence: "annual", dueOffsetDays: 60 }
      ),
      M(
        "PE.3.10.1.secure_room_photos",
        "Upload photos of secure rooms, badge readers, server rooms",
        "Photo set of physical safeguards protecting CUI work areas and infrastructure.",
        { evidenceType: "photo", cadence: "annual", dueOffsetDays: 60 }
      ),
      M(
        "PE.3.10.1.access_roster",
        "Upload physical access roster for CUI areas",
        "Every individual with physical access to CUI areas, their badge ID, and authorization date.",
        { evidenceType: "roster", cadence: "quarterly", dueOffsetDays: 45 }
      ),
      M(
        "PE.3.10.1.badge_reports",
        "Upload badge access reports (last 90 days)",
        "Badge system export showing entries/exits to CUI areas for the most recent 90 days.",
        { evidenceType: "report", cadence: "quarterly", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.10.2",
    family: "PE",
    weaknessSummary:
      "Client must attest to monitoring (cameras, alarms) of the physical CUI environment.",
    milestones: [
      M(
        "PE.3.10.2.monitoring_attestation",
        "Upload monitoring (cameras, alarms) attestation",
        "Signed attestation describing camera coverage, alarm coverage, retention, and monitoring responsibility.",
        { closureType: "attestation", evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.10.3",
    family: "PE",
    weaknessSummary:
      "Client must maintain visitor logs for CUI areas.",
    milestones: [
      M(
        "PE.3.10.3.visitor_logs",
        "Finalize visitor log register entries (last 90 days sample)",
        "Visitor log entries showing escort, purpose, entry/exit times for the last 90 days.",
        {
          closureType: "register_pointer",
          evidenceType: "log",
          cadence: "continuous",
          dueOffsetDays: 45,
          registerKey: "visitor_log",
        }
      ),
    ],
  },
  { controlId: "3.10.4", family: "PE", weaknessSummary: "", milestones: [] },
  { controlId: "3.10.5", family: "PE", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.10.6",
    family: "PE",
    weaknessSummary:
      "Client must authorize alternate work / telework sites per remote employee.",
    milestones: [
      M(
        "PE.3.10.6.telework_authorizations",
        "Upload alternate / telework site authorizations per remote employee",
        "Per-employee signed authorization naming the approved alternate site and the physical safeguards in place there.",
        { evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // RA — Risk Assessment (3.11.1 – 3.11.3)
  // --------------------------------------------------------------------------
  {
    controlId: "3.11.1",
    family: "RA",
    weaknessSummary:
      "Client must maintain an annual risk assessment report.",
    milestones: [
      M(
        "RA.3.11.1.annual_risk_assessment",
        "Upload annual risk assessment report",
        "Current (< 12 months) risk assessment covering CUI assets, threats, vulnerabilities, impact, likelihood, and treatment.",
        { evidenceType: "report", cadence: "annual", dueOffsetDays: 120 }
      ),
    ],
  },
  {
    controlId: "3.11.2",
    family: "RA",
    weaknessSummary:
      "Client must provide authenticated vulnerability scan reports covering internal + external surface.",
    milestones: [
      M(
        "RA.3.11.2.scan_reports",
        "Upload authenticated vulnerability scan reports (internal + external, last 30 days)",
        "One internal authenticated scan and one external scan within the last 30 days, with raw output and executive summary.",
        { evidenceType: "scan_report", cadence: "monthly", dueOffsetDays: 45 }
      ),
    ],
  },
  {
    controlId: "3.11.3",
    family: "RA",
    weaknessSummary:
      "Client must evidence remediation tracking tied to scan findings with SLAs.",
    milestones: [
      M(
        "RA.3.11.3.remediation_tracking",
        "Upload remediation tracking tied to scan findings with SLAs",
        "Tracking report mapping each critical/high finding to a ticket with target date (critical < 15 days, high < 30 days).",
        { evidenceType: "report", cadence: "monthly", dueOffsetDays: 60 }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // CA — Security Assessment (3.12.1 – 3.12.4)
  // --------------------------------------------------------------------------
  {
    controlId: "3.12.1",
    family: "CA",
    weaknessSummary:
      "Client must complete an internal / self-assessment against all 110 controls.",
    milestones: [
      M(
        "CA.3.12.1.self_assessment",
        "Upload internal self-assessment results against all 110 controls",
        "Completed self-assessment workbook with per-control disposition and evidence pointers.",
        { evidenceType: "report", cadence: "annual", dueOffsetDays: 120 }
      ),
    ],
  },
  {
    controlId: "3.12.2",
    family: "CA",
    weaknessSummary:
      "Client must maintain a POA&M with realistic remediation dates (satisfied by this module once at least one POAM exists).",
    milestones: [
      M(
        "CA.3.12.2.poam_register",
        "Confirm POA&M register is populated with realistic remediation dates",
        "The POA&M Tracker is populated automatically. Review and adjust dates/owners; this milestone closes once entries are owned and dated.",
        {
          closureType: "register_pointer",
          evidenceType: "report",
          cadence: "continuous",
          dueOffsetDays: 30,
          registerKey: "poam_tracker",
        }
      ),
    ],
  },
  { controlId: "3.12.3", family: "CA", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.12.4",
    family: "CA",
    weaknessSummary:
      "Client must customize and own the System Security Plan (SSP) for their environment.",
    milestones: [
      M(
        "CA.3.12.4.ssp_customization",
        "Customize and finalize the System Security Plan (SSP)",
        "The SSP is templated by MacTech; the client must customize every section to reflect their environment, sign off as the system owner, and re-generate.",
        {
          closureType: "system_pointer",
          evidenceType: "plan",
          cadence: "annual",
          dueOffsetDays: 90,
        }
      ),
    ],
  },

  // --------------------------------------------------------------------------
  // SC — System & Communications Protection (3.13.1 – 3.13.16)
  // --------------------------------------------------------------------------
  {
    controlId: "3.13.1",
    family: "SC",
    weaknessSummary:
      "Client must provide a network topology diagram with the CUI boundary clearly drawn.",
    milestones: [
      M(
        "SC.3.13.1.network_topology",
        "Upload network topology diagram with CUI boundary clearly drawn",
        "Current network diagram with the CUI boundary outlined, managed interfaces labeled, and external connections identified.",
        { evidenceType: "diagram", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.13.2",
    family: "SC",
    weaknessSummary:
      "Client must provide a data flow diagram showing how CUI moves in/out of the vault.",
    milestones: [
      M(
        "SC.3.13.2.data_flow_diagram",
        "Upload data flow diagram showing how CUI moves in/out of the vault",
        "Diagram showing every ingress/egress path for CUI (email, share, upload, remote access) with transport protection.",
        { evidenceType: "diagram", cadence: "annual", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.13.3", family: "SC", weaknessSummary: "", milestones: [] },
  { controlId: "3.13.4", family: "SC", weaknessSummary: "", milestones: [] },
  { controlId: "3.13.5", family: "SC", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.13.6",
    family: "SC",
    weaknessSummary:
      "Client must attest to DNS configuration (deny-by-default or explicit allow-list for CUI endpoints).",
    milestones: [
      M(
        "SC.3.13.6.dns_attestation",
        "Upload DNS configuration attestation",
        "Attestation describing the DNS controls in place on client endpoints (secure resolvers, filtering, DoH/DoT status).",
        { closureType: "attestation", evidenceType: "attestation_letter", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  { controlId: "3.13.7", family: "SC", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.13.8",
    family: "SC",
    weaknessSummary:
      "Client must evidence cryptographic protection of CUI in transit on client-managed paths.",
    milestones: [
      M(
        "SC.3.13.8.transit_crypto_attestation",
        "Upload attestation for FIPS-validated cryptography in transit on client-managed paths",
        "Naming the product(s) and FIPS certificate number(s) for every client-managed CUI transport path.",
        { closureType: "attestation", evidenceType: "fips_cert", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  { controlId: "3.13.9", family: "SC", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.13.10",
    family: "SC",
    weaknessSummary:
      "Client must document key management procedures (who holds keys, escrow, rotation).",
    milestones: [
      M(
        "SC.3.13.10.key_management",
        "Upload key management procedures (holders, escrow, rotation records)",
        "Procedure doc + rotation log covering every cryptographic key the client controls, including escrow process.",
        { evidenceType: "plan", cadence: "annual", dueOffsetDays: 90 }
      ),
    ],
  },
  {
    controlId: "3.13.11",
    family: "SC",
    weaknessSummary:
      "Client must provide FIPS 140-2/3 validation certificates for crypto on client endpoints.",
    milestones: [
      M(
        "SC.3.13.11.endpoint_fips_certs",
        "Upload FIPS 140-2/3 validation certificates for crypto on client endpoints",
        "Copy of the FIPS certificate(s) (not modules) for every encryption product on laptops/workstations touching CUI.",
        { evidenceType: "fips_cert", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  {
    controlId: "3.13.12",
    family: "SC",
    weaknessSummary:
      "Client must authorize and configure collaborative computing (Teams, Zoom) for CUI discussion.",
    milestones: [
      M(
        "SC.3.13.12.voip_collab_auth",
        "Upload VoIP / collaborative computing authorization and config evidence",
        "Authorization list of approved collaborative tools + config screenshots showing recording controls and CUI-compliant tenant settings.",
        { evidenceType: "report", cadence: "annual", dueOffsetDays: 75 }
      ),
    ],
  },
  { controlId: "3.13.13", family: "SC", weaknessSummary: "", milestones: [] },
  { controlId: "3.13.14", family: "SC", weaknessSummary: "", milestones: [] },
  { controlId: "3.13.15", family: "SC", weaknessSummary: "", milestones: [] },
  { controlId: "3.13.16", family: "SC", weaknessSummary: "", milestones: [] },

  // --------------------------------------------------------------------------
  // SI — System & Information Integrity (3.14.1 – 3.14.7)
  // --------------------------------------------------------------------------
  {
    controlId: "3.14.1",
    family: "SI",
    weaknessSummary:
      "Client must evidence patch management SLAs and file-integrity monitoring on client endpoints.",
    milestones: [
      M(
        "SI.3.14.1.patch_management",
        "Upload patch management records for client endpoints with SLA evidence",
        "Report showing critical patches applied < 15 days and high patches < 30 days across every in-scope endpoint.",
        { evidenceType: "report", cadence: "monthly", dueOffsetDays: 45 }
      ),
      M(
        "SI.3.14.1.fim_evidence",
        "Upload file integrity monitoring evidence",
        "FIM tool report showing coverage on every CUI endpoint plus at least one alert-to-action sample.",
        { evidenceType: "report", cadence: "quarterly", dueOffsetDays: 75 }
      ),
    ],
  },
  {
    controlId: "3.14.2",
    family: "SI",
    weaknessSummary:
      "Client must evidence antimalware deployment and definition-update freshness on client endpoints.",
    milestones: [
      M(
        "SI.3.14.2.antimalware_logs",
        "Upload antimalware deployment report + definition update logs",
        "Deployment report (coverage per endpoint) and a 30-day definition-update log showing freshness.",
        { evidenceType: "log", cadence: "monthly", dueOffsetDays: 60 }
      ),
    ],
  },
  {
    controlId: "3.14.3",
    family: "SI",
    weaknessSummary:
      "Client must evidence CISA / US-CERT alert intake and corresponding actions.",
    milestones: [
      M(
        "SI.3.14.3.cisa_intake",
        "Upload CISA / US-CERT alert intake and action records",
        "Log of the last 12 months of CISA/US-CERT advisories received, triaged, and actioned (or risk-accepted).",
        { evidenceType: "log", cadence: "monthly", dueOffsetDays: 60 }
      ),
    ],
  },
  { controlId: "3.14.4", family: "SI", weaknessSummary: "", milestones: [] },
  { controlId: "3.14.5", family: "SI", weaknessSummary: "", milestones: [] },
  {
    controlId: "3.14.6",
    family: "SI",
    weaknessSummary:
      "Client must provide SIEM / EDR alert-to-action samples.",
    milestones: [
      M(
        "SI.3.14.6.siem_samples",
        "Upload SIEM / EDR alert-to-action samples",
        "At least 3 alert-to-action workflows (alert → ticket → resolution) from the last 90 days.",
        { evidenceType: "ticket", cadence: "quarterly", dueOffsetDays: 75 }
      ),
    ],
  },
  {
    controlId: "3.14.7",
    family: "SI",
    weaknessSummary:
      "Client must evidence email / spam filtering on mail flow into the organization.",
    milestones: [
      M(
        "SI.3.14.7.email_filter_logs",
        "Upload email / spam filtering logs",
        "Export from mail security gateway showing filtering activity and policy enforcement for the last 30 days.",
        { evidenceType: "log", cadence: "monthly", dueOffsetDays: 60 }
      ),
    ],
  },
];

// ----------------------------------------------------------------------------
// Indexes
// ----------------------------------------------------------------------------

/** Fast lookup by controlId. */
export const CLIENT_ARTIFACTS_BY_CONTROL_ID: Map<string, ControlClientArtifacts> =
  new Map(CLIENT_REQUIRED_ARTIFACTS.map((c) => [c.controlId, c]));

/** Only the entries that will generate a POAM (have at least one milestone). */
export const POAM_ELIGIBLE_CONTROLS: ControlClientArtifacts[] =
  CLIENT_REQUIRED_ARTIFACTS.filter((c) => c.milestones.length > 0);

/** Fast lookup by milestone key (e.g. "AT.3.2.1.initial_annual_certs"). */
export const MILESTONES_BY_KEY: Map<string, ClientArtifactMilestone> = (() => {
  const m = new Map<string, ClientArtifactMilestone>();
  for (const entry of CLIENT_REQUIRED_ARTIFACTS) {
    for (const ms of entry.milestones) m.set(ms.key, ms);
  }
  return m;
})();
