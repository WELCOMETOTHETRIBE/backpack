/**
 * Governance Portal seed data: control metadata (18 pure + 17 hybrid), register definitions,
 * and document master list (required doc keys for "missing required docs").
 */

export const PURE_GOV_CONTROL_IDS = [
  "3.1.4", "3.2.1", "3.2.2", "3.2.3", "3.3.3", "3.4.3", "3.4.4",
  "3.6.1", "3.6.2", "3.6.3", "3.7.6", "3.9.1", "3.9.2", "3.11.1",
  "3.12.1", "3.12.2", "3.12.3", "3.12.4",
];

/**
 * 17 controls that require both enclave (OS) evidence and governance adjudication.
 * Reconciled with OS-Evidence-to-NIST-Control-Manifest-73-73: all 17 are in the 73 enclave manifest.
 * (Replaced 3.10.1, 3.10.2, 3.10.3, 3.8.3, 3.8.4 — not in 73 — with 3.4.5, 3.13.2, 3.13.3, 3.14.3, 3.7.5.)
 */
export const HYBRID_GOV_CONTROL_IDS = [
  "3.1.1", "3.1.2", "3.1.3", "3.1.5", "3.1.6", "3.1.7",
  "3.5.1", "3.5.2", "3.5.3", "3.5.7",
  "3.4.5", "3.7.5",
  "3.13.2", "3.13.3", "3.13.8", "3.13.11",
  "3.14.3",
];

export type ControlMetadataSeed = {
  controlId: string;
  classification: "PURE_GOV" | "HYBRID_GOV" | "TECHNICAL";
  controlStatement: string;
  requiredDocuments: string[];
  requiredRegisters: string[];
  requiredHybridEvidenceTypes: string[];
};

/** Short control statements and required artifacts per control (for seed). */
export const GOVERNANCE_CONTROL_METADATA_SEED: ControlMetadataSeed[] = [
  ...PURE_GOV_CONTROL_IDS.map((controlId) => ({
    controlId,
    classification: "PURE_GOV" as const,
    controlStatement: `NIST 800-171 requirement ${controlId} (governance).`,
    requiredDocuments: [] as string[],
    requiredRegisters: [] as string[],
    requiredHybridEvidenceTypes: [] as string[],
  })),
  ...HYBRID_GOV_CONTROL_IDS.map((controlId) => ({
    controlId,
    classification: "HYBRID_GOV" as const,
    controlStatement: `NIST 800-171 requirement ${controlId} (hybrid governance + technical).`,
    requiredDocuments: [] as string[],
    requiredRegisters: [] as string[],
    requiredHybridEvidenceTypes: ["screenshot", "config_baseline", "policy_export", "export_file"] as string[],
  })),
];

/** Required governance document keys (policies + SOPs) for "missing required docs" and control requirements. */
export const GOVERNANCE_DOCUMENT_MASTER_LIST = {
  policies: [
    "Access Control Policy",
    "Identity & Authentication Policy",
    "Awareness & Training Policy",
    "Audit & Accountability Policy",
    "Configuration Management Policy",
    "Incident Response Policy",
    "Maintenance Policy",
    "Personnel Security Policy",
    "Risk Assessment Policy",
    "Security Assessment Policy",
    "Physical Security Policy",
    "Media Protection Policy",
    "Cryptographic / Encryption Policy",
    "Privileged Access Management Policy",
    "Document Control Policy",
    "Records Retention Policy",
  ],
  procedures: [
    "Access Provisioning Procedure",
    "Separation of Duties Procedure",
    "Training Administration Procedure",
    "Log Review Procedure",
    "Change Management Procedure",
    "Security Impact Analysis Procedure",
    "Incident Handling Procedure",
    "IR Testing Procedure",
    "Screening Procedure",
    "Termination Procedure",
    "Risk Assessment Methodology",
    "POA&M Management Procedure",
    "Control Monitoring Procedure",
    "SSP Maintenance Procedure",
    "Media Sanitization Procedure",
    "Visitor Control Procedure",
    "Encryption Configuration Procedure",
    "MFA Administration Procedure",
  ],
};

export const REGISTER_KEYS = [
  "access_authorizations",
  "role_assignment_matrix",
  "separation_of_duties_matrix",
  "training_completion",
  "incident_log",
  "change_log",
  "risk_register",
  "poam_tracker",
  "control_monitoring_log",
  "maintenance_log",
  "personnel_screening",
  "terminations",
  "policy_review_log",
  "audit_log_review_records",
  "visitor_log",
  "media_destruction_log",
] as const;

export type RegisterColumn = { key: string; label: string; type: string };

