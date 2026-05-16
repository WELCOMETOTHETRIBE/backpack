/**
 * Unified evidence guide per control (example filenames and inherited notice).
 * Source: docs/CMMC_Unified_Guide.md — do not duplicate adjudication questions (see control_adjudication_questions.ts).
 */

export interface ControlEvidenceGuideEntry {
  /** Filenames or document names the user should upload or reference as evidence. */
  evidenceExamples: string[];
  /**
   * If this control is satisfied by a cloud provider's FedRAMP authorization,
   * set this to the name of that authorization (e.g., "Azure Government FedRAMP High Authorization (SC-28)").
   * When set, the ControlCard should display an "Inherited" badge instead of the question flow.
   */
  inheritedFrom?: string;
}

export const CONTROL_EVIDENCE_GUIDE: Record<string, ControlEvidenceGuideEntry> = {
  "3.1.1": {
    evidenceExamples: [
    "Access Control Policy.pdf",
    "Screenshot: Computer Management > Local Users and Groups showing active accounts.",
    "Evidence Hash: sha256:a1b2..."
    ]
  },
  "3.1.2": {
    evidenceExamples: [
    "Access Control Policy.pdf",
    "Screenshot: Local Security Policy > Security Options showing UAC settings.",
    "Evidence Hash: sha256:b3c4..."
    ]
  },
  "3.1.3": {
    evidenceExamples: [
    "System Security Plan (SSP).docx (describes data flows)"
    ],
  inheritedFrom: "Azure Government FedRAMP High Authorization (AC-4)"
  },
  "3.1.4": {
    evidenceExamples: [
    "MAC-POL-235 — Separation of Duties Policy (workflow-level personnel SoD across MacTech: code, ISA, RA, QMS Doc Control, PIM, maintenance, access, audit log review).",
    "MAC-SOP-235 v2.0 — Separation of Duties Matrix (Windows Server 2025 enclave operational appendix to MAC-POL-235; R1–R10 admin role matrix).",
    "MAC-POL-210 §8.1 — Access Control Policy section referencing both MAC-POL-235 and MAC-SOP-235.",
    "Trust Codex sod_matrix register — quarterly sod_matrix_review entry (signed) and any open sod_exception_approved entries.",
    "Trust Codex SCTM 3.1.4 detail — read-only matrix viewer pinned to the released MAC-SOP-235 sha256.",
    "AD/Entra export: members of MAC-Vault-* groups, evaluated against the matrix; latest detective-scan report attached.",
    "PIM activation log sample for R1, R5, R10 showing eligible-vs-active separation and time-boxing.",
    "GPO export: Deny logon locally / via RDP / as service entries for the prohibited combinations.",
    "WEF subscription manifest showing privileged-action event capture to the independent collector (R3 span)."
    ]
  },
  "3.1.5": {
    evidenceExamples: [
    "CSV Export: Members of Domain Admins and Enterprise Admins groups.",
    "Evidence Hash: sha256:d5e6..."
    ]
  },
  "3.1.6": {
    evidenceExamples: [
    "Screenshot: Active Directory showing admins have separate standard user accounts.",
    "Evidence Hash: sha256:f7g8..."
    ]
  },
  "3.1.7": {
    evidenceExamples: [
    "Screenshot: Advanced Audit Policy Configuration GPO showing \"Audit Privilege Use\" is enabled.",
    "Log Excerpt: Windows Security Log showing Event ID 4672.",
    "Evidence Hash: sha256:h9i0..."
    ]
  },
  "3.1.8": {
    evidenceExamples: [
    "Screenshot: Default Domain Policy > Account Lockout Policy GPO.",
    "Evidence Hash: sha256:j1k2..."
    ]
  },
  "3.1.9": {
    evidenceExamples: [
    "Login Banner Text.txt"
    ]
  },
  "3.1.10": {
    evidenceExamples: [
    "Screenshot: GPO setting for password-protected screen saver after 15 mins.",
    "Evidence Hash: sha256:l3m4..."
    ]
  },
  "3.1.11": {
    evidenceExamples: [
    "Screenshot: GPO setting to auto-disconnect idle RDP sessions.",
    "Evidence Hash: sha256:n5p6..."
    ]
  },
  "3.1.12": {
    evidenceExamples: [
    "Remote Access Policy.pdf"
    ],
  inheritedFrom: "Azure Government FedRAMP High Authorization (AC-17)"
  },
  "3.1.13": {
    evidenceExamples: [

    ],
  inheritedFrom: "Azure Government FedRAMP High Authorization (SC-8)"
  },
  "3.1.14": {
    evidenceExamples: [
    "Screenshot: Azure portal showing no Public IPs on CUI-scope VMs.",
    "Evidence Hash: sha256:q7r8..."
    ]
  },
  "3.1.15": {
    evidenceExamples: [
    "Privileged Access Authorization Memo.pdf"
    ]
  },
  "3.1.16": {
    evidenceExamples: [
    "Wireless Access Policy.pdf"
    ]
  },
  "3.1.17": {
    evidenceExamples: [
    "Screenshot: WiFi controller config showing WPA3-Enterprise & 802.1X.",
    "Evidence Hash: sha256:s9t0..."
    ]
  },
  "3.1.18": {
    evidenceExamples: [
    "Screenshot: Intune Device Compliance Policy.",
    "Evidence Hash: sha256:u1v2..."
    ]
  },
  "3.1.19": {
    evidenceExamples: [
    "Screenshot: Intune profile enforcing BitLocker/FileVault.",
    "Evidence Hash: sha256:w3x4..."
    ]
  },
  "3.1.20": {
    evidenceExamples: [
    "Public Website Content Review Procedure.docx"
    ]
  },
  "3.1.21": {
    evidenceExamples: [
    "Screenshot: GPO restricting USB drive access.",
    "Evidence Hash: sha256:y5z6..."
    ]
  },
  "3.1.22": {
    evidenceExamples: [
    "CUI Handling Guide.pdf"
    ]
  },
  "3.2.1": {
    evidenceExamples: [
    "Security Awareness Training Slides.pptx",
    "Employee Training Completion Records.csv"
    ]
  },
  "3.2.2": {
    evidenceExamples: [
    "Role-Based Security Training Plan.docx",
    "Administrator Training Certificates.pdf"
    ]
  },
  "3.2.3": {
    evidenceExamples: [
    "Insider Threat Awareness Training Module.zip"
    ]
  },
  "3.3.1": {
    evidenceExamples: [
    "Screenshot: Advanced Audit Policy Configuration GPO.",
    "Log Excerpt: Windows Event Log.",
    "Evidence Hash: sha256:a2b3..."
    ]
  },
  "3.3.2": {
    evidenceExamples: [
    "Audit Log Review Procedure.docx"
    ]
  },
  "3.3.3": {
    evidenceExamples: [
    "Screenshot: Active Directory showing no shared user accounts.",
    "Evidence Hash: sha256:c4d5..."
    ]
  },
  "3.3.4": {
    evidenceExamples: [
    "Screenshot: GPO configuring NTP server for time synchronization.",
    "Evidence Hash: sha256:k2l3..."
    ]
  },
  "3.3.5": {
    evidenceExamples: [
    "Screenshot: NTFS permissions on the C:\\Windows\\System32\\Winevt\\Logs directory.",
    "Evidence Hash: sha256:m4n5..."
    ]
  },
  "3.3.6": {
    evidenceExamples: [
    "Audit Log Management Roles.docx"
    ]
  },
  "3.3.7": {
    evidenceExamples: [
    "Screenshot: Splunk alert configured for log source failure.",
    "Evidence Hash: sha256:e6f7..."
    ]
  },
  "3.3.8": {
    evidenceExamples: [
    "Screenshot: Splunk correlation search linking related events.",
    "Evidence Hash: sha256:g8h9..."
    ]
  },
  "3.3.9": {
    evidenceExamples: [
    "Screenshot: Splunk dashboard for filtering and summarizing audit data.",
    "Evidence Hash: sha256:i0j1..."
    ]
  },
  "3.4.1": {
    evidenceExamples: [
    "Baseline Configuration Document - Windows Server 2022.docx",
    "System Inventory.xlsx"
    ]
  },
  "3.4.2": {
    evidenceExamples: [
    "Change Management Policy.pdf",
    "Screenshot: Jira/ServiceNow showing a change workflow."
    ]
  },
  "3.4.3": {
    evidenceExamples: [
    "Screenshot: GPO showing security settings aligned with CIS/STIG benchmarks.",
    "Evidence Hash: sha256:o6p7..."
    ]
  },
  "3.4.4": {
    evidenceExamples: [
    "Change Request Form - Firewall Rule Update.pdf"
    ]
  },
  "3.4.5": {
    evidenceExamples: [
    "Change Management Policy.pdf (section on authorization)"
    ]
  },
  "3.4.6": {
    evidenceExamples: [
    "Screenshot: Server Manager > Add Roles and Features showing only necessary roles installed.",
    "Evidence Hash: sha256:q8r9..."
    ]
  },
  "3.4.7": {
    evidenceExamples: [
    "Screenshot: Windows Defender Firewall rules blocking non-essential ports.",
    "Evidence Hash: sha256:s0t1..."
    ]
  },
  "3.4.8": {
    evidenceExamples: [
    "Screenshot: AppLocker or WDAC policy enforcing a whitelist.",
    "Evidence Hash: sha256:u2v3..."
    ]
  },
  "3.4.9": {
    evidenceExamples: [
    "Screenshot: Intune App Protection Policy restricting user software installation.",
    "Evidence Hash: sha256:w4x5..."
    ]
  },
  "3.5.1": {
    evidenceExamples: [
    "Identification and Authentication Policy.pdf",
    "CSV Export: Active Directory user and computer accounts.",
    "Evidence Hash: sha256:y6z7..."
    ]
  },
  "3.5.2": {
    evidenceExamples: [
    "Screenshot: Entra ID Authentication Methods policy.",
    "Evidence Hash: sha256:a8b9..."
    ]
  },
  "3.5.3": {
    evidenceExamples: [
    "Screenshot: Entra ID Conditional Access policy requiring MFA.",
    "Evidence Hash: sha256:c0d1..."
    ]
  },
  "3.5.4": {
    evidenceExamples: [
    "Screenshot: Entra ID policy for phishing-resistant MFA (FIDO2/WHfB).",
    "Evidence Hash: sha256:e2f3..."
    ]
  },
  "3.5.5": {
    evidenceExamples: [
    "User Account Management Procedure.docx"
    ]
  },
  "3.5.6": {
    evidenceExamples: [
    "PowerShell Script: Disables inactive AD accounts.",
    "Evidence Hash: sha256:g4h5..."
    ]
  },
  "3.5.7": {
    evidenceExamples: [
    "Screenshot: Default Domain Policy > Password Policy GPO.",
    "Evidence Hash: sha256:i6j7..."
    ]
  },
  "3.5.8": {
    evidenceExamples: [
    "Screenshot: Default Domain Policy > Password Policy GPO showing password history at 24.",
    "Evidence Hash: sha256:k8l9..."
    ]
  },
  "3.5.9": {
    evidenceExamples: [
    "Screenshot: AD user properties with \"User must change password at next logon\" checked.",
    "Evidence Hash: sha256:m0n1..."
    ]
  },
  "3.5.10": {
    evidenceExamples: [
    "Screenshot: GPO disabling LAN Manager hash storage.",
    "Evidence Hash: sha256:o2p3..."
    ]
  },
  "3.5.11": {
    evidenceExamples: [
    "Screenshot: Windows login screen showing password feedback obscured.",
    "Evidence Hash: sha256:q4r5..."
    ]
  },
  "3.6.1": {
    evidenceExamples: [
    "Incident Response Plan.pdf"
    ]
  },
  "3.6.2": {
    evidenceExamples: [
    "Incident Report Form.docx",
    "Screenshot: Incident tracking system (Jira/ticketing)."
    ]
  },
  "3.6.3": {
    evidenceExamples: [
    "Incident Response Test Plan - Q3 2024.docx",
    "Incident Response Test After-Action Report.pdf"
    ]
  },
  "3.7.1": {
    evidenceExamples: [
    "System Maintenance Policy.pdf",
    "Log: Completed maintenance activities."
    ]
  },
  "3.7.2": {
    evidenceExamples: [
    "List of Authorized Maintenance Personnel.xlsx",
    "Approved Maintenance Tools List.docx"
    ]
  },
  "3.7.3": {
    evidenceExamples: [
    "Off-Site Maintenance Procedure.docx",
    "Media Sanitization Form.pdf (signed)"
    ]
  },
  "3.7.4": {
    evidenceExamples: [
    "Maintenance Log - Server Room HVAC.pdf (showing vendor escort)"
    ]
  },
  "3.7.5": {
    evidenceExamples: [
    "Remote Maintenance Policy.pdf",
    "Screenshot: Splunk dashboard monitoring remote sessions.",
    "Evidence Hash: sha256:s6t7..."
    ]
  },
  "3.7.6": {
    evidenceExamples: [
    "Screenshot: Entra ID Conditional Access policy requiring MFA for maintenance roles.",
    "Evidence Hash: sha256:u8v9..."
    ]
  },
  "3.8.1": {
    evidenceExamples: [
    "Media Protection Policy.pdf",
    "Photograph: Locked cabinet for storing CUI media."
    ]
  },
  "3.8.2": {
    evidenceExamples: [
    "Media Access Control Procedure.docx"
    ]
  },
  "3.8.3": {
    evidenceExamples: [
    "Media Sanitization and Disposal Policy.pdf",
    "Certificate of Destruction.pdf (from shredding vendor)"
    ]
  },
  "3.8.4": {
    evidenceExamples: [
    "CUI Marking Guide.pdf",
    "Photograph: USB drive with a physical \"CUI\" label."
    ]
  },
  "3.8.5": {
    evidenceExamples: [
    "Media Transport Log.xlsx (for signing media in/out)"
    ]
  },
  "3.8.6": {
    evidenceExamples: [
    "Screenshot: GPO requiring BitLocker To Go for removable drives.",
    "Evidence Hash: sha256:w0x1..."
    ]
  },
  "3.8.7": {
    evidenceExamples: [
    "Screenshot: GPO blocking or restricting USB storage devices.",
    "Evidence Hash: sha256:y2z3..."
    ]
  },
  "3.8.8": {
    evidenceExamples: [
    "Media Protection Policy.pdf (section on prohibiting use of found media)"
    ]
  },
  "3.8.9": {
    evidenceExamples: [

    ],
  inheritedFrom: "Azure Government FedRAMP High Authorization (CP-9)"
  },
  "3.9.1": {
    evidenceExamples: [
    "Personnel Screening Policy.pdf",
    "Redacted background check report."
    ]
  },
  "3.9.2": {
    evidenceExamples: [
    "Employee Departure Checklist.docx"
    ]
  },
  "3.10.1": {
    evidenceExamples: [
    "Physical Access Control Policy.pdf",
    "Building access card reader logs."
    ]
  },
  "3.10.2": {
    evidenceExamples: [
    "Physical Security Plan.pdf",
    "Screenshot: Security camera software showing data center entrance.",
    "Evidence Hash: sha256:a4b5..."
    ]
  },
  "3.10.3": {
    evidenceExamples: [
    "Visitor Logbook.pdf (scanned copy)"
    ]
  },
  "3.10.4": {
    evidenceExamples: [
    "Export: Physical access control system (PACS) logs for server room."
    ]
  },
  "3.10.5": {
    evidenceExamples: [
    "Access Card Inventory.xlsx"
    ]
  },
  "3.10.6": {
    evidenceExamples: [
    "Telework Security Policy.pdf"
    ]
  },
  "3.11.1": {
    evidenceExamples: [
    "Annual Risk Assessment Report.pdf"
    ]
  },
  "3.11.2": {
    evidenceExamples: [
    "Report: Tenable.io vulnerability scan results.",
    "Evidence Hash: sha256:c6d7..."
    ]
  },
  "3.11.3": {
    evidenceExamples: [
    "Vulnerability Management Plan.pdf",
    "Screenshot: Ticketing system showing a vulnerability being tracked."
    ]
  },
  "3.12.1": {
    evidenceExamples: [
    "Security Control Assessment Plan.docx",
    "Security Assessment Report (SAR).pdf"
    ]
  },
  "3.12.2": {
    evidenceExamples: [
    "Plan of Action & Milestones (POA&M).xlsx"
    ]
  },
  "3.12.3": {
    evidenceExamples: [
    "Continuous Monitoring Strategy.pdf"
    ]
  },
  "3.12.4": {
    evidenceExamples: [
    "System Security Plan (SSP) for CUI Enclave.docx"
    ]
  },
  "3.13.1": {
    evidenceExamples: [
    "Screenshot: Palo Alto firewall security policy rulebase.",
    "Evidence Hash: sha256:e8f9..."
    ]
  },
  "3.13.2": {
    evidenceExamples: [
    "System Architecture Diagram with Security Overlays.vsdx"
    ]
  },
  "3.13.3": {
    evidenceExamples: [
    "Network Diagram: Showing management network on a separate VLAN.",
    "Evidence Hash: sha256:g0h1..."
    ]
  },
  "3.13.4": {
    evidenceExamples: [
    "Screenshot: Hyper-V settings preventing information leakage between VMs.",
    "Evidence Hash: sha256:i2j3..."
    ]
  },
  "3.13.5": {
    evidenceExamples: [
    "Network Diagram: Showing public web server in a DMZ.",
    "Evidence Hash: sha256:k4l5..."
    ]
  },
  "3.13.6": {
    evidenceExamples: [
    "Screenshot: Windows Firewall policy with default \"Block\" inbound rule.",
    "Evidence Hash: sha256:m6n7..."
    ]
  },
  "3.13.7": {
    evidenceExamples: [
    "Screenshot: VPN client config with \"Force Tunneling\" enabled.",
    "Evidence Hash: sha256:o8p9..."
    ]
  },
  "3.13.8": {
    evidenceExamples: [

    ],
  inheritedFrom: "Azure Government FedRAMP High Authorization (SC-8)"
  },
  "3.13.9": {
    evidenceExamples: [
    "Screenshot: Palo Alto firewall session timeout settings.",
    "Evidence Hash: sha256:q0r1..."
    ]
  },
  "3.13.10": {
    evidenceExamples: [
    "Cryptographic Key Management Plan.pdf"
    ]
  },
  "3.13.11": {
    evidenceExamples: [
    "Screenshot: GPO enabling \"FIPS mode\" on Windows systems.",
    "Evidence Hash: sha256:s2t3..."
    ]
  },
  "3.13.12": {
    evidenceExamples: [
    "Screenshot: Intune policy disabling webcams and microphones.",
    "Evidence Hash: sha256:u4v5..."
    ]
  },
  "3.13.13": {
    evidenceExamples: [
    "Screenshot: IE GPO settings restricting mobile code.",
    "Evidence Hash: sha256:w6x7..."
    ]
  },
  "3.13.14": {
    evidenceExamples: [
    "VoIP Security Policy.pdf",
    "Screenshot: VoIP system config with SRTP encryption enabled.",
    "Evidence Hash: sha256:y8z9..."
    ]
  },
  "3.13.15": {
    evidenceExamples: [
    "Screenshot: Azure App Gateway WAF policy protecting against session hijacking.",
    "Evidence Hash: sha256:a0b1..."
    ]
  },
  "3.13.16": {
    evidenceExamples: [

    ],
  inheritedFrom: "Azure Government FedRAMP High Authorization (SC-28)"
  },
  "3.14.1": {
    evidenceExamples: [
    "Vulnerability Management Plan.pdf",
    "Report: Patch management system (WSUS/Intune) showing compliance."
    ]
  },
  "3.14.2": {
    evidenceExamples: [
    "Screenshot: Microsoft Defender for Endpoint policy showing real-time protection enabled.",
    "Evidence Hash: sha256:c2d3..."
    ]
  },
  "3.14.3": {
    evidenceExamples: [
    "Security Alert Monitoring Procedure.docx",
    "Screenshot: Splunk alert from a threat intel feed and the resulting ticket."
    ]
  },
  "3.14.4": {
    evidenceExamples: [
    "Screenshot: Defender Antivirus update policy showing automatic daily updates.",
    "Evidence Hash: sha256:e4f5..."
    ]
  },
  "3.14.5": {
    evidenceExamples: [
    "Screenshot: Defender Antivirus policy showing \"Scan all downloaded files and attachments\" is enabled.",
    "Evidence Hash: sha256:g6h7..."
    ]
  },
  "3.14.6": {
    evidenceExamples: [
    "Screenshot: Microsoft Sentinel Analytics Rules detecting attack patterns.",
    "Evidence Hash: sha256:i8j9..."
    ]
  },
  "3.14.7": {
    evidenceExamples: [
    "Screenshot: Microsoft Sentinel UEBA enabled to detect anomalous user activity.",
    "Evidence Hash: sha256:k0l1..."
    ]
  }
};
