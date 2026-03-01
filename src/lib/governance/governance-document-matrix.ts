/**
 * Governance Document Matrix: required for Gov Pure, Gov Hybrid, Tech/Hybrid,
 * with MACTech document path and Missing indicator.
 * Data drives docs/Governance_Document_Matrix.md and dashboard matrix view.
 */

export type GovernanceDocumentMatrixRow = {
  /** Governance document / artifact label (row label). */
  document: string;
  /** Required for 18 pure governance controls. */
  govPure: boolean;
  /** Required when adjudicating hybrid governance controls (policy + technical). */
  govHybrid: boolean;
  /** Required to close PARTIAL (Tech/Hybrid) controls—OS evidence + this doc. */
  techHybrid: boolean;
  /** MACTech repo path (relative to repo root); empty = no artifact. */
  mactechDocument: string;
  /** True if no MACTech artifact exists (empty path or "MISSING"). */
  missing: boolean;
};

/** Mapping from artifact label to MACTech path. Synced with artifact-label-to-document-mapping.json. */
const MACTECH_MAPPING: Record<string, string> = {
  "Access Control Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-210_Access_Control_Policy.md",
  "Awareness and Training Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-219_Awareness_and_Training_Policy.md",
  "Security Awareness Training Procedure": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-227_Security_Awareness_Training_Procedure.md",
  "Audit and Accountability Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-218_Audit_and_Accountability_Policy.md",
  "Audit Log Review Procedure": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-226_Audit_Log_Review_Procedure.md",
  "Configuration Management Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-220_Configuration_Management_Policy.md",
  "Configuration Change Procedure": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-225_Configuration_Change_Awareness_Procedure.md",
  "Incident Response Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-215_Incident_Response_Policy.md",
  "Incident Response Testing Procedure": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-232_Incident_Response_Testing_Procedure.md",
  "Maintenance Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-221_Maintenance_Policy.md",
  "Personnel Security Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-222_Personnel_Security_Policy.md",
  "Personnel Screening Procedure": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-233_Personnel_Screening_Procedure.md",
  "Risk Assessment Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-223_Risk_Assessment_Policy.md",
  "Security Assessment Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-224_Security_Assessment_Policy.md",
  "Procedures for Configuration Management": "compliance/cmmc/level2/02-policies-and-procedures/MAC-CMP-001_Configuration_Management_Plan.md",
  "Identification and Authentication Policy": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md",
  "Procedures for User Identification and Authentication": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md",
  "Procedures for Remote Access": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-224_Physical_Environment_and_Remote_Work_Controls.md",
  "Procedures for Authenticator Management": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-211_Identification_and_Authentication_Policy.md",
  "Procedures for establishing, changing, and revoking authenticators": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md",
  "Procedures for Malicious Code Protection": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-214_System_Integrity_Policy.md",
  "Policy for authentication feedback (obscure feedback)": "compliance/cmmc/level2/02-policies-and-procedures/MAC-POL-228_Authentication_Feedback_Obscure_Policy.md",
  "Procedures for System Monitoring": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-239_System_Monitoring_Procedure.md",
  "Procedures for session/connection termination": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-240_Session_Connection_Termination_Procedure.md",
  "Procedures for mobile code/script control": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-241_Mobile_Code_Script_Control_Procedure.md",
  "Procedures for transmission integrity (SMB signing/crypto)": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-242_Transmission_Integrity_SMB_Procedure.md",
  "Gov docs for separation of duties and system management": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-243_Separation_System_Management_Procedure.md",
  "Gov docs for information transfer controls": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-244_Information_Transfer_Controls_Procedure.md",
  "Network/security architecture documentation and procedures": "compliance/cmmc/level2/01-system-scope/",
  "Gov docs for RDP/collaborative device use and restrictions": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-245_RDP_Collaborative_Device_Restrictions_Procedure.md",
  "Procedures for Configuration Change Control": "compliance/cmmc/level2/02-policies-and-procedures/MAC-SOP-225_Configuration_Change_Awareness_Procedure.md",
};

function resolveMactechPath(label: string): string {
  const path = MACTECH_MAPPING[label];
  if (path !== undefined) return path;
  return "";
}

function isMissing(path: string): boolean {
  return !path || path === "MISSING" || path.trim() === "";
}

/**
 * Core 13 governance documents (from CMMC 18 analysis): 9 policies + 4 procedures.
 * Gov Pure = required for 18 governance-only controls.
 * Gov Hybrid = required when adjudicating hybrid governance controls (same policy families).
 * Tech/Hybrid = required to close PARTIAL controls (OS evidence + doc).
 */