export const REGISTER_DEFINITIONS: { registerKey: string; name: string; description?: string; requiredColumns: RegisterColumn[]; retainForDays?: number }[] = [
  { registerKey: "access_authorizations", name: "Access Authorization Register", description: "Record who has been granted access to which role and when; required for access control and 3.1.4 separation of duties evidence.", requiredColumns: [{ key: "person", label: "Person", type: "string" }, { key: "role", label: "Role", type: "string" }, { key: "granted_date", label: "Granted Date", type: "date" }, { key: "expires_date", label: "Expires Date", type: "date" }], retainForDays: 365 * 3 },
  { registerKey: "role_assignment_matrix", name: "Role Assignment Matrix", description: "Document role-to-assignment mappings and review dates for access control evidence.", requiredColumns: [{ key: "role", label: "Role", type: "string" }, { key: "assignments", label: "Assignments", type: "string" }, { key: "review_date", label: "Review Date", type: "date" }], retainForDays: 365 * 3 },
  { registerKey: "separation_of_duties_matrix", name: "Separation of Duties Matrix", description: "Log duty pairs and review status for separation of duties (3.1.4) evidence.", requiredColumns: [{ key: "duty_pair", label: "Duty Pair", type: "string" }, { key: "status", label: "Status", type: "string" }, { key: "review_date", label: "Review Date", type: "date" }], retainForDays: 365 * 3 },
  { registerKey: "training_completion", name: "Training Completion Register", description: "Record personnel training completion for awareness and training (3.2.x) evidence.", requiredColumns: [{ key: "person", label: "Person", type: "string" }, { key: "training", label: "Training", type: "string" }, { key: "completed_date", label: "Completed Date", type: "date" }], retainForDays: 365 * 3 },
  { registerKey: "incident_log", name: "Incident Log Register", description: "Log security incidents, descriptions, and resolutions for incident response evidence.", requiredColumns: [{ key: "date", label: "Date", type: "date" }, { key: "description", label: "Description", type: "string" }, { key: "resolution", label: "Resolution", type: "string" }], retainForDays: 365 * 7 },
  { registerKey: "change_log", name: "Change Log", description: "Record configuration and system changes with approval for change management evidence.", requiredColumns: [{ key: "date", label: "Date", type: "date" }, { key: "change", label: "Change", type: "string" }, { key: "approval", label: "Approval", type: "string" }], retainForDays: 365 * 3 },
  { registerKey: "risk_register", name: "Risk Register", description: "Document risks, severity, and mitigations for risk assessment evidence.", requiredColumns: [{ key: "risk", label: "Risk", type: "string" }, { key: "severity", label: "Severity", type: "string" }, { key: "mitigation", label: "Mitigation", type: "string" }], retainForDays: 365 * 3 },
  { registerKey: "poam_tracker", name: "POA&M Tracker", description: "Track plan of action and milestones: findings, due dates, and status.", requiredColumns: [{ key: "finding", label: "Finding", type: "string" }, { key: "due_date", label: "Due Date", type: "date" }, { key: "status", label: "Status", type: "string" }], retainForDays: 365 * 7 },
  { registerKey: "control_monitoring_log", name: "Control Monitoring Log", description: "Log control reviews and results for ongoing monitoring evidence.", requiredColumns: [{ key: "control_id", label: "Control ID", type: "string" }, { key: "review_date", label: "Review Date", type: "date" }, { key: "result", label: "Result", type: "string" }], retainForDays: 365 * 3 },
  { registerKey: "maintenance_log", name: "Maintenance Activity Log", description: "Record maintenance activities, dates, and performers for maintenance policy evidence.", requiredColumns: [{ key: "date", label: "Date", type: "date" }, { key: "activity", label: "Activity", type: "string" }, { key: "performed_by", label: "Performed By", type: "string" }], retainForDays: 365 * 3 },
  { registerKey: "personnel_screening", name: "Personnel Screening Log", description: "Log personnel screening dates and results for personnel security evidence.", requiredColumns: [{ key: "person", label: "Person", type: "string" }, { key: "screening_date", label: "Screening Date", type: "date" }, { key: "result", label: "Result", type: "string" }], retainForDays: 365 * 7 },
  { registerKey: "terminations", name: "Termination Log", description: "Record terminations and access revocation for personnel security evidence.", requiredColumns: [{ key: "person", label: "Person", type: "string" }, { key: "termination_date", label: "Termination Date", type: "date" }, { key: "access_revoked", label: "Access Revoked", type: "string" }], retainForDays: 365 * 7 },
  { registerKey: "policy_review_log", name: "Policy Review Log", description: "Document policy/document reviews and reviewers for document control evidence.", requiredColumns: [{ key: "document", label: "Document", type: "string" }, { key: "review_date", label: "Review Date", type: "date" }, { key: "reviewer", label: "Reviewer", type: "string" }], retainForDays: 365 * 3 },
  { registerKey: "audit_log_review_records", name: "Audit Log Review Records", description: "Log audit log reviews, reviewers, and findings for audit and accountability evidence.", requiredColumns: [{ key: "review_date", label: "Review Date", type: "date" }, { key: "reviewer", label: "Reviewer", type: "string" }, { key: "findings", label: "Findings", type: "string" }], retainForDays: 365 * 3 },
  { registerKey: "visitor_log", name: "Visitor Log", description: "Record visitor dates, names, and purpose for physical security evidence.", requiredColumns: [{ key: "date", label: "Date", type: "date" }, { key: "visitor", label: "Visitor", type: "string" }, { key: "purpose", label: "Purpose", type: "string" }], retainForDays: 365 * 3 },
  { registerKey: "media_destruction_log", name: "Media Destruction Log", description: "Log media destruction date, type, and method for media protection evidence.", requiredColumns: [{ key: "date", label: "Date", type: "date" }, { key: "media", label: "Media", type: "string" }, { key: "method", label: "Method", type: "string" }], retainForDays: 365 * 7 },
];
