/**
 * Governance artifacts required to close PARTIAL enclave controls.
 * PARTIAL controls have OS evidence from the 73-check run but need these docs/records
 * for full closure. Used by artifact-guide and governance-inventory.
 */

export type PartialArtifactType = "UPLOAD" | "REFERENCE" | "ATTESTATION" | "SYSTEM_POINTER";

export interface PartialDocSpec {
  label: string;
  type: PartialArtifactType;
  notes?: string;
}

/** NIST control id -> list of artifact specs (label + type). */
export const PARTIAL_DOCS_TO_CLOSE: Record<string, PartialDocSpec[]> = {
  "3.4.3": [
    { label: "Configuration Management Policy", type: "UPLOAD" },
    { label: "Procedures for Configuration Management", type: "UPLOAD" },
    { label: "Records of configuration change control activities", type: "REFERENCE", notes: "Ticket ID or report link" },
  ],
  "3.5.3": [
    { label: "Procedures for Remote Access", type: "UPLOAD" },
    { label: "Procedures for Authenticator Management", type: "REFERENCE" },
    { label: "Identification and Authentication Policy", type: "UPLOAD" },
    { label: "MFA Implementation Standard / Guide", type: "UPLOAD" },
  ],
  "3.5.4": [
    { label: "Identification and Authentication Policy", type: "UPLOAD" },
    { label: "Procedures for User Identification and Authentication", type: "UPLOAD" },
  ],
  "3.5.9": [
    { label: "Procedures for establishing, changing, and revoking authenticators", type: "REFERENCE" },
  ],
  "3.5.11": [
    { label: "Policy for authentication feedback (obscure feedback)", type: "UPLOAD" },
  ],
  "3.13.3": [
    { label: "Gov docs for separation of duties and system management", type: "UPLOAD" },
  ],
  "3.13.4": [
    { label: "Gov docs for information transfer controls", type: "UPLOAD" },
  ],
  "3.13.5": [
    { label: "Network/security architecture documentation and procedures", type: "UPLOAD" },
  ],
  "3.13.9": [
    { label: "Procedures for session/connection termination", type: "UPLOAD" },
  ],
  "3.13.12": [
    { label: "Gov docs for RDP/collaborative device use and restrictions", type: "UPLOAD" },
  ],
  "3.13.13": [
    { label: "Procedures for mobile code/script control", type: "UPLOAD" },
    { label: "Procedures for Malicious Code Protection", type: "REFERENCE" },
  ],
  "3.13.15": [
    { label: "Procedures for transmission integrity (SMB signing/crypto)", type: "UPLOAD" },
  ],
  "3.14.3": [
    { label: "Procedures for System Monitoring", type: "UPLOAD" },
    { label: "Security alert monitoring and response records", type: "REFERENCE", notes: "Log/ticket reference" },
  ],
  "3.14.7": [
    { label: "Procedures for System Monitoring", type: "UPLOAD" },
    { label: "Records of actions taken in response to monitoring", type: "REFERENCE", notes: "Log/ticket reference" },
  ],
};
