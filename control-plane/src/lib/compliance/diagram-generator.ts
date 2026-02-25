/**
 * Generates Mermaid diagram source from a boundary profile (technology keys).
 * Used by GET /api/boundary/diagram and optionally by client for consistency.
 */

const TECHNOLOGY_LABELS: Record<string, string> = {
  on_prem_network: "Office Network",
  remote_workforce: "Remote Workforce",
  m365: "Microsoft 365",
  google_workspace: "Google Workspace",
  on_prem_ad: "On-Prem AD",
  other_cloud: "Other Cloud",
  entra_id: "Entra ID",
  okta: "Okta",
  windows_workstation: "Windows",
  windows_11: "Windows 11",
  windows_server: "Windows Server",
  rhel: "RHEL / Linux",
  macos: "macOS",
  defender: "Microsoft Defender",
  crowdstrike: "CrowdStrike",
  sentinelone: "SentinelOne",
  intune: "Intune",
  jamf: "JAMF",
  tenable: "Tenable",
  splunk: "Splunk",
  azure_commercial: "Azure",
  azure_gov: "Azure Government",
  aws: "AWS",
  aws_govcloud: "AWS GovCloud",
  gcp: "GCP",
  palo_alto: "Palo Alto",
  cisco_asa: "Cisco ASA",
};

function mermaidId(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Returns a Mermaid graph definition string for the given profile.
 * Subgraph "CUI Boundary" contains one node per technology; User node outside; User --> subgraph.
 */
export function generateMermaidSource(profile: string[]): string {
  const lines: string[] = ["graph TD"];
  lines.push('    subgraph CUI_Boundary["CUI Boundary"]');
  if (profile.length === 0) {
    lines.push("        Empty[No technologies selected]");
  } else {
    for (const key of profile) {
      const label = TECHNOLOGY_LABELS[key] ?? key;
      const id = mermaidId(key);
      lines.push(`        ${id}["${label}"]`);
    }
  }
  lines.push("    end");
  lines.push("    User[User]");
  if (profile.length > 0) {
    lines.push(`    User --> ${mermaidId(profile[0])}`);
  }
  return lines.join("\n");
}
