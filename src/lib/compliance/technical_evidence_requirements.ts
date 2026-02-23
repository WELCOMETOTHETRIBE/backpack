/**
 * CMMC OS — Technical Evidence Requirements
 * Source: NIST SP 800-171 Rev 2 / NIST SP 800-171A Assessment Procedures
 *
 * This file maps every Technical-Centric and Hybrid control to the specific
 * evidence artifacts a C3PAO assessor will examine, organized by technology stack.
 *
 * Technology Stack Keys:
 *   windows_server     — Windows Server 2019 / 2022 / 2025
 *   rhel               — Red Hat Enterprise Linux 8/9 (and CentOS/Rocky/Alma variants)
 *   macos              — macOS 13+ (Ventura/Sonoma) managed via MDM
 *   azure_gov          — Microsoft Azure Government (FedRAMP High)
 *   aws_govcloud       — AWS GovCloud (US)
 *   entra_id           — Microsoft Entra ID (Azure Active Directory)
 *   okta               — Okta Identity Platform
 *   intune             — Microsoft Intune (Endpoint Manager)
 *   jamf               — JAMF Pro (macOS/iOS MDM)
 *   defender           — Microsoft Defender for Endpoint / Defender for Cloud
 *   crowdstrike        — CrowdStrike Falcon
 *   splunk             — Splunk Enterprise / Splunk Cloud
 *   tenable            — Tenable.io / Tenable.sc (Nessus)
 *   palo_alto          — Palo Alto Networks NGFW / Prisma
 *   cisco_asa          — Cisco ASA / Firepower
 *   all                — Evidence required regardless of technology stack
 */

export type EvidenceType =
  | 'screenshot'
  | 'log_excerpt'
  | 'config_export'
  | 'tool_report'
  | 'api_export'
  | 'policy_config';

export interface EvidenceRequirement {
  id: string;
  title: string;
  description: string;
  type: EvidenceType;
  inherited?: boolean; // true = pre-populated from cloud provider FedRAMP authorization
  inheritedFrom?: string; // e.g., 'Azure Government FedRAMP High Authorization'
}

export interface ControlEvidenceMap {
  controlId: string;
  controlTitle: string;
  satisfactionType: 'Technical-Centric' | 'Hybrid';
  variants: Partial<Record<string, EvidenceRequirement[]>>;
}

