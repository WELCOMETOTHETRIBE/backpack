/**
 * CMMC Unified Artifact Guide — typed data driving the Governance Wizard.
 * Source: docs/cmmc_unified_artifact_guide.md. Do not hardcode artifact names elsewhere.
 */

import { PARTIAL_DOCS_TO_CLOSE } from "./compliance/partialDocsToClose";

export type SatisfactionType = "Governance-Centric" | "Hybrid" | "Technical-Centric";

export type ArtifactHandling = "UPLOAD" | "REFERENCE" | "NATIVE" | "N/A" | "ATTESTATION" | "SYSTEM_POINTER";

export interface ArtifactSpec {
  label: string;
  handling: ArtifactHandling;
}

/** Required artifact for governance completion (label + type). Used for completion checks and UI. */
export interface RequiredArtifactSpec {
  label: string;
  type: ArtifactHandling;
}

export interface ControlArtifactSpec {
  controlId: string;
  satisfactionType: SatisfactionType;
  artifacts: ArtifactSpec[];
}

/** All 110 NIST SP 800-171 Rev 2 control IDs in family order (AC, AT, AU, CM, IA, IR, MA, MP, PS, PE, RA, CA, SC, SI). */
export const ALL_CONTROL_IDS: string[] = [
  "3.1.1", "3.1.2", "3.1.3", "3.1.4", "3.1.5", "3.1.6", "3.1.7", "3.1.8", "3.1.9", "3.1.10", "3.1.11", "3.1.12", "3.1.13", "3.1.14", "3.1.15", "3.1.16", "3.1.17", "3.1.18", "3.1.19", "3.1.20", "3.1.21", "3.1.22",
  "3.2.1", "3.2.2", "3.2.3",
  "3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.5", "3.3.6", "3.3.7", "3.3.8", "3.3.9",
  "3.4.1", "3.4.2", "3.4.3", "3.4.4", "3.4.5", "3.4.6", "3.4.7", "3.4.8", "3.4.9",
  "3.5.1", "3.5.2", "3.5.3", "3.5.4", "3.5.5", "3.5.6", "3.5.7", "3.5.8", "3.5.9", "3.5.10", "3.5.11",
  "3.6.1", "3.6.2", "3.6.3",
  "3.7.1", "3.7.2", "3.7.3", "3.7.4", "3.7.5", "3.7.6",
  "3.8.1", "3.8.2", "3.8.3", "3.8.4", "3.8.5", "3.8.6", "3.8.7", "3.8.8", "3.8.9",
  "3.9.1", "3.9.2",
  "3.10.1", "3.10.2", "3.10.3", "3.10.4", "3.10.5", "3.10.6",
  "3.11.1", "3.11.2", "3.11.3",
  "3.12.1", "3.12.2", "3.12.3", "3.12.4",
  "3.13.1", "3.13.2", "3.13.3", "3.13.4", "3.13.5", "3.13.6", "3.13.7", "3.13.8", "3.13.9", "3.13.10", "3.13.11", "3.13.12", "3.13.13", "3.13.14", "3.13.15", "3.13.16",
  "3.14.1", "3.14.2", "3.14.3", "3.14.4", "3.14.5", "3.14.6", "3.14.7",
];

const N_A_ARTIFACT: ArtifactSpec = { label: "N/A (Technical implementation)", handling: "N/A" };

