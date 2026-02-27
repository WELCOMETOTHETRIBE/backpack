/**
 * Generates Mermaid diagram source from a boundary profile (technology keys).
 * Used by GET /api/boundary/diagram and optionally by client for consistency.
 * Produces a left-to-right flowchart with CUI Boundary and optional category subgraphs.
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

/** Map technology key to category for grouped subgraphs (matches BOUNDARY_TECHNOLOGY_OPTIONS). */
const TECHNOLOGY_CATEGORY: Record<string, string> = {
  windows_11: "Operating Systems",
  windows_server: "Operating Systems",
  rhel: "Operating Systems",
  macos: "Operating Systems",
  azure_gov: "Cloud Providers",
  aws_govcloud: "Cloud Providers",
  entra_id: "Identity",
  okta: "Identity",
  intune: "Endpoint Management",
  jamf: "Endpoint Management",
  defender: "Security & Monitoring",
  crowdstrike: "Security & Monitoring",
  splunk: "Security & Monitoring",
  tenable: "Security & Monitoring",
  palo_alto: "Security & Monitoring",
  cisco_asa: "Security & Monitoring",
};

function mermaidId(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "_");
}

function mermaidSubgraphId(category: string): string {
  return "sg_" + category.replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Returns a Mermaid flowchart LR definition for the given profile.
 * CUI Boundary contains category subgraphs; User node outside with arrow into boundary.
 */
export function generateMermaidSource(profile: string[]): string {
  const lines: string[] = ["flowchart LR"];
  lines.push("    %% CUI Boundary Diagram — generated from boundary profile");
  lines.push("    direction TB");
  lines.push("");
  lines.push('    subgraph CUI_Boundary["🔒 CUI Boundary"]');
  lines.push("        direction TB");

  if (profile.length === 0) {
    lines.push('        Empty["No technologies selected"]');
  } else {
    const byCategory = new Map<string, string[]>();
    for (const key of profile) {
      const cat = TECHNOLOGY_CATEGORY[key] ?? "Other";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(key);
    }
    const categoryOrder = [
      "Cloud Providers",
      "Identity",
      "Operating Systems",
      "Endpoint Management",
      "Security & Monitoring",
      "Other",
    ];
    const seen = new Set<string>();
    for (const cat of categoryOrder) {
      const keys = byCategory.get(cat);
      if (!keys?.length) continue;
      const safeCatId = mermaidSubgraphId(cat);
      lines.push(`        subgraph ${safeCatId}["${cat}"]`);
      for (const key of keys) {
        if (seen.has(key)) continue;
        seen.add(key);
        const label = TECHNOLOGY_LABELS[key] ?? key;
        const id = mermaidId(key);
        lines.push(`            ${id}["${label}"]`);
      }
      lines.push("        end");
    }
    for (const key of profile) {
      if (seen.has(key)) continue;
      const label = TECHNOLOGY_LABELS[key] ?? key;
      const id = mermaidId(key);
      lines.push(`        ${id}["${label}"]`);
    }
  }

  lines.push("    end");
  lines.push("");
  lines.push('    User["👤 User / Assessor"]');
  if (profile.length > 0) {
    lines.push(`    User --> ${mermaidId(profile[0])}`);
  } else {
    lines.push("    User -.-> CUI_Boundary");
  }
  return lines.join("\n");
}