export const technicalEvidenceRequirements: ControlEvidenceMap[] = [

  // ============================================================
  // ACCESS CONTROL (AC) — 3.1.x
  // ============================================================

  {
    controlId: '3.1.1',
    controlTitle: 'Limit system access to authorized users, processes acting on behalf of authorized users, and devices.',
    satisfactionType: 'Hybrid',
    variants: {
      windows_server: [
        { id: '3.1.1-win-local-users', title: 'Local User Account List', description: 'Screenshot of Computer Management > Local Users and Groups showing all active local accounts and their group memberships.', type: 'screenshot' },
        { id: '3.1.1-win-ad-users', title: 'Active Directory Enabled Accounts', description: 'Export of all enabled AD user accounts with their last logon date and group memberships. Run: Get-ADUser -Filter {Enabled -eq $true} -Properties LastLogonDate,MemberOf | Export-CSV', type: 'api_export' },
      ],
      entra_id: [
        { id: '3.1.1-entra-users', title: 'Entra ID User List', description: 'Export of all active users from Entra ID admin portal (Users > All Users > Download). Confirm only authorized personnel have accounts.', type: 'api_export' },
        { id: '3.1.1-entra-devices', title: 'Entra ID Registered Devices', description: 'Screenshot of Entra ID > Devices > All Devices showing only authorized, compliant devices registered to the tenant.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.1.1-azure-rbac', title: 'Azure Subscription IAM Role Assignments', description: 'Export of all role assignments at the subscription scope. Navigate to Subscription > Access Control (IAM) > Role Assignments > Download.', type: 'api_export', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (AC-2)' },
      ],
      rhel: [
        { id: '3.1.1-rhel-passwd', title: '/etc/passwd and /etc/shadow', description: 'Copy of /etc/passwd showing all system and user accounts. Confirm no unauthorized accounts exist.', type: 'config_export' },
        { id: '3.1.1-rhel-last', title: 'Last Login Report', description: 'Output of the `last` command showing recent login history for all accounts.', type: 'log_excerpt' },
      ],
      macos: [
        { id: '3.1.1-macos-users', title: 'macOS User Accounts', description: 'Screenshot of System Settings > Users & Groups showing all local accounts and their roles (Administrator vs. Standard).', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.2',
    controlTitle: 'Limit system access to the types of transactions and functions that authorized users are permitted to execute.',
    satisfactionType: 'Hybrid',
    variants: {
      windows_server: [
        { id: '3.1.2-win-uac', title: 'User Account Control (UAC) Settings', description: 'Screenshot of Local Security Policy > Security Settings > Local Policies > Security Options showing UAC configuration.', type: 'screenshot' },
        { id: '3.1.2-win-gpo-rights', title: 'User Rights Assignment GPO', description: 'Screenshot of Group Policy Management showing User Rights Assignment settings (e.g., "Log on locally", "Access this computer from the network").', type: 'screenshot' },
      ],
      entra_id: [
        { id: '3.1.2-entra-ca', title: 'Conditional Access Policies', description: 'Screenshot of Entra ID > Security > Conditional Access > Policies showing policies that restrict access by user role, device compliance, and location.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.1.2-azure-rbac-custom', title: 'Custom Azure RBAC Role Definitions', description: 'Export of any custom role definitions that restrict permissions to least-privilege for CUI-related resources.', type: 'api_export' },
      ],
      rhel: [
        { id: '3.1.2-rhel-sudoers', title: 'Sudoers Configuration', description: 'Copy of /etc/sudoers and all files in /etc/sudoers.d/ showing which users and groups have elevated privilege and for which commands.', type: 'config_export' },
      ],
    },
  },

  {
    controlId: '3.1.3',
    controlTitle: 'Control the flow of CUI in accordance with approved authorizations.',
    satisfactionType: 'Hybrid',
    variants: {
      windows_server: [
        { id: '3.1.3-win-firewall', title: 'Windows Firewall Rules', description: 'Export of Windows Defender Firewall rules (netsh advfirewall export or GPO screenshot) showing rules that restrict CUI data flows.', type: 'config_export' },
      ],
      azure_gov: [
        { id: '3.1.3-azure-nsg', title: 'Network Security Group (NSG) Rules', description: 'Export of NSG rules for all subnets containing CUI resources. Navigate to NSG > Inbound/Outbound Security Rules > Export.', type: 'api_export', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (AC-4)' },
        { id: '3.1.3-azure-vnet', title: 'Virtual Network Topology', description: 'Screenshot of the Azure Virtual Network topology diagram showing the CUI boundary, subnet segmentation, and peering connections.', type: 'screenshot' },
      ],
      palo_alto: [
        { id: '3.1.3-palo-security-policy', title: 'Palo Alto Security Policy Rules', description: 'Screenshot or export of the Palo Alto security policy rulebase showing rules that control CUI data flows between zones.', type: 'config_export' },
      ],
      cisco_asa: [
        { id: '3.1.3-asa-acl', title: 'Cisco ASA Access Control Lists', description: 'Output of `show access-list` showing ACLs that restrict CUI data flows.', type: 'config_export' },
      ],
    },
  },

  {
    controlId: '3.1.5',
    controlTitle: 'Employ the principle of least privilege, including for specific security functions and privileged accounts.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.1.5-win-admin-groups', title: 'Administrative Group Membership', description: 'Export of Domain Admins, Enterprise Admins, Schema Admins, and Administrators group memberships. Run: Get-ADGroupMember -Identity "Domain Admins" | Export-CSV', type: 'api_export' },
        { id: '3.1.5-win-privileged-accounts', title: 'Privileged Account Audit', description: 'Screenshot showing that privileged accounts are separate from standard user accounts (e.g., admin accounts have no email, are not used for daily work).', type: 'screenshot' },
      ],
      entra_id: [
        { id: '3.1.5-entra-pim', title: 'Privileged Identity Management (PIM) Configuration', description: 'Screenshot of Entra PIM showing that privileged roles (Global Admin, etc.) are configured as eligible (not permanent) and require activation with justification.', type: 'screenshot' },
        { id: '3.1.5-entra-roles', title: 'Entra ID Role Assignments', description: 'Screenshot of Entra ID > Roles and Administrators showing all active role assignments and confirming no over-privileged accounts.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.1.5-azure-rbac-assignments', title: 'Azure RBAC Role Assignments (Least Privilege)', description: 'Export of all role assignments confirming no accounts have Owner or Contributor at subscription scope without documented justification.', type: 'api_export' },
      ],
      rhel: [
        { id: '3.1.5-rhel-sudo-log', title: 'Sudo Usage Log', description: 'Excerpt from /var/log/secure or journalctl showing sudo usage, confirming privileged commands are logged and attributed to specific users.', type: 'log_excerpt' },
      ],
    },
  },

  {
    controlId: '3.1.6',
    controlTitle: 'Use non-privileged accounts or roles when accessing non-security functions.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.1.6-win-dual-accounts', title: 'Dual Account Policy Evidence', description: 'Screenshot showing that administrators have two accounts: a standard account for daily work and a separate privileged account for administrative tasks. Show both accounts in AD.', type: 'screenshot' },
      ],
      entra_id: [
        { id: '3.1.6-entra-admin-email', title: 'Admin Account Email Restriction', description: 'Screenshot of Entra ID admin accounts showing they do not have Exchange mailboxes or are not licensed for email, confirming they are not used for daily work.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.7',
    controlTitle: 'Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.1.7-win-audit-privilege', title: 'Audit Privilege Use Policy', description: 'Screenshot of Advanced Audit Policy Configuration showing "Audit Privilege Use" is enabled for Success and Failure.', type: 'screenshot' },
        { id: '3.1.7-win-event-log', title: 'Event Log Sample (Event ID 4672)', description: 'Screenshot or export of Windows Security Event Log showing Event ID 4672 (Special Privileges Assigned to New Logon) entries.', type: 'log_excerpt' },
      ],
      rhel: [
        { id: '3.1.7-rhel-auditd', title: 'Auditd Rules for Privileged Commands', description: 'Output of `auditctl -l` or contents of /etc/audit/rules.d/ showing rules that capture execution of privileged commands (e.g., /usr/bin/sudo, /usr/bin/su).', type: 'config_export' },
      ],
      splunk: [
        { id: '3.1.7-splunk-priv-search', title: 'Splunk Search for Privileged Function Execution', description: 'Screenshot of a saved Splunk search or dashboard showing privileged command execution events, confirming they are captured and reviewable.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.8',
    controlTitle: 'Limit unsuccessful logon attempts.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.1.8-win-lockout-policy', title: 'Account Lockout Policy', description: 'Screenshot of Default Domain Policy > Account Lockout Policy showing Lockout Threshold (≤5 attempts), Lockout Duration (≥15 min), and Reset Counter settings.', type: 'screenshot' },
      ],
      entra_id: [
        { id: '3.1.8-entra-smart-lockout', title: 'Entra ID Smart Lockout Configuration', description: 'Screenshot of Entra ID > Security > Authentication Methods > Password Protection showing Smart Lockout threshold and duration settings.', type: 'screenshot' },
      ],
      rhel: [
        { id: '3.1.8-rhel-pam-faillock', title: 'PAM Faillock Configuration', description: 'Contents of /etc/security/faillock.conf or PAM configuration showing account lockout after failed attempts.', type: 'config_export' },
      ],
      macos: [
        { id: '3.1.8-macos-lockout', title: 'macOS Login Window Policy', description: 'Screenshot of MDM profile (Intune or JAMF) showing the maximum number of failed login attempts before lockout.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.10',
    controlTitle: 'Use session lock with pattern-hiding displays after a period of inactivity.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.1.10-win-screensaver-gpo', title: 'Screen Saver GPO Settings', description: 'Screenshot of GPO > User Configuration > Administrative Templates > Control Panel > Personalization showing screen saver timeout (≤15 min) and password-protect settings.', type: 'screenshot' },
      ],
      intune: [
        { id: '3.1.10-intune-lock', title: 'Intune Device Configuration — Screen Lock', description: 'Screenshot of the Intune Device Configuration profile showing the maximum minutes of inactivity before screen locks.', type: 'screenshot' },
      ],
      jamf: [
        { id: '3.1.10-jamf-lock', title: 'JAMF Configuration Profile — Screen Lock', description: 'Screenshot of the JAMF configuration profile showing screen lock timeout settings deployed to managed Macs.', type: 'screenshot' },
      ],
      rhel: [
        { id: '3.1.10-rhel-tmux-lock', title: 'TMOUT Variable / Screen Lock Configuration', description: 'Contents of /etc/profile.d/ files showing TMOUT variable set for automatic session timeout, or GNOME screensaver lockout configuration.', type: 'config_export' },
      ],
    },
  },

  {
    controlId: '3.1.11',
    controlTitle: 'Terminate (automatically) a user session after a defined condition.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.1.11-win-session-timeout', title: 'RDP Session Timeout GPO', description: 'Screenshot of GPO > Computer Configuration > Administrative Templates > Windows Components > Remote Desktop Services showing session time limit settings.', type: 'screenshot' },
      ],
      entra_id: [
        { id: '3.1.11-entra-token-lifetime', title: 'Entra ID Token Lifetime Policy', description: 'Screenshot or export of Entra ID token lifetime policies showing session token expiration settings.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.1.11-azure-app-timeout', title: 'Azure App Service Session Timeout', description: 'Screenshot of Azure App Service configuration showing session timeout settings for any web applications in scope.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.12',
    controlTitle: 'Monitor and control remote access sessions.',
    satisfactionType: 'Hybrid',
    variants: {
      windows_server: [
        { id: '3.1.12-win-rdp-audit', title: 'RDP Connection Audit Log', description: 'Excerpt from Windows Security Event Log showing Event ID 4624 (Type 10 — Remote Interactive) logon events, confirming remote sessions are logged.', type: 'log_excerpt' },
      ],
      azure_gov: [
        { id: '3.1.12-azure-bastion', title: 'Azure Bastion Configuration', description: 'Screenshot of Azure Bastion host configuration, confirming all RDP/SSH access to VMs goes through Bastion (no public IP on VMs).', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (AC-17)' },
        { id: '3.1.12-azure-jit', title: 'Just-in-Time VM Access Policy', description: 'Screenshot of Microsoft Defender for Cloud > Just-in-Time VM Access showing JIT policies configured for all CUI-scope VMs.', type: 'screenshot' },
      ],
      splunk: [
        { id: '3.1.12-splunk-remote-sessions', title: 'Remote Session Monitoring Dashboard', description: 'Screenshot of Splunk dashboard or saved search showing remote access session events (VPN connections, RDP sessions, SSH logins).', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.13',
    controlTitle: 'Employ cryptographic mechanisms to protect the confidentiality of remote access sessions.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.1.13-win-rdp-tls', title: 'RDP Security Layer and Encryption Level', description: 'Screenshot of GPO > Computer Configuration > Administrative Templates > Windows Components > Remote Desktop Services > Security showing Security Layer set to SSL (TLS 1.2+) and Encryption Level set to High.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.1.13-azure-vpn-ipsec', title: 'Azure VPN Gateway IKE/IPsec Policy', description: 'Screenshot of Azure VPN Gateway custom IKE policy showing approved cryptographic algorithms (AES-256, SHA-256, DHGroup14 or higher).', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (SC-8)' },
      ],
      all: [
        { id: '3.1.13-vpn-config', title: 'VPN Configuration (Cryptographic Settings)', description: 'Screenshot or export of VPN gateway/client configuration showing the encryption protocol (IKEv2/IPsec or TLS 1.2+) and cipher suites in use.', type: 'config_export' },
      ],
    },
  },

  {
    controlId: '3.1.14',
    controlTitle: 'Route remote access via managed access control points.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.1.14-azure-bastion-only', title: 'No Public IP on VMs (Bastion-Only Access)', description: 'Screenshot confirming that no VMs in the CUI scope have public IP addresses assigned, and all remote access is routed through Azure Bastion or VPN Gateway.', type: 'screenshot' },
      ],
      palo_alto: [
        { id: '3.1.14-palo-globalprotect', title: 'GlobalProtect VPN Gateway Configuration', description: 'Screenshot of Palo Alto GlobalProtect gateway configuration showing all remote access is routed through the managed gateway.', type: 'screenshot' },
      ],
      all: [
        { id: '3.1.14-network-diagram', title: 'Network Diagram Showing Remote Access Path', description: 'Network diagram (reference only — stored in enclave) showing that all remote access enters the CUI boundary through a single, managed access control point (VPN concentrator, Bastion host, or jump server).', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.17',
    controlTitle: 'Protect wireless access using authentication and encryption.',
    satisfactionType: 'Technical-Centric',
    variants: {
      all: [
        { id: '3.1.17-wifi-config', title: 'Wireless Access Point Configuration', description: 'Screenshot of wireless access point or controller configuration showing WPA3-Enterprise (or WPA2-Enterprise minimum) with 802.1X authentication and AES-CCMP encryption.', type: 'screenshot' },
        { id: '3.1.17-wifi-radius', title: 'RADIUS / 802.1X Authentication Configuration', description: 'Screenshot of RADIUS server configuration (NPS, Cisco ISE, or similar) showing 802.1X authentication is required for wireless access.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.18',
    controlTitle: 'Control connection of mobile devices.',
    satisfactionType: 'Technical-Centric',
    variants: {
      intune: [
        { id: '3.1.18-intune-compliance', title: 'Intune Device Compliance Policy', description: 'Screenshot of Intune Compliance Policy showing requirements for mobile devices (encryption, PIN, OS version, jailbreak detection).', type: 'screenshot' },
        { id: '3.1.18-intune-ca', title: 'Conditional Access — Require Compliant Device', description: 'Screenshot of Entra ID Conditional Access policy requiring device compliance before accessing CUI resources.', type: 'screenshot' },
      ],
      jamf: [
        { id: '3.1.18-jamf-compliance', title: 'JAMF Compliance Framework Configuration', description: 'Screenshot of JAMF compliance rules showing requirements for managed mobile devices.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.1.19',
    controlTitle: 'Encrypt CUI on mobile devices and mobile computing platforms.',
    satisfactionType: 'Technical-Centric',
    variants: {
      intune: [
        { id: '3.1.19-intune-encryption', title: 'Intune Device Configuration — Encryption', description: 'Screenshot of Intune Device Configuration profile showing BitLocker (Windows) or FileVault (macOS) encryption is required and enforced.', type: 'screenshot' },
      ],
      jamf: [
        { id: '3.1.19-jamf-filevault', title: 'JAMF FileVault Encryption Status', description: 'Screenshot of JAMF FileVault management showing encryption is enabled and key escrow is configured for all managed Macs.', type: 'screenshot' },
      ],
      windows_server: [
        { id: '3.1.19-win-bitlocker', title: 'BitLocker Encryption Status', description: 'Output of `manage-bde -status` on all CUI-scope endpoints, or Intune/SCCM report showing BitLocker encryption status.', type: 'tool_report' },
      ],
    },
  },

  {
    controlId: '3.1.21',
    controlTitle: 'Limit use of portable storage devices on external systems.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.1.21-win-usb-gpo', title: 'Removable Storage GPO', description: 'Screenshot of GPO > Computer Configuration > Administrative Templates > System > Removable Storage Access showing USB/removable storage is denied or restricted.', type: 'screenshot' },
      ],
      intune: [
        { id: '3.1.21-intune-usb', title: 'Intune Device Restriction — USB Block', description: 'Screenshot of Intune Device Restriction profile showing removable storage devices are blocked or restricted.', type: 'screenshot' },
      ],
      defender: [
        { id: '3.1.21-defender-device-control', title: 'Defender for Endpoint Device Control Policy', description: 'Screenshot of Microsoft Defender for Endpoint Device Control policy showing USB/removable media restrictions.', type: 'screenshot' },
      ],
    },
  },

  // ============================================================
  // AUDIT AND ACCOUNTABILITY (AU) — 3.3.x
  // ============================================================

  {
    controlId: '3.3.1',
    controlTitle: 'Create and retain system audit logs and records to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.3.1-win-audit-policy', title: 'Advanced Audit Policy Configuration', description: 'Screenshot of GPO > Computer Configuration > Windows Settings > Security Settings > Advanced Audit Policy Configuration showing all relevant categories enabled (Account Logon, Account Management, Logon/Logoff, Object Access, Policy Change, Privilege Use, System).', type: 'screenshot' },
        { id: '3.3.1-win-log-size', title: 'Event Log Size and Retention Settings', description: 'Screenshot of Event Viewer > Properties for Security, System, and Application logs showing maximum log size (≥1GB for Security) and retention policy.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.3.1-azure-diag-settings', title: 'Azure Diagnostic Settings', description: 'Screenshot of Diagnostic Settings for all CUI-scope resources (VMs, Storage Accounts, Key Vaults, NSGs) showing logs forwarded to Log Analytics Workspace with ≥90 day retention.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (AU-2, AU-9)' },
        { id: '3.3.1-azure-activity-log', title: 'Azure Activity Log Retention', description: 'Screenshot of Azure Monitor > Activity Log showing retention is set to ≥90 days and logs are exported to a storage account or Log Analytics.', type: 'screenshot' },
      ],
      splunk: [
        { id: '3.3.1-splunk-index-retention', title: 'Splunk Index Retention Policy', description: 'Screenshot of Splunk Settings > Indexes showing the retention period (frozenTimePeriodInSecs) for the security index is ≥90 days (≥3 years recommended).', type: 'screenshot' },
      ],
      rhel: [
        { id: '3.3.1-rhel-auditd-config', title: 'Auditd Configuration', description: 'Contents of /etc/audit/auditd.conf showing log file size, rotation policy, and retention settings.', type: 'config_export' },
        { id: '3.3.1-rhel-auditd-rules', title: 'Auditd Rules', description: 'Output of `auditctl -l` or contents of /etc/audit/rules.d/ showing all active audit rules.', type: 'config_export' },
      ],
    },
  },

  {
    controlId: '3.3.3',
    controlTitle: 'Review and update logged events.',
    satisfactionType: 'Hybrid',
    variants: {
      splunk: [
        { id: '3.3.3-splunk-review-dashboard', title: 'Audit Log Review Dashboard', description: 'Screenshot of Splunk dashboard used for regular audit log review, showing the types of events reviewed and the review schedule.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.3.3-azure-sentinel-analytics', title: 'Microsoft Sentinel Analytics Rules', description: 'Screenshot of Microsoft Sentinel Analytics rules showing the event types that trigger alerts for review.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.3.4',
    controlTitle: 'Alert in the event of an audit logging process failure.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.3.4-win-audit-failure-gpo', title: 'Audit: Shut Down System if Unable to Log Security Audits', description: 'Screenshot of Local Security Policy > Security Options showing "Audit: Shut down system immediately if unable to log security audits" is configured.', type: 'screenshot' },
      ],
      splunk: [
        { id: '3.3.4-splunk-monitoring-console', title: 'Splunk Monitoring Console Alerts', description: 'Screenshot of Splunk Monitoring Console showing alerts configured for indexer failures, license violations, or log ingestion gaps.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.3.4-azure-monitor-alert', title: 'Azure Monitor Alert for Diagnostic Setting Failure', description: 'Screenshot of Azure Monitor Alert rule configured to notify when diagnostic log ingestion fails or stops.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.3.5',
    controlTitle: 'Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity.',
    satisfactionType: 'Technical-Centric',
    variants: {
      splunk: [
        { id: '3.3.5-splunk-correlation-rules', title: 'Splunk Correlation Searches', description: 'Screenshot of Splunk correlation searches or Enterprise Security notable event rules showing cross-source event correlation.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.3.5-azure-sentinel-incidents', title: 'Microsoft Sentinel Incident Configuration', description: 'Screenshot of Microsoft Sentinel showing analytics rules that correlate events across multiple data sources into incidents.', type: 'screenshot' },
      ],
      defender: [
        { id: '3.3.5-defender-incidents', title: 'Defender for Endpoint Incident Correlation', description: 'Screenshot of Microsoft Defender XDR Incidents view showing correlated alerts from multiple sources.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.3.7',
    controlTitle: 'Provide a system capability that compares and synchronizes internal system clocks with an authoritative source to generate time stamps for audit records.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.3.7-win-ntp-gpo', title: 'NTP Configuration GPO', description: 'Screenshot of GPO > Computer Configuration > Administrative Templates > System > Windows Time Service showing NTP server configuration (pointing to NIST, DoD, or authoritative time source).', type: 'screenshot' },
        { id: '3.3.7-win-w32tm', title: 'W32tm Status Output', description: 'Output of `w32tm /query /status` on a domain controller showing the current time source and stratum.', type: 'log_excerpt' },
      ],
      rhel: [
        { id: '3.3.7-rhel-chrony', title: 'Chrony Configuration', description: 'Contents of /etc/chrony.conf showing NTP server configuration pointing to an authoritative time source.', type: 'config_export' },
      ],
      azure_gov: [
        { id: '3.3.7-azure-ntp', title: 'Azure VM NTP Configuration', description: 'Azure VMs sync to time.windows.com by default. Screenshot of VM time settings or confirmation that the default Azure time sync is in use.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (AU-8)' },
      ],
    },
  },

  {
    controlId: '3.3.8',
    controlTitle: 'Protect audit information and audit tools from unauthorized access, modification, and deletion.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.3.8-win-log-acl', title: 'Event Log ACL Configuration', description: 'Screenshot of Event Log Properties showing the Security descriptor / permissions, confirming only authorized roles can clear or modify logs.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.3.8-azure-log-immutability', title: 'Azure Storage Immutability Policy', description: 'Screenshot of Azure Storage Account > Blob Service > Containers showing an immutability policy (WORM) applied to the log archive container.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (AU-9)' },
      ],
      splunk: [
        { id: '3.3.8-splunk-rbac', title: 'Splunk Role-Based Access Control', description: 'Screenshot of Splunk Settings > Access Controls > Roles showing that only authorized roles have access to delete or modify indexed data.', type: 'screenshot' },
      ],
    },
  },

  // ============================================================
  // CONFIGURATION MANAGEMENT (CM) — 3.4.x
  // ============================================================

  {
    controlId: '3.4.3',
    controlTitle: 'Track, review, approve, and log changes to organizational systems.',
    satisfactionType: 'Hybrid',
    variants: {
      azure_gov: [
        { id: '3.4.3-azure-change-tracking', title: 'Azure Change Tracking and Inventory', description: 'Screenshot of Azure Automation > Change Tracking and Inventory showing tracked changes to software, files, registry, and services on CUI-scope VMs.', type: 'screenshot' },
        { id: '3.4.3-azure-activity-log-changes', title: 'Azure Activity Log — Resource Changes', description: 'Screenshot of Azure Activity Log filtered to show resource modification events (Write, Delete) for CUI-scope resources.', type: 'log_excerpt' },
      ],
      windows_server: [
        { id: '3.4.3-win-sccm-changes', title: 'SCCM/Intune Software Change Log', description: 'Screenshot or report from SCCM or Intune showing software installation/removal history on CUI-scope endpoints.', type: 'tool_report' },
      ],
    },
  },

  {
    controlId: '3.4.4',
    controlTitle: 'Analyze the security impact of changes prior to implementation.',
    satisfactionType: 'Hybrid',
    variants: {
      all: [
        { id: '3.4.4-change-ticket', title: 'Change Request with Security Impact Analysis', description: 'Sample change request ticket (from ServiceNow, Jira, or similar) showing a completed security impact analysis section prior to approval.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.4.8',
    controlTitle: 'Apply deny-by-default / allow-by-exception policy to prevent the use of unauthorized software.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.4.8-win-applocker', title: 'AppLocker Policy Export', description: 'Export of AppLocker policy (Get-AppLockerPolicy -Effective | Export-Clixml) showing rules that enforce an allow-by-exception model for executable, installer, and script files.', type: 'config_export' },
        { id: '3.4.8-win-wdac', title: 'Windows Defender Application Control (WDAC) Policy', description: 'Export of WDAC policy XML file showing the application whitelist/allowlist in effect.', type: 'config_export' },
      ],
      defender: [
        { id: '3.4.8-defender-asr', title: 'Defender Attack Surface Reduction Rules', description: 'Screenshot of Microsoft Defender for Endpoint Attack Surface Reduction rules configuration showing rules that block unauthorized software execution.', type: 'screenshot' },
      ],
      crowdstrike: [
        { id: '3.4.8-cs-prevention-policy', title: 'CrowdStrike Prevention Policy', description: 'Screenshot of CrowdStrike Falcon Prevention Policy showing application blocking settings.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.4.9',
    controlTitle: 'Control and monitor user-installed software.',
    satisfactionType: 'Technical-Centric',
    variants: {
      intune: [
        { id: '3.4.9-intune-app-policy', title: 'Intune App Protection / Restriction Policy', description: 'Screenshot of Intune App Configuration or Compliance Policy showing restrictions on user-installed software.', type: 'screenshot' },
      ],
      windows_server: [
        { id: '3.4.9-win-standard-user', title: 'Standard User Cannot Install Software (UAC)', description: 'Screenshot confirming that standard user accounts do not have local administrator rights and cannot install software without elevation.', type: 'screenshot' },
      ],
      jamf: [
        { id: '3.4.9-jamf-restricted-software', title: 'JAMF Restricted Software List', description: 'Screenshot of JAMF Pro > Restricted Software showing unauthorized applications that are blocked.', type: 'screenshot' },
      ],
    },
  },

  // ============================================================
  // IDENTIFICATION AND AUTHENTICATION (IA) — 3.5.x
  // ============================================================

  {
    controlId: '3.5.1',
    controlTitle: 'Identify system users, processes acting on behalf of users, and devices.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.5.1-win-ad-accounts', title: 'Active Directory User and Computer Accounts', description: 'Export of all AD user and computer accounts showing unique identifiers (SamAccountName, SID) for all entities in scope.', type: 'api_export' },
      ],
      entra_id: [
        { id: '3.5.1-entra-user-list', title: 'Entra ID User and Service Principal List', description: 'Export of all users and service principals from Entra ID, confirming each has a unique identity.', type: 'api_export' },
      ],
      azure_gov: [
        { id: '3.5.1-azure-managed-identity', title: 'Azure Managed Identity Configuration', description: 'Screenshot of Azure resources showing system-assigned or user-assigned managed identities used for service-to-service authentication (no shared credentials).', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.5.2',
    controlTitle: 'Authenticate (or verify) the identities of users, processes, or devices, as a prerequisite to allowing access to organizational systems.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.5.2-win-kerberos', title: 'Kerberos Authentication Configuration', description: 'Screenshot of Default Domain Policy > Account Policies > Kerberos Policy showing ticket lifetime and renewal settings.', type: 'screenshot' },
      ],
      entra_id: [
        { id: '3.5.2-entra-auth-methods', title: 'Entra ID Authentication Methods Policy', description: 'Screenshot of Entra ID > Security > Authentication Methods showing enabled authentication methods and their scope.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.5.2-azure-auth', title: 'Azure Resource Authentication Configuration', description: 'Screenshot confirming that all Azure resources require authentication (no anonymous access) and use Entra ID or managed identities.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (IA-2)' },
      ],
    },
  },

  {
    controlId: '3.5.3',
    controlTitle: 'Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.',
    satisfactionType: 'Technical-Centric',
    variants: {
      entra_id: [
        { id: '3.5.3-entra-mfa-ca', title: 'Conditional Access MFA Policy', description: 'Screenshot of Entra ID Conditional Access policy requiring MFA for all users (or at minimum all privileged users) when accessing CUI resources.', type: 'screenshot' },
        { id: '3.5.3-entra-mfa-report', title: 'MFA Registration Report', description: 'Screenshot of Entra ID > Security > Authentication Methods > User Registration Details showing MFA registration status for all users.', type: 'screenshot' },
      ],
      okta: [
        { id: '3.5.3-okta-mfa-policy', title: 'Okta MFA Enrollment Policy', description: 'Screenshot of Okta Security > Multifactor > Factor Enrollment Policy showing MFA is required for all users.', type: 'screenshot' },
      ],
      windows_server: [
        { id: '3.5.3-win-smartcard', title: 'Smart Card / PIV Enforcement GPO', description: 'Screenshot of GPO > Computer Configuration > Windows Settings > Security Settings > Local Policies > Security Options showing "Interactive logon: Require smart card" for privileged accounts.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.5.4',
    controlTitle: 'Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts.',
    satisfactionType: 'Technical-Centric',
    variants: {
      entra_id: [
        { id: '3.5.4-entra-phishing-resistant', title: 'Phishing-Resistant MFA Configuration', description: 'Screenshot of Entra ID Authentication Methods showing FIDO2 security keys or Windows Hello for Business are enabled (replay-resistant methods).', type: 'screenshot' },
      ],
      windows_server: [
        { id: '3.5.4-win-ntlm-restriction', title: 'NTLM Restriction GPO', description: 'Screenshot of GPO > Security Options showing NTLM is restricted or disabled in favor of Kerberos (which is inherently replay-resistant).', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.5.9',
    controlTitle: 'Allow temporary password use for system logons with an immediate change to a permanent password.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.5.9-win-must-change-password', title: '"User Must Change Password at Next Logon" Setting', description: 'Screenshot of AD User Properties showing "User must change password at next logon" is checked for any newly created or reset accounts.', type: 'screenshot' },
      ],
      entra_id: [
        { id: '3.5.9-entra-temp-password', title: 'Entra ID Temporary Access Pass Policy', description: 'Screenshot of Entra ID > Security > Authentication Methods > Temporary Access Pass showing the policy is configured with a short lifetime.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.5.11',
    controlTitle: 'Store and transmit only cryptographically-protected passwords.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.5.11-win-no-lm-hash', title: 'LM Hash Storage Disabled', description: 'Screenshot of GPO > Security Options showing "Network security: Do not store LAN Manager hash value on next password change" is Enabled.', type: 'screenshot' },
        { id: '3.5.11-win-password-encryption', title: 'Password Encryption in Transit (Kerberos/NTLMv2)', description: 'Screenshot of GPO > Security Options showing minimum NTLMv2 session security is enforced (128-bit encryption).', type: 'screenshot' },
      ],
      entra_id: [
        { id: '3.5.11-entra-sspr', title: 'Entra ID Password Hash Sync or Federated Auth', description: 'Screenshot of Entra ID Connect configuration showing Password Hash Synchronization or Federated Authentication is in use (not plaintext password sync).', type: 'screenshot' },
      ],
    },
  },

  // ============================================================
  // INCIDENT RESPONSE (IR) — 3.6.x
  // ============================================================

  {
    controlId: '3.7.3',
    controlTitle: 'Ensure equipment removed for off-site maintenance is sanitized of any CUI.',
    satisfactionType: 'Hybrid',
    variants: {
      all: [
        { id: '3.7.3-maintenance-log', title: 'Maintenance Log with Sanitization Record', description: 'Copy of maintenance log entries showing that CUI was sanitized or removed from equipment before it was sent off-site for maintenance.', type: 'log_excerpt' },
      ],
    },
  },

  // ============================================================
  // MEDIA PROTECTION (MP) — 3.8.x
  // ============================================================

  {
    controlId: '3.8.4',
    controlTitle: 'Mark media with necessary CUI markings and distribution limitations.',
    satisfactionType: 'Hybrid',
    variants: {
      all: [
        { id: '3.8.4-media-marking', title: 'CUI Media Marking Evidence', description: 'Photograph or screenshot showing physical media (USB drives, external hard drives, DVDs) used for CUI are properly marked with CUI designation.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.8.6',
    controlTitle: 'Implement cryptographic mechanisms to protect and restrict access to CUI on portable digital media unless protected by alternative physical safeguards.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.8.6-win-bitlocker-to-go', title: 'BitLocker To Go Policy', description: 'Screenshot of GPO > Computer Configuration > Administrative Templates > Windows Components > BitLocker Drive Encryption > Removable Data Drives showing BitLocker To Go is required for removable drives.', type: 'screenshot' },
      ],
      intune: [
        { id: '3.8.6-intune-encryption-removable', title: 'Intune Encryption Policy for Removable Media', description: 'Screenshot of Intune Device Configuration profile showing encryption is required for removable storage devices.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.8.7',
    controlTitle: 'Control the use of removable media on system components.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.8.7-win-usb-block-gpo', title: 'Removable Storage Access GPO', description: 'Screenshot of GPO > Computer Configuration > Administrative Templates > System > Removable Storage Access showing USB storage is denied or restricted to approved devices.', type: 'screenshot' },
      ],
      defender: [
        { id: '3.8.7-defender-device-control', title: 'Defender for Endpoint Device Control Policy', description: 'Screenshot of Microsoft Defender for Endpoint Device Control policy showing removable media restrictions and any approved device exceptions.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.8.9',
    controlTitle: 'Protect the confidentiality of backup CUI at storage locations.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.8.9-azure-backup-encryption', title: 'Azure Backup Encryption Configuration', description: 'Screenshot of Azure Recovery Services Vault > Properties showing encryption settings (customer-managed key or platform-managed key) for backup data.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (CP-9)' },
      ],
      windows_server: [
        { id: '3.8.9-backup-encryption-config', title: 'Backup Software Encryption Configuration', description: 'Screenshot of backup software (Veeam, Windows Server Backup, etc.) showing encryption is enabled for backup jobs containing CUI.', type: 'screenshot' },
      ],
    },
  },

  // ============================================================
  // RISK ASSESSMENT (RA) — 3.11.x
  // ============================================================

  {
    controlId: '3.10.2',
    controlTitle: 'Perform periodic scans of organizational systems and real-time scans of files from external sources as files are downloaded, opened, or executed.',
    satisfactionType: 'Technical-Centric',
    variants: {
      defender: [
        { id: '3.10.2-defender-scan-policy', title: 'Defender Antivirus Scan Policy', description: 'Screenshot of Microsoft Defender Antivirus policy (via Intune or GPO) showing scheduled scan configuration and real-time protection is enabled.', type: 'screenshot' },
        { id: '3.10.2-defender-scan-report', title: 'Defender Scan History Report', description: 'Screenshot of Defender for Endpoint Security Center showing recent scan results and threat detections.', type: 'tool_report' },
      ],
      crowdstrike: [
        { id: '3.10.2-cs-prevention-policy', title: 'CrowdStrike Prevention Policy — Real-Time Protection', description: 'Screenshot of CrowdStrike Falcon Prevention Policy showing real-time protection and on-write scanning settings.', type: 'screenshot' },
      ],
      tenable: [
        { id: '3.10.2-tenable-scan-schedule', title: 'Tenable Vulnerability Scan Schedule', description: 'Screenshot of Tenable.io or Tenable.sc showing the scan schedule for CUI-scope assets (at minimum quarterly).', type: 'screenshot' },
        { id: '3.10.2-tenable-scan-results', title: 'Tenable Vulnerability Scan Results', description: 'Export of the most recent vulnerability scan results for CUI-scope assets.', type: 'tool_report' },
      ],
    },
  },

  {
    controlId: '3.10.6',
    controlTitle: 'Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.10.6-azure-sentinel', title: 'Microsoft Sentinel Workspace Configuration', description: 'Screenshot of Microsoft Sentinel workspace showing connected data sources (VMs, NSGs, Entra ID, Defender) and active analytics rules.', type: 'screenshot' },
        { id: '3.10.6-azure-ddos', title: 'Azure DDoS Protection Configuration', description: 'Screenshot of Azure DDoS Protection plan showing it is associated with the CUI-scope virtual network.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (SI-4)' },
      ],
      defender: [
        { id: '3.10.6-defender-edr', title: 'Defender for Endpoint EDR Configuration', description: 'Screenshot of Microsoft Defender for Endpoint showing all CUI-scope devices are onboarded and EDR is active.', type: 'screenshot' },
      ],
      crowdstrike: [
        { id: '3.10.6-cs-sensor-coverage', title: 'CrowdStrike Sensor Coverage Report', description: 'Screenshot of CrowdStrike Falcon Host Management showing all CUI-scope endpoints have the sensor installed and are reporting.', type: 'tool_report' },
      ],
      splunk: [
        { id: '3.10.6-splunk-network-monitoring', title: 'Splunk Network Traffic Monitoring', description: 'Screenshot of Splunk dashboard showing inbound and outbound network traffic monitoring for anomalies and attack indicators.', type: 'screenshot' },
      ],
    },
  },

  // ============================================================
  // SYSTEM AND COMMUNICATIONS PROTECTION (SC) — 3.13.x
  // ============================================================

  {
    controlId: '3.13.1',
    controlTitle: 'Monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.13.1-azure-firewall', title: 'Azure Firewall Policy', description: 'Screenshot of Azure Firewall Policy showing DNAT, Network, and Application rules that control traffic at the CUI boundary.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (SC-7)' },
        { id: '3.13.1-azure-nsg-boundary', title: 'NSG Rules at Boundary Subnets', description: 'Screenshot of NSG rules on the perimeter subnet showing inbound/outbound traffic restrictions.', type: 'screenshot' },
      ],
      palo_alto: [
        { id: '3.13.1-palo-security-zones', title: 'Palo Alto Security Zone Configuration', description: 'Screenshot of Palo Alto Network > Zones showing defined security zones (Untrust, Trust, CUI) and inter-zone policy.', type: 'screenshot' },
      ],
      cisco_asa: [
        { id: '3.13.1-asa-interface-acl', title: 'Cisco ASA Interface ACLs', description: 'Output of `show access-list` and `show run interface` showing ACLs applied to perimeter interfaces.', type: 'config_export' },
      ],
    },
  },

  {
    controlId: '3.13.3',
    controlTitle: 'Separate user functionality from system management functionality.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.13.3-win-admin-workstation', title: 'Privileged Access Workstation (PAW) Evidence', description: 'Screenshot or documentation showing that administrative functions are performed from dedicated PAWs or jump servers, separate from standard user workstations.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.13.3-azure-admin-subnet', title: 'Dedicated Management Subnet', description: 'Screenshot of Azure Virtual Network topology showing a dedicated management subnet for administrative access, separate from user-facing subnets.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.13.4',
    controlTitle: 'Prevent unauthorized and unintended information transfer via shared system resources.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.13.4-win-object-reuse', title: 'Memory and Object Reuse Settings', description: 'Screenshot of GPO > Security Options showing "Interactive logon: Do not display last user name" and other settings that prevent information leakage through shared resources.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.13.4-azure-dedicated-hosts', title: 'Azure Dedicated Hosts or Isolated VMs', description: 'Screenshot of Azure VM configuration showing use of dedicated hosts or isolated VM sizes (e.g., Standard_E64is_v3) for CUI workloads to prevent cross-tenant resource sharing.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (SC-4)' },
      ],
    },
  },

  {
    controlId: '3.13.5',
    controlTitle: 'Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.13.5-azure-dmz-subnet', title: 'DMZ / Perimeter Subnet Configuration', description: 'Screenshot of Azure Virtual Network showing a dedicated DMZ subnet for any public-facing resources, separated from the CUI subnet by NSG rules or Azure Firewall.', type: 'screenshot' },
      ],
      palo_alto: [
        { id: '3.13.5-palo-dmz-zone', title: 'Palo Alto DMZ Zone Configuration', description: 'Screenshot of Palo Alto Network > Zones showing a dedicated DMZ zone and security policies that restrict traffic between DMZ and internal zones.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.13.6',
    controlTitle: 'Deny network communications traffic by default and allow network communications traffic by exception (i.e., deny all, permit by exception).',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.13.6-azure-nsg-deny-all', title: 'NSG Deny-All Rule', description: 'Screenshot of NSG rules showing a deny-all rule at the lowest priority (highest number) for both inbound and outbound traffic, with specific allow rules above it.', type: 'screenshot' },
      ],
      palo_alto: [
        { id: '3.13.6-palo-deny-all', title: 'Palo Alto Implicit Deny Rule', description: 'Screenshot of Palo Alto security policy showing the implicit deny-all rule at the bottom of the rulebase and confirmation that it is active.', type: 'screenshot' },
      ],
      windows_server: [
        { id: '3.13.6-win-firewall-default-block', title: 'Windows Firewall Default Block Policy', description: 'Screenshot of Windows Defender Firewall with Advanced Security showing the default inbound action is "Block" for all profiles (Domain, Private, Public).', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.13.7',
    controlTitle: 'Prevent remote devices from simultaneously establishing non-remote connections with the system and communicating via some other connection to resources in other networks (i.e., split tunneling).',
    satisfactionType: 'Technical-Centric',
    variants: {
      all: [
        { id: '3.13.7-vpn-split-tunnel', title: 'VPN Split Tunneling Disabled', description: 'Screenshot of VPN client or gateway configuration showing split tunneling is disabled, forcing all traffic through the VPN tunnel.', type: 'config_export' },
      ],
      azure_gov: [
        { id: '3.13.7-azure-vpn-forced-tunnel', title: 'Azure VPN Forced Tunneling Configuration', description: 'Screenshot of Azure VPN Gateway or Virtual WAN configuration showing forced tunneling is enabled for the CUI-scope subnets.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.13.8',
    controlTitle: 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.13.8-azure-tls-policy', title: 'Azure App Service / API Management TLS Policy', description: 'Screenshot of Azure App Service TLS/SSL settings showing minimum TLS version is 1.2 and HTTPS-only is enforced.', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (SC-8)' },
        { id: '3.13.8-azure-storage-https', title: 'Azure Storage Account HTTPS Enforcement', description: 'Screenshot of Azure Storage Account > Configuration showing "Secure transfer required" is enabled.', type: 'screenshot' },
      ],
      all: [
        { id: '3.13.8-tls-scan', title: 'TLS Configuration Scan Results', description: 'Output of SSL/TLS scan (e.g., Qualys SSL Labs, testssl.sh) for all public-facing and internal CUI-transmitting endpoints, confirming TLS 1.2+ and approved cipher suites.', type: 'tool_report' },
      ],
    },
  },

  {
    controlId: '3.13.9',
    controlTitle: 'Terminate network connections associated with communications sessions after a defined period of inactivity.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.13.9-win-rdp-timeout', title: 'RDP Idle Session Timeout', description: 'Screenshot of GPO > Computer Configuration > Administrative Templates > Windows Components > Remote Desktop Services showing idle session timeout is configured (≤30 minutes).', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.13.9-azure-app-timeout', title: 'Azure Application Session Timeout', description: 'Screenshot of application configuration showing session timeout settings for web applications in scope.', type: 'screenshot' },
      ],
      palo_alto: [
        { id: '3.13.9-palo-session-timeout', title: 'Palo Alto Session Timeout Settings', description: 'Screenshot of Palo Alto Device > Setup > Session showing TCP and UDP session timeout values.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.13.11',
    controlTitle: 'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.13.11-win-fips-gpo', title: 'FIPS Compliance GPO Setting', description: 'Screenshot of GPO > Computer Configuration > Windows Settings > Security Settings > Local Policies > Security Options showing "System cryptography: Use FIPS compliant algorithms for encryption, hashing, and signing" is Enabled.', type: 'screenshot' },
      ],
      azure_gov: [
        { id: '3.13.11-azure-fips', title: 'Azure Government FIPS 140-2 Compliance', description: 'Reference to Microsoft Azure Government FIPS 140-2 compliance documentation. Azure Government uses FIPS 140-2 validated cryptographic modules by default.', type: 'policy_config', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (SC-13) — FIPS 140-2 validated modules used by default' },
      ],
      all: [
        { id: '3.13.11-fips-inventory', title: 'Cryptographic Module Inventory', description: 'List of cryptographic products/modules in use within the CUI boundary, with their FIPS 140-2 validation certificate numbers (from the NIST CMVP database).', type: 'config_export' },
      ],
    },
  },

  {
    controlId: '3.13.12',
    controlTitle: 'Prohibit remote activation of collaborative computing devices and provide indication of use to present users.',
    satisfactionType: 'Technical-Centric',
    variants: {
      intune: [
        { id: '3.13.12-intune-camera-mic', title: 'Intune Camera and Microphone Restriction Policy', description: 'Screenshot of Intune Device Configuration profile showing camera and/or microphone restrictions for CUI-scope devices.', type: 'screenshot' },
      ],
      windows_server: [
        { id: '3.13.12-win-camera-gpo', title: 'Camera/Microphone GPO Restriction', description: 'Screenshot of GPO > Computer Configuration > Administrative Templates > Windows Components > Camera showing camera access is disabled or restricted.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.13.13',
    controlTitle: 'Control and monitor the use of mobile code.',
    satisfactionType: 'Technical-Centric',
    variants: {
      windows_server: [
        { id: '3.13.13-win-mobile-code-gpo', title: 'Mobile Code (ActiveX/JavaScript) GPO Settings', description: 'Screenshot of GPO > User Configuration > Administrative Templates > Windows Components > Internet Explorer showing mobile code restrictions.', type: 'screenshot' },
      ],
      defender: [
        { id: '3.13.13-defender-asr-mobile-code', title: 'Defender ASR Rules for Mobile Code', description: 'Screenshot of Defender Attack Surface Reduction rules showing rules that block malicious mobile code (e.g., "Block JavaScript or VBScript from launching downloaded executable content").', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.13.14',
    controlTitle: 'Control and monitor the use of VoIP technologies.',
    satisfactionType: 'Hybrid',
    variants: {
      all: [
        { id: '3.13.14-voip-config', title: 'VoIP System Configuration', description: 'Screenshot of VoIP system configuration showing encryption (SRTP/TLS) is enabled and access is restricted to authorized users.', type: 'config_export' },
      ],
    },
  },

  {
    controlId: '3.13.15',
    controlTitle: 'Protect the authenticity of communications sessions.',
    satisfactionType: 'Technical-Centric',
    variants: {
      all: [
        { id: '3.13.15-tls-mutual-auth', title: 'Mutual TLS / Session Authentication Configuration', description: 'Screenshot or configuration showing that communications sessions use TLS with session authentication (e.g., mutual TLS for API communications, certificate-based authentication).', type: 'config_export' },
      ],
      azure_gov: [
        { id: '3.13.15-azure-app-gateway-waf', title: 'Azure Application Gateway WAF Configuration', description: 'Screenshot of Azure Application Gateway WAF policy showing protection against session hijacking and replay attacks.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.13.16',
    controlTitle: 'Protect the confidentiality of CUI at rest.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.13.16-azure-storage-encryption', title: 'Azure Storage Service Encryption', description: 'Screenshot of Azure Storage Account > Encryption showing encryption at rest is enabled (Azure Storage Encryption is on by default in Azure Government).', type: 'screenshot', inherited: true, inheritedFrom: 'Azure Government FedRAMP High Authorization (SC-28)' },
        { id: '3.13.16-azure-disk-encryption', title: 'Azure Disk Encryption (VM)', description: 'Screenshot of Azure VM > Disks showing Azure Disk Encryption (BitLocker/dm-crypt) is enabled for all OS and data disks on CUI-scope VMs.', type: 'screenshot' },
        { id: '3.13.16-azure-sql-tde', title: 'Azure SQL Transparent Data Encryption (TDE)', description: 'Screenshot of Azure SQL Database > Transparent Data Encryption showing TDE is enabled.', type: 'screenshot' },
      ],
      windows_server: [
        { id: '3.13.16-win-bitlocker-os', title: 'BitLocker OS Drive Encryption', description: 'Output of `manage-bde -status C:` showing the OS drive is encrypted with BitLocker.', type: 'tool_report' },
      ],
    },
  },

  // ============================================================
  // SYSTEM AND INFORMATION INTEGRITY (SI) — 3.14.x
  // ============================================================

  {
    controlId: '3.14.3',
    controlTitle: 'Monitor system security alerts and advisories and take action in response.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.14.3-azure-defender-cloud', title: 'Microsoft Defender for Cloud Security Alerts', description: 'Screenshot of Microsoft Defender for Cloud > Security Alerts showing active monitoring and alert configuration for CUI-scope resources.', type: 'screenshot' },
      ],
      defender: [
        { id: '3.14.3-defender-alerts', title: 'Defender for Endpoint Alert Configuration', description: 'Screenshot of Microsoft Defender XDR > Alerts showing active alerts and the alert notification configuration.', type: 'screenshot' },
      ],
      splunk: [
        { id: '3.14.3-splunk-threat-intel', title: 'Splunk Threat Intelligence Integration', description: 'Screenshot of Splunk showing threat intelligence feed integration (e.g., CISA Known Exploited Vulnerabilities) and alerts triggered by IOCs.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.14.4',
    controlTitle: 'Update malicious code protection mechanisms when new releases are available.',
    satisfactionType: 'Technical-Centric',
    variants: {
      defender: [
        { id: '3.14.4-defender-sig-updates', title: 'Defender Signature Update Configuration', description: 'Screenshot of Microsoft Defender Antivirus update policy (via Intune or GPO) showing automatic signature updates are enabled and the update frequency.', type: 'screenshot' },
        { id: '3.14.4-defender-sig-version', title: 'Defender Signature Version Report', description: 'Screenshot of Defender for Endpoint device inventory showing current signature versions across CUI-scope endpoints.', type: 'tool_report' },
      ],
      crowdstrike: [
        { id: '3.14.4-cs-sensor-version', title: 'CrowdStrike Sensor Version Report', description: 'Screenshot of CrowdStrike Falcon Host Management showing sensor versions across CUI-scope endpoints and confirming auto-update is enabled.', type: 'tool_report' },
      ],
    },
  },

  {
    controlId: '3.14.5',
    controlTitle: 'Perform periodic scans of organizational systems and real-time scans of files from external sources as files are downloaded, opened, or executed.',
    satisfactionType: 'Technical-Centric',
    variants: {
      defender: [
        { id: '3.14.5-defender-scan-schedule', title: 'Defender Scheduled Scan Configuration', description: 'Screenshot of Microsoft Defender Antivirus policy showing scheduled scan type (Full/Quick), frequency, and time.', type: 'screenshot' },
        { id: '3.14.5-defender-realtime', title: 'Defender Real-Time Protection Status', description: 'Screenshot of Defender for Endpoint device inventory showing real-time protection is enabled on all CUI-scope endpoints.', type: 'tool_report' },
      ],
      crowdstrike: [
        { id: '3.14.5-cs-on-demand-scan', title: 'CrowdStrike On-Demand Scan Configuration', description: 'Screenshot of CrowdStrike Falcon showing on-demand scan policy and prevention policy with real-time protection enabled.', type: 'screenshot' },
      ],
      tenable: [
        { id: '3.14.5-tenable-vuln-scan', title: 'Tenable Vulnerability Scan Results', description: 'Export of the most recent Tenable vulnerability scan results for all CUI-scope assets, showing scan date and findings.', type: 'tool_report' },
      ],
    },
  },

  {
    controlId: '3.14.6',
    controlTitle: 'Monitor organizational systems, including inbound and outbound communications traffic, to detect attacks and indicators of potential attacks.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.14.6-azure-sentinel-analytics', title: 'Microsoft Sentinel Analytics Rules', description: 'Screenshot of Microsoft Sentinel > Analytics showing active rules that detect attack patterns in inbound/outbound traffic.', type: 'screenshot' },
        { id: '3.14.6-azure-nsg-flow-logs', title: 'NSG Flow Logs Configuration', description: 'Screenshot of NSG Flow Logs settings showing flow logs are enabled and sent to a Log Analytics workspace for analysis.', type: 'screenshot' },
      ],
      palo_alto: [
        { id: '3.14.6-palo-threat-prevention', title: 'Palo Alto Threat Prevention Profile', description: 'Screenshot of Palo Alto Threat Prevention profile showing IPS/IDS signatures are enabled and applied to CUI-scope security policies.', type: 'screenshot' },
      ],
      splunk: [
        { id: '3.14.6-splunk-ids-alerts', title: 'Splunk IDS/IPS Alert Dashboard', description: 'Screenshot of Splunk dashboard showing IDS/IPS alerts from network monitoring, confirming inbound and outbound traffic is being analyzed.', type: 'screenshot' },
      ],
    },
  },

  {
    controlId: '3.14.7',
    controlTitle: 'Identify unauthorized use of organizational systems.',
    satisfactionType: 'Technical-Centric',
    variants: {
      azure_gov: [
        { id: '3.14.7-azure-sentinel-ueba', title: 'Microsoft Sentinel UEBA Configuration', description: 'Screenshot of Microsoft Sentinel > Entity Behavior > User and Entity Behavior Analytics showing UEBA is enabled to detect anomalous user behavior.', type: 'screenshot' },
      ],
      defender: [
        { id: '3.14.7-defender-anomaly', title: 'Defender for Identity Anomaly Detection', description: 'Screenshot of Microsoft Defender for Identity showing anomalous activity alerts (e.g., unusual logon times, impossible travel, pass-the-hash).', type: 'screenshot' },
      ],
      splunk: [
        { id: '3.14.7-splunk-user-behavior', title: 'Splunk User Behavior Analytics', description: 'Screenshot of Splunk UBA or saved searches showing detection of anomalous user activity patterns.', type: 'screenshot' },
      ],
      crowdstrike: [
        { id: '3.14.7-cs-identity-protection', title: 'CrowdStrike Identity Protection', description: 'Screenshot of CrowdStrike Falcon Identity Protection showing anomalous identity activity detection.', type: 'screenshot' },
      ],
    },
  },
];

/** Technology stack options for Boundary Profile selector (source of truth for keys + labels). */
export const BOUNDARY_TECHNOLOGY_OPTIONS: { category: string; options: { value: string; label: string }[] }[] = [
  {
    category: "Operating Systems",
    options: [
      { value: "windows_11", label: "Windows 11 (client)" },
      { value: "windows_server", label: "Windows Server 2019 / 2022 / 2025" },
      { value: "rhel", label: "Red Hat Enterprise Linux 8/9 (CentOS/Rocky/Alma)" },
      { value: "macos", label: "macOS 13+ (Ventura/Sonoma) managed via MDM" },
    ],
  },
  {
    category: "Cloud Providers",
    options: [
      { value: "azure_gov", label: "Microsoft Azure Government (FedRAMP High)" },
      { value: "aws_govcloud", label: "AWS GovCloud (US)" },
    ],
  },
  {
    category: "Identity",
    options: [
      { value: "entra_id", label: "Microsoft Entra ID (Azure AD)" },
      { value: "okta", label: "Okta Identity Platform" },
    ],
  },
  {
    category: "Endpoint Management",
    options: [
      { value: "intune", label: "Microsoft Intune (Endpoint Manager)" },
      { value: "jamf", label: "JAMF Pro (macOS/iOS MDM)" },
    ],
  },
  {
    category: "Security & Monitoring",
    options: [
      { value: "defender", label: "Microsoft Defender for Endpoint / Defender for Cloud" },
      { value: "crowdstrike", label: "CrowdStrike Falcon" },
      { value: "splunk", label: "Splunk Enterprise / Splunk Cloud" },
      { value: "tenable", label: "Tenable.io / Tenable.sc (Nessus)" },
      { value: "palo_alto", label: "Palo Alto NGFW / Prisma" },
      { value: "cisco_asa", label: "Cisco ASA / Firepower" },
    ],
  },
];