/** Full artifact specs per control, derived from docs/cmmc_unified_artifact_guide.md */
export const CMMC_ARTIFACT_SPECS: ControlArtifactSpec[] = [
  { controlId: "3.1.1", satisfactionType: "Hybrid", artifacts: [
    { label: "Access Control Policy", handling: "UPLOAD" }, { label: "Procedures for Account Management", handling: "UPLOAD" },
    { label: "System Security Plan (SSP)", handling: "REFERENCE" }, { label: "List of active system accounts & associated individuals", handling: "REFERENCE" },
    { label: "Records of transferred/terminated employees", handling: "REFERENCE" }, { label: "Access authorization records", handling: "REFERENCE" },
  ]},
  { controlId: "3.1.2", satisfactionType: "Hybrid", artifacts: [
    { label: "Access Control Policy", handling: "UPLOAD" }, { label: "Procedures for Access Enforcement", handling: "UPLOAD" },
    { label: "List of approved user privileges/authorizations", handling: "REFERENCE" },
  ]},
  { controlId: "3.1.3", satisfactionType: "Hybrid", artifacts: [
    { label: "Information Flow Control Policy", handling: "UPLOAD" }, { label: "Procedures for Information Flow Enforcement", handling: "UPLOAD" },
    { label: "List of information flow authorizations", handling: "REFERENCE" },
  ]},
  { controlId: "3.1.4", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Access Control Policy", handling: "UPLOAD" }, { label: "Procedures for Separation of Duties", handling: "UPLOAD" },
    { label: "List of defined roles and responsibilities requiring separation", handling: "UPLOAD" },
  ]},
  { controlId: "3.1.5", satisfactionType: "Hybrid", artifacts: [
    { label: "Procedures for Least Privilege", handling: "UPLOAD" }, { label: "List of privileged accounts and associated individuals", handling: "REFERENCE" },
  ]},
  { controlId: "3.1.6", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.7", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.8", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.9", satisfactionType: "Governance-Centric", artifacts: [
    { label: "System Use Notification / Warning Banner Text", handling: "UPLOAD" }, { label: "Legal review and approval records for banner content", handling: "UPLOAD" },
  ]},
  { controlId: "3.1.10", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.11", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.12", satisfactionType: "Hybrid", artifacts: [
    { label: "Procedures for Remote Access", handling: "UPLOAD" }, { label: "Configuration Management Plan", handling: "REFERENCE" }, { label: "Remote access authorizations", handling: "REFERENCE" },
  ]},
  { controlId: "3.1.13", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.14", satisfactionType: "Technical-Centric", artifacts: [{ label: "System design documentation", handling: "REFERENCE" }] },
  { controlId: "3.1.15", satisfactionType: "Governance-Centric", artifacts: [
    { label: "List of authorized privileged commands for remote execution", handling: "REFERENCE" }, { label: "List of authorized security-relevant information for remote access", handling: "REFERENCE" },
  ]},
  { controlId: "3.1.16", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Wireless Access", handling: "UPLOAD" }, { label: "Wireless access authorizations", handling: "REFERENCE" },
  ]},
  { controlId: "3.1.17", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.18", satisfactionType: "Hybrid", artifacts: [
    { label: "Procedures for Mobile Device Access", handling: "UPLOAD" }, { label: "Authorizations for mobile device connections", handling: "REFERENCE" },
  ]},
  { controlId: "3.1.19", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.20", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Publicly Accessible Content", handling: "UPLOAD" }, { label: "List of users authorized to post public content", handling: "UPLOAD" }, { label: "Records of public information reviews", handling: "UPLOAD" },
  ]},
  { controlId: "3.1.21", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.1.22", satisfactionType: "Governance-Centric", artifacts: [{ label: "Procedures for CUI Handling", handling: "UPLOAD" }] },
  // AT
  { controlId: "3.2.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Security Awareness and Training Policy", handling: "UPLOAD" }, { label: "Procedures for Security Awareness Training", handling: "UPLOAD" },
    { label: "Security Awareness Training Curriculum & Materials", handling: "UPLOAD" }, { label: "Training records for all users, managers, and administrators", handling: "UPLOAD" },
  ]},
  { controlId: "3.2.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Role-Based Security Training", handling: "UPLOAD" }, { label: "Role-Based Training Curriculum & Materials", handling: "UPLOAD" },
    { label: "List of personnel with assigned security roles", handling: "UPLOAD" }, { label: "Training records for all personnel with security responsibilities", handling: "UPLOAD" },
  ]},
  { controlId: "3.2.3", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Insider Threat Policy & Procedures", handling: "UPLOAD" }, { label: "Insider Threat Training Materials", handling: "UPLOAD" }, { label: "Training records demonstrating insider threat awareness training", handling: "UPLOAD" },
  ]},
  // AU
  { controlId: "3.3.1", satisfactionType: "Hybrid", artifacts: [
    { label: "Audit and Accountability Policy", handling: "UPLOAD" }, { label: "Procedures for Auditable Events", handling: "UPLOAD" },
    { label: "List of defined auditable events", handling: "UPLOAD" }, { label: "Definition of audit record content & retention requirements", handling: "UPLOAD" },
  ]},
  { controlId: "3.3.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Audit Review, Analysis, and Reporting", handling: "UPLOAD" }, { label: "Records of audit log reviews, analysis, and reporting", handling: "REFERENCE" }, { label: "Records of actions taken in response to audit reviews", handling: "REFERENCE" },
  ]},
  { controlId: "3.3.3", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.3.4", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.3.5", satisfactionType: "Hybrid", artifacts: [
    { label: "Procedures for Audit Record Protection", handling: "UPLOAD" }, { label: "List of individuals with authorized access to audit records", handling: "UPLOAD" },
  ]},
  { controlId: "3.3.6", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Limiting Audit Report Generation", handling: "UPLOAD" }, { label: "List of individuals/roles authorized to generate audit reports", handling: "UPLOAD" },
  ]},
  { controlId: "3.3.7", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.3.8", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.3.9", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Session Audit", handling: "UPLOAD" }, { label: "List of privileged accounts to be audited", handling: "UPLOAD" },
  ]},
  // CM
  { controlId: "3.4.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Configuration Management Policy", handling: "UPLOAD" }, { label: "Procedures for Configuration Management", handling: "UPLOAD" }, { label: "System Baseline Configuration Document", handling: "REFERENCE" },
  ]},
  { controlId: "3.4.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Configuration Change Control", handling: "UPLOAD" }, { label: "Records of configuration change control activities", handling: "REFERENCE" },
  ]},
  { controlId: "3.4.3", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.4.3"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.4.4", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.4.5", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Access Restrictions for Changes", handling: "UPLOAD" }, { label: "Access authorization records for change control", handling: "REFERENCE" },
  ]},
  { controlId: "3.4.6", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Least Functionality", handling: "UPLOAD" }, { label: "List of authorized software & approval records", handling: "UPLOAD" },
  ]},
  { controlId: "3.4.7", satisfactionType: "Governance-Centric", artifacts: [{ label: "List of prohibited or restricted software", handling: "UPLOAD" }] },
  { controlId: "3.4.8", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.4.9", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  // IA
  { controlId: "3.5.1", satisfactionType: "Hybrid", artifacts: [
    { label: "Identification and Authentication Policy", handling: "UPLOAD" }, { label: "Procedures for User Identification and Authentication", handling: "UPLOAD" },
  ]},
  { controlId: "3.5.2", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.5.3", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.5.3"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.5.4", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.5.4"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.5.5", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Identifier Management", handling: "UPLOAD" }, { label: "Definition of the period for which identifiers cannot be reused", handling: "UPLOAD" },
  ]},
  { controlId: "3.5.6", satisfactionType: "Governance-Centric", artifacts: [{ label: "Definition of the period of inactivity after which an identifier is disabled", handling: "UPLOAD" }] },
  { controlId: "3.5.7", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Authenticator Management", handling: "UPLOAD" }, { label: "Definition of authenticator strength requirements", handling: "UPLOAD" },
  ]},
  { controlId: "3.5.8", satisfactionType: "Governance-Centric", artifacts: [{ label: "Definition of password complexity, change frequency, and reuse rules", handling: "UPLOAD" }] },
  { controlId: "3.5.9", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.5.9"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.5.10", satisfactionType: "Governance-Centric", artifacts: [{ label: "Procedures for establishing, changing, and revoking authenticators", handling: "UPLOAD" }] },
  { controlId: "3.5.11", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.5.11"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  // IR
  { controlId: "3.6.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Incident Response Policy", handling: "UPLOAD" }, { label: "Incident Response Plan", handling: "REFERENCE" }, { label: "Procedures for Incident Handling", handling: "REFERENCE" },
  ]},
  { controlId: "3.6.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Incident Reporting", handling: "UPLOAD" }, { label: "Incident response training materials and records", handling: "UPLOAD" },
  ]},
  { controlId: "3.6.3", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Incident Response Testing", handling: "UPLOAD" }, { label: "Incident response test plans and results", handling: "REFERENCE" },
  ]},
  // MA
  { controlId: "3.7.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Maintenance Policy", handling: "UPLOAD" }, { label: "Procedures for System Maintenance", handling: "UPLOAD" }, { label: "Maintenance schedules & records of maintenance activities", handling: "REFERENCE" },
  ]},
  { controlId: "3.7.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Controlled Maintenance", handling: "UPLOAD" }, { label: "List of authorized maintenance personnel", handling: "UPLOAD" },
  ]},
  { controlId: "3.7.3", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.7.4", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Maintenance Tool Management", handling: "UPLOAD" }, { label: "List of approved maintenance tools", handling: "UPLOAD" },
  ]},
  { controlId: "3.7.5", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Remote Maintenance", handling: "UPLOAD" }, { label: "Records of remote maintenance sessions", handling: "REFERENCE" },
  ]},
  { controlId: "3.7.6", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Media Sanitization", handling: "UPLOAD" }, { label: "Records of media sanitization", handling: "REFERENCE" },
  ]},
  // MP
  { controlId: "3.8.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Media Protection Policy", handling: "UPLOAD" }, { label: "Procedures for Media Protection", handling: "UPLOAD" },
  ]},
  { controlId: "3.8.2", satisfactionType: "Governance-Centric", artifacts: [{ label: "Procedures for Media Access", handling: "UPLOAD" }] },
  { controlId: "3.8.3", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Media Sanitization & Disposal", handling: "UPLOAD" }, { label: "Records of media sanitization and disposal", handling: "REFERENCE" },
  ]},
  { controlId: "3.8.4", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.8.5", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Media Control", handling: "UPLOAD" }, { label: "Records of media accountability (logs, inventories)", handling: "REFERENCE" },
  ]},
  { controlId: "3.8.6", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.8.7", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.8.8", satisfactionType: "Governance-Centric", artifacts: [{ label: "Procedures for Media Storage and Transport", handling: "UPLOAD" }] },
  { controlId: "3.8.9", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  // PS
  { controlId: "3.9.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Personnel Security Policy", handling: "UPLOAD" }, { label: "Procedures for Personnel Screening", handling: "UPLOAD" }, { label: "Records of personnel screening", handling: "REFERENCE" },
  ]},
  { controlId: "3.9.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Personnel Termination and Transfer", handling: "UPLOAD" }, { label: "Records of actions taken upon personnel termination or transfer", handling: "REFERENCE" },
  ]},
  // PE
  { controlId: "3.10.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Physical and Environmental Protection Policy", handling: "UPLOAD" }, { label: "Procedures for Physical Access Authorizations", handling: "UPLOAD" }, { label: "Authorized personnel access list", handling: "UPLOAD" },
  ]},
  { controlId: "3.10.2", satisfactionType: "Hybrid", artifacts: [
    { label: "Procedures for Physical Access Monitoring", handling: "UPLOAD" }, { label: "Physical access logs & monitoring records", handling: "REFERENCE" },
  ]},
  { controlId: "3.10.3", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Visitor Control", handling: "UPLOAD" }, { label: "Visitor access logs", handling: "UPLOAD" },
  ]},
  { controlId: "3.10.4", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Physical Access Control", handling: "UPLOAD" }, { label: "Inventory records of physical access devices", handling: "UPLOAD" },
  ]},
  { controlId: "3.10.5", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for CUI Asset Control", handling: "UPLOAD" }, { label: "Records of CUI asset inventories", handling: "REFERENCE" },
  ]},
  { controlId: "3.10.6", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  // RA
  { controlId: "3.11.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Risk Assessment Policy", handling: "UPLOAD" }, { label: "Procedures for Risk Assessment", handling: "UPLOAD" }, { label: "Risk assessment reports", handling: "REFERENCE" }, { label: "Records of vulnerability scans", handling: "REFERENCE" },
  ]},
  { controlId: "3.11.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Vulnerability Management", handling: "UPLOAD" }, { label: "Records of vulnerability remediation activities", handling: "REFERENCE" },
  ]},
  { controlId: "3.11.3", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Malicious Code Protection", handling: "UPLOAD" }, { label: "Records of malicious code protection updates and scans", handling: "REFERENCE" },
  ]},
  // CA
  { controlId: "3.12.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Security Assessment and Authorization Policy", handling: "UPLOAD" }, { label: "Procedures for Security Assessments", handling: "UPLOAD" }, { label: "Security assessment plans", handling: "REFERENCE" }, { label: "Security assessment reports", handling: "REFERENCE" },
  ]},
  { controlId: "3.12.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Plan of Action and Milestones (POA&M)", handling: "UPLOAD" }, { label: "POA&M Document", handling: "NATIVE" },
  ]},
  { controlId: "3.12.3", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Continuous Monitoring", handling: "UPLOAD" }, { label: "Continuous monitoring plan", handling: "REFERENCE" }, { label: "Records of continuous monitoring activities", handling: "REFERENCE" },
  ]},
  { controlId: "3.12.4", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Security Planning Policy", handling: "UPLOAD" }, { label: "Procedures for System Security Plan Development and Review", handling: "UPLOAD" }, { label: "Records of SSP reviews and updates", handling: "REFERENCE" },
  ]},
  // SC
  { controlId: "3.13.1", satisfactionType: "Hybrid", artifacts: [
    { label: "System and Communications Protection Policy", handling: "UPLOAD" }, { label: "Procedures for Boundary Protection", handling: "UPLOAD" }, { label: "System design & enterprise security architecture documentation", handling: "REFERENCE" },
  ]},
  { controlId: "3.13.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Security Engineering Principles", handling: "UPLOAD" }, { label: "Security architecture documentation", handling: "REFERENCE" },
  ]},
  { controlId: "3.13.3", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.13.3"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.13.4", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.13.4"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.13.5", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.13.5"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.13.6", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.13.7", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.13.8", satisfactionType: "Hybrid", artifacts: [
    { label: "Procedures for Transmission Confidentiality", handling: "UPLOAD" }, { label: "List of alternative physical safeguards", handling: "UPLOAD" },
  ]},
  { controlId: "3.13.9", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.13.9"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.13.10", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Cryptographic Key Management", handling: "UPLOAD" }, { label: "Cryptographic key management plan", handling: "REFERENCE" },
  ]},
  { controlId: "3.13.11", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.13.12", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.13.12"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.13.13", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.13.13"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.13.14", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.13.15", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.13.15"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.13.16", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  // SI
  { controlId: "3.14.1", satisfactionType: "Governance-Centric", artifacts: [
    { label: "System and Information Integrity Policy", handling: "UPLOAD" }, { label: "Procedures for Flaw Remediation", handling: "UPLOAD" }, { label: "Records of flaw remediation activities", handling: "REFERENCE" },
  ]},
  { controlId: "3.14.2", satisfactionType: "Governance-Centric", artifacts: [
    { label: "Procedures for Malicious Code Protection", handling: "UPLOAD" }, { label: "Records of malicious code protection activities", handling: "REFERENCE" },
  ]},
  { controlId: "3.14.3", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.14.3"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
  { controlId: "3.14.4", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.14.5", satisfactionType: "Technical-Centric", artifacts: [N_A_ARTIFACT] },
  { controlId: "3.14.6", satisfactionType: "Hybrid", artifacts: [
    { label: "Procedures for System Monitoring", handling: "UPLOAD" }, { label: "System monitoring records", handling: "REFERENCE" }, { label: "Records of actions taken in response to monitoring", handling: "REFERENCE" },
  ]},
  { controlId: "3.14.7", satisfactionType: "Hybrid", artifacts: (PARTIAL_DOCS_TO_CLOSE["3.14.7"] ?? []).map((a) => ({ label: a.label, handling: a.type as ArtifactHandling })) },
];

const specByControlId = new Map<string, ControlArtifactSpec>(
  CMMC_ARTIFACT_SPECS.map((s) => [s.controlId, s])
);

export function getSpecForControl(controlId: string): ControlArtifactSpec | undefined {
  return specByControlId.get(controlId);
}

/** All required artifacts for a control (excludes N/A). Used for governance completion and UI. */
export function getRequiredArtifactSpecs(controlId: string): RequiredArtifactSpec[] {
  const spec = specByControlId.get(controlId);
  if (!spec) return [];
  return spec.artifacts
    .filter((a) => a.handling !== "N/A")
    .map((a) => ({ label: a.label, type: a.handling }));
}

/** Artifact labels that require upload (UPLOAD or NATIVE) for implementation status. N/A and REFERENCE-only are excluded from required-upload count where appropriate. */
export function getRequiredUploadArtifactLabels(controlId: string): string[] {
  const spec = specByControlId.get(controlId);
  if (!spec) return [];
  return spec.artifacts
    .filter((a) => a.handling === "UPLOAD" || a.handling === "NATIVE")
    .map((a) => a.label);
}

/** First control ID (in family order) that requires the given upload label. Used for document-gating hints. */
export function getFirstControlRequiringUploadLabel(label: string): string | undefined {
  for (const controlId of ALL_CONTROL_IDS) {
    if (getRequiredUploadArtifactLabels(controlId).includes(label)) return controlId;
  }
  return undefined;
}