export const GOVERNANCE_DOCUMENT_MATRIX: GovernanceDocumentMatrixRow[] = [
  {
    document: "Access Control Policy",
    govPure: true,
    govHybrid: true,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Access Control Policy"),
    missing: isMissing(resolveMactechPath("Access Control Policy")),
  },
  {
    document: "Awareness and Training Policy",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Awareness and Training Policy"),
    missing: isMissing(resolveMactechPath("Awareness and Training Policy")),
  },
  {
    document: "Security Awareness Training Procedure",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Security Awareness Training Procedure"),
    missing: isMissing(resolveMactechPath("Security Awareness Training Procedure")),
  },
  {
    document: "Audit and Accountability Policy",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Audit and Accountability Policy"),
    missing: isMissing(resolveMactechPath("Audit and Accountability Policy")),
  },
  {
    document: "Audit Log Review Procedure",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Audit Log Review Procedure"),
    missing: isMissing(resolveMactechPath("Audit Log Review Procedure")),
  },
  {
    document: "Configuration Management Policy",
    govPure: true,
    govHybrid: true,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Configuration Management Policy"),
    missing: isMissing(resolveMactechPath("Configuration Management Policy")),
  },
  {
    document: "Configuration Change Procedure",
    govPure: true,
    govHybrid: true,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Configuration Change Procedure"),
    missing: isMissing(resolveMactechPath("Configuration Change Procedure")),
  },
  {
    document: "Incident Response Policy",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Incident Response Policy"),
    missing: isMissing(resolveMactechPath("Incident Response Policy")),
  },
  {
    document: "Incident Response Testing Procedure",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Incident Response Testing Procedure"),
    missing: isMissing(resolveMactechPath("Incident Response Testing Procedure")),
  },
  {
    document: "Maintenance Policy",
    govPure: true,
    govHybrid: true,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Maintenance Policy"),
    missing: isMissing(resolveMactechPath("Maintenance Policy")),
  },
  {
    document: "Personnel Security Policy",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Personnel Security Policy"),
    missing: isMissing(resolveMactechPath("Personnel Security Policy")),
  },
  {
    document: "Personnel Screening Procedure",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Personnel Screening Procedure"),
    missing: isMissing(resolveMactechPath("Personnel Screening Procedure")),
  },
  {
    document: "Risk Assessment Policy",
    govPure: true,
    govHybrid: false,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Risk Assessment Policy"),
    missing: isMissing(resolveMactechPath("Risk Assessment Policy")),
  },
  {
    document: "Security Assessment Policy",
    govPure: true,
    govHybrid: true,
    techHybrid: false,
    mactechDocument: resolveMactechPath("Security Assessment Policy"),
    missing: isMissing(resolveMactechPath("Security Assessment Policy")),
  },
  // Tech/Hybrid-only or additional docs
  {
    document: "Procedures for Configuration Management",
    govPure: false,
    govHybrid: true,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for Configuration Management"),
    missing: isMissing(resolveMactechPath("Procedures for Configuration Management")),
  },
  {
    document: "Identification and Authentication Policy",
    govPure: false,
    govHybrid: true,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Identification and Authentication Policy"),
    missing: isMissing(resolveMactechPath("Identification and Authentication Policy")),
  },
  {
    document: "Procedures for User Identification and Authentication",
    govPure: false,
    govHybrid: true,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for User Identification and Authentication"),
    missing: isMissing(resolveMactechPath("Procedures for User Identification and Authentication")),
  },
  {
    document: "Procedures for Remote Access",
    govPure: false,
    govHybrid: true,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for Remote Access"),
    missing: isMissing(resolveMactechPath("Procedures for Remote Access")),
  },
  {
    document: "Procedures for Authenticator Management",
    govPure: false,
    govHybrid: true,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for Authenticator Management"),
    missing: isMissing(resolveMactechPath("Procedures for Authenticator Management")),
  },
  {
    document: "Procedures for establishing, changing, and revoking authenticators",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for establishing, changing, and revoking authenticators"),
    missing: isMissing(resolveMactechPath("Procedures for establishing, changing, and revoking authenticators")),
  },
  {
    document: "Procedures for Malicious Code Protection",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for Malicious Code Protection"),
    missing: isMissing(resolveMactechPath("Procedures for Malicious Code Protection")),
  },
  {
    document: "Policy for authentication feedback (obscure feedback)",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Policy for authentication feedback (obscure feedback)"),
    missing: isMissing(resolveMactechPath("Policy for authentication feedback (obscure feedback)")),
  },
  {
    document: "Procedures for System Monitoring",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for System Monitoring"),
    missing: isMissing(resolveMactechPath("Procedures for System Monitoring")),
  },
  {
    document: "Procedures for session/connection termination",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for session/connection termination"),
    missing: isMissing(resolveMactechPath("Procedures for session/connection termination")),
  },
  {
    document: "Procedures for mobile code/script control",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for mobile code/script control"),
    missing: isMissing(resolveMactechPath("Procedures for mobile code/script control")),
  },
  {
    document: "Procedures for transmission integrity (SMB signing/crypto)",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Procedures for transmission integrity (SMB signing/crypto)"),
    missing: isMissing(resolveMactechPath("Procedures for transmission integrity (SMB signing/crypto)")),
  },
  {
    document: "Gov docs for separation of duties and system management",
    govPure: false,
    govHybrid: true,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Gov docs for separation of duties and system management"),
    missing: isMissing(resolveMactechPath("Gov docs for separation of duties and system management")),
  },
  {
    document: "Gov docs for information transfer controls",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Gov docs for information transfer controls"),
    missing: isMissing(resolveMactechPath("Gov docs for information transfer controls")),
  },
  {
    document: "Network/security architecture documentation and procedures",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Network/security architecture documentation and procedures"),
    missing: isMissing(resolveMactechPath("Network/security architecture documentation and procedures")),
  },
  {
    document: "Gov docs for RDP/collaborative device use and restrictions",
    govPure: false,
    govHybrid: false,
    techHybrid: true,
    mactechDocument: resolveMactechPath("Gov docs for RDP/collaborative device use and restrictions"),
    missing: isMissing(resolveMactechPath("Gov docs for RDP/collaborative device use and restrictions")),
  },
];
