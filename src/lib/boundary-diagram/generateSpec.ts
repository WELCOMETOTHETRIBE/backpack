/**
 * Generates a DiagramSpec from BoundaryInput for C3PAO-grade boundary diagrams.
 * Azure IaaS focus; supports Executive (simple) and Assessor (detailed) modes.
 */

import type { BoundaryInput } from "@/boundary-engine";
import type {
  DiagramSpec,
  DiagramMode,
  DiagramNode,
  DiagramEdge,
  ExternalConnectionRow,
  ScopeStrip,
  AssumptionCheck,
  TrustZone,
  Responsibility,
} from "./types";

function isServiceEnabled(boundary: BoundaryInput, key: string): boolean {
  return boundary.services_enabled[key] === true;
}

/** Control family/layer tags for overlay (node id -> short tags). */
const CONTROL_OVERLAY_TAGS: Record<string, string[]> = {
  entra_id: ["IA", "AC"],
  azure_monitor: ["AU", "SI"],
  windows_server: ["CM", "SI", "AU", "AC"],
  key_vault: ["SC (Key Mgmt)"],
  backup_vault: ["CP"],
  defender: ["IR", "SI"],
  log_agent: ["AU"],
  azure_control_plane: ["AC", "SC"],
  azure_data_plane: ["SC"],
  vnet_nsg: ["SC"],
  bastion: ["AC", "SC"],
  cui_store: ["SC"],
};

export function generateDiagramSpec(params: {
  boundary: BoundaryInput;
  environment: "government" | "commercial";
  mode: DiagramMode;
  overlay?: boolean;
}): DiagramSpec {
  const { boundary, environment, mode, overlay = false } = params;
  const isGov = environment === "government";
  const platformLabel = isGov ? "Azure Gov Platform" : "Azure Platform";
  const title =
    mode === "assessor"
      ? `CUI Boundary Diagram (Assessor) — ${boundary.provider} ${boundary.environment} IaaS`
      : `CUI Boundary Diagram (Executive) — ${boundary.provider} ${boundary.environment}`;
  const assumptions: string[] = [];
  assumptions.push(
    "Assumed administrative access uses Azure Bastion; adjust if VPN/ExpressRoute is used."
  );

  if (mode === "executive") {
    return buildExecutiveSpec(boundary, platformLabel, title, assumptions);
  }
  return buildAssessorSpec(
    boundary,
    platformLabel,
    title,
    assumptions,
    isGov,
    overlay
  );
}

function buildExecutiveSpec(
  boundary: BoundaryInput,
  platformLabel: string,
  title: string,
  assumptions: string[]
): DiagramSpec {
  const providerLabel =
    boundary.environment.toLowerCase().includes("gov")
      ? "Azure Government"
      : "Azure";
  const nodes: DiagramNode[] = [
    {
      id: "cloud_provider",
      label: providerLabel,
      zone: "Azure_Gov_Platform",
      kind: "network_edge",
      responsibility: "Inherited",
      in_scope: false,
    },
    {
      id: "os_workload",
      label: boundary.os ?? "Windows Server / Workload",
      zone: "Customer_CUI_Enclave",
      kind: "compute",
      responsibility: "Customer",
      in_scope: true,
    },
    {
      id: "identity",
      label: "Identity (Entra ID)",
      zone: "External_Services_OutOfScope",
      kind: "identity",
      responsibility: "Shared",
      in_scope: false,
    },
    {
      id: "security_monitoring",
      label: "Security / Monitoring",
      zone: "External_Services_OutOfScope",
      kind: "security_monitoring",
      responsibility: "Shared",
      in_scope: false,
    },
  ];
  const edges: DiagramEdge[] = [
    { from: "identity", to: "os_workload", label: "Auth", encrypted: true },
    {
      from: "os_workload",
      to: "security_monitoring",
      label: "Logs / Telemetry",
      encrypted: true,
    },
  ];
  return {
    mode: "executive",
    title,
    boundary_label: "CUI Processing Environment (In Scope)",
    nodes,
    edges,
    external_connections: [],
    generated_at_utc: new Date().toISOString(),
    assumptions,
  };
}

function buildAssessorSpec(
  boundary: BoundaryInput,
  platformLabel: string,
  title: string,
  assumptions: string[],
  isGov: boolean,
  overlay: boolean
): DiagramSpec {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const externalConnections: ExternalConnectionRow[] = [];
  let connId = 0;
  const nextConnId = () => `conn_${++connId}`;

  const hasEntra = isServiceEnabled(boundary, "identity_entra_id");
  const hasDefender = isServiceEnabled(boundary, "security_defender_for_cloud");
  const hasMonitor = isServiceEnabled(boundary, "logging_azure_monitor_log_analytics");
  const hasBackup = isServiceEnabled(boundary, "backup_azure_backup");
  const hasKeyVault = isServiceEnabled(boundary, "crypto_azure_key_vault");

  // User / Assessor (out-of-scope)
  nodes.push({
    id: "user",
    label: "User / Assessor",
    zone: "Customer_Admin_Workstation",
    kind: "user",
    responsibility: "Customer",
    in_scope: false,
  });

  // Admin Workstation (out-of-scope)
  nodes.push({
    id: "admin_workstation",
    label: "Admin Workstation",
    zone: "Customer_Admin_Workstation",
    kind: "workstation",
    responsibility: "Customer",
    in_scope: false,
  });

  // Entra ID
  if (hasEntra) {
    nodes.push({
      id: "entra_id",
      label: "Microsoft Entra ID",
      zone: "External_Services_OutOfScope",
      kind: "identity",
      responsibility: "Shared",
      in_scope: false,
    });
  }

  // Azure Control Plane (Inherited)
  nodes.push({
    id: "azure_control_plane",
    label: "Azure Resource Manager / Control Plane",
    zone: "Azure_Control_Plane",
    kind: "network_edge",
    responsibility: "Inherited",
    in_scope: false,
  });

  // Azure Data Plane (Inherited)
  nodes.push({
    id: "azure_data_plane",
    label: "Azure Fabric / Hypervisor",
    zone: "Azure_Data_Plane",
    kind: "network_edge",
    responsibility: "Inherited",
    in_scope: false,
  });

  // VNet + NSG (Shared, in-scope boundary edge)
  nodes.push({
    id: "vnet_nsg",
    label: "VNet + NSG",
    zone: "Azure_VNet_Boundary",
    kind: "network_edge",
    responsibility: "Shared",
    in_scope: true,
  });

  // Bastion (Shared) — assumed
  nodes.push({
    id: "bastion",
    label: "Azure Bastion",
    zone: "Azure_VNet_Boundary",
    kind: "network_edge",
    responsibility: "Shared",
    in_scope: true,
  });

  // Windows Server VM (Customer, in-scope)
  nodes.push({
    id: "windows_server",
    label: boundary.os ?? "Windows Server VM",
    zone: "Customer_CUI_Enclave",
    kind: "compute",
    responsibility: "Customer",
    in_scope: true,
  });

  // CUI Data Store
  nodes.push({
    id: "cui_store",
    label: "CUI Data Store (CUI at Rest)",
    zone: "Customer_CUI_Enclave",
    kind: "storage",
    responsibility: "Customer",
    in_scope: true,
    notes: ["CUI stored here; encryption at rest required."],
  });

  // Logging agent (on VM)
  nodes.push({
    id: "log_agent",
    label: "Logging Agent",
    zone: "Customer_CUI_Enclave",
    kind: "logging_siem",
    responsibility: "Customer",
    in_scope: true,
  });

  if (hasMonitor) {
    nodes.push({
      id: "azure_monitor",
      label: "Azure Monitor / Log Analytics",
      zone: "External_Services_OutOfScope",
      kind: "logging_siem",
      responsibility: "Shared",
      in_scope: false,
    });
  }
  if (hasDefender) {
    nodes.push({
      id: "defender",
      label: "Microsoft Defender for Cloud",
      zone: "External_Services_OutOfScope",
      kind: "security_monitoring",
      responsibility: "Shared",
      in_scope: false,
    });
  }
  if (hasBackup) {
    nodes.push({
      id: "backup_vault",
      label: "Azure Backup Vault",
      zone: "External_Services_OutOfScope",
      kind: "backup",
      responsibility: "Shared",
      in_scope: false,
    });
  }
  if (hasKeyVault) {
    nodes.push({
      id: "key_vault",
      label: "Azure Key Vault",
      zone: "External_Services_OutOfScope",
      kind: "key_management",
      responsibility: "Shared",
      in_scope: false,
    });
  }

  // Admin -> Azure Control Plane (Mgmt: portal/API)
  edges.push({
    from: "admin_workstation",
    to: "azure_control_plane",
    label: "Mgmt: portal/API",
    data_type: "Mgmt",
    encrypted: true,
    boundary_crossing: true,
  });
  externalConnections.push({
    connection_id: nextConnId(),
    source_zone: "Customer_Admin_Workstation",
    dest_zone: "Azure_Control_Plane",
    purpose: "Management portal / API",
    protocol_ports: "HTTPS 443",
    encryption: "TLS 1.2+",
    auth: "Entra ID + MFA",
    approval_required: false,
    controls_hint: ["AC.L2-3.1.12", "SC.L2-3.13.5"],
    data_type: "Mgmt",
    cui_crosses_boundary: false,
  });

  // Azure Control Plane -> VNet (Mgmt provisioning)
  edges.push({
    from: "azure_control_plane",
    to: "vnet_nsg",
    label: "Mgmt provisioning",
    data_type: "Mgmt",
    boundary_crossing: false,
  });

  // Edges: Admin -> Entra (Auth)
  if (hasEntra) {
    edges.push({
      from: "admin_workstation",
      to: "entra_id",
      label: "MFA / Auth",
      data_type: "Auth",
      encrypted: true,
      boundary_crossing: true,
    });
    externalConnections.push({
      connection_id: nextConnId(),
      source_zone: "Customer_Admin_Workstation",
      dest_zone: "External_Services_OutOfScope",
      purpose: "Authentication / MFA",
      protocol_ports: "HTTPS 443",
      encryption: "TLS 1.2+",
      auth: "MFA",
      approval_required: false,
      controls_hint: ["IA.L2-3.5.1", "IA.L2-3.5.2", "AC.L2-3.1.12"],
      data_type: "Auth",
      cui_crosses_boundary: false,
    });
  }

  // Admin -> Bastion (Mgmt)
  edges.push({
    from: "admin_workstation",
    to: "bastion",
    label: "RDP over Bastion",
    data_type: "Mgmt",
    encrypted: true,
    boundary_crossing: true,
  });
  externalConnections.push({
    connection_id: nextConnId(),
    source_zone: "Customer_Admin_Workstation",
    dest_zone: "Azure_VNet_Boundary",
    purpose: "Remote administration",
    protocol_ports: "HTTPS 443 (Bastion tunnel)",
    encryption: "TLS 1.2+",
    auth: "Entra ID + MFA",
    approval_required: false,
    controls_hint: ["AC.L2-3.1.12", "SC.L2-3.13.5"],
    data_type: "Mgmt",
    cui_crosses_boundary: false,
  });

  // Bastion -> Windows Server
  edges.push({
    from: "bastion",
    to: "windows_server",
    label: "RDP (tunneled)",
    data_type: "Mgmt",
    encrypted: true,
    boundary_crossing: false,
  });

  // Windows Server -> CUI store (internal)
  edges.push({
    from: "windows_server",
    to: "cui_store",
    label: "CUI at rest",
    data_type: "CUI",
    boundary_crossing: false,
  });

  // Windows Server -> Log Agent (internal)
  edges.push({
    from: "windows_server",
    to: "log_agent",
    label: "Log forward",
    data_type: "Logs",
    boundary_crossing: false,
  });

  if (hasMonitor) {
    edges.push({
      from: "log_agent",
      to: "azure_monitor",
      label: "Log forward",
      data_type: "Logs",
      encrypted: true,
      boundary_crossing: true,
    });
    externalConnections.push({
      connection_id: nextConnId(),
      source_zone: "Customer_CUI_Enclave",
      dest_zone: "External_Services_OutOfScope",
      purpose: "Log ingestion",
      protocol_ports: "HTTPS 443",
      encryption: "TLS 1.2+",
      auth: "Managed identity / Service principal",
      approval_required: false,
      controls_hint: ["AU.L2-3.3.1", "AU.L2-3.3.2", "SC.L2-3.13.5"],
      data_type: "Logs",
      cui_crosses_boundary: false,
    });
  }

  if (hasDefender) {
    edges.push({
      from: "windows_server",
      to: "defender",
      label: "Telemetry / Alerts",
      data_type: "Logs",
      encrypted: true,
      boundary_crossing: true,
    });
    externalConnections.push({
      connection_id: nextConnId(),
      source_zone: "Customer_CUI_Enclave",
      dest_zone: "External_Services_OutOfScope",
      purpose: "Security monitoring",
      protocol_ports: "HTTPS 443",
      encryption: "TLS 1.2+",
      auth: "Managed identity",
      approval_required: false,
      controls_hint: ["IR.L2-3.7.1", "SC.L2-3.13.5"],
      data_type: "Logs",
      cui_crosses_boundary: false,
    });
  }

  if (hasBackup) {
    edges.push({
      from: "windows_server",
      to: "backup_vault",
      label: "Backup",
      data_type: "Backups",
      encrypted: true,
      boundary_crossing: true,
    });
    externalConnections.push({
      connection_id: nextConnId(),
      source_zone: "Customer_CUI_Enclave",
      dest_zone: "External_Services_OutOfScope",
      purpose: "Backup to vault",
      protocol_ports: "HTTPS 443",
      encryption: "TLS 1.2+",
      auth: "Managed identity",
      approval_required: false,
      controls_hint: ["CP.L2-3.8.1", "SC.L2-3.13.5"],
      data_type: "Backups",
      cui_crosses_boundary: false,
    });
  }

  if (hasKeyVault) {
    edges.push({
      from: "windows_server",
      to: "key_vault",
      label: "Secrets / Keys",
      data_type: "Keys",
      encrypted: true,
      direction: "bidirectional",
      boundary_crossing: true,
    });
    externalConnections.push({
      connection_id: nextConnId(),
      source_zone: "Customer_CUI_Enclave",
      dest_zone: "External_Services_OutOfScope",
      purpose: "Key and secret retrieval",
      protocol_ports: "HTTPS 443",
      encryption: "TLS 1.2+",
      auth: "Managed identity",
      approval_required: false,
      controls_hint: ["SC.L2-3.13.16", "SC.L2-3.13.5"],
      data_type: "Keys",
      cui_crosses_boundary: false,
    });
  }

  const azure_platform_label = isGov
    ? "Azure Government (FedRAMP High Authorized Boundary — Inherited Controls)"
    : "Azure Commercial (Assurance must be explicitly selected — Inherited Platform Controls)";

  const in_scope: string[] = [
    "Azure IaaS Windows Server VM(s) within Customer CUI Enclave",
    "CUI Data Store (OS/Data Disks)",
    "Boundary logging/monitoring agents and configuration",
    "Customer-managed guest OS hardening and patching",
  ];
  if (boundary.boundary_inclusions?.length) {
    for (const item of boundary.boundary_inclusions) {
      in_scope.push("Explicit inclusion: " + item);
    }
  }
  const out_of_scope: string[] = [
    "User endpoints not inside enclave (admin workstation/laptops)",
    "Azure platform/hypervisor (inherited FedRAMP boundary)",
    "Public Internet",
    "Any corporate SaaS not explicitly declared in boundary",
  ];
  let explicit_exclusions: string[] | undefined;
  if (boundary.boundary_exclusions?.length) {
    explicit_exclusions = boundary.boundary_exclusions;
    for (const item of boundary.boundary_exclusions) {
      out_of_scope.push("Explicit exclusion: " + item);
    }
  }
  const scope_strip: ScopeStrip = {
    in_scope,
    out_of_scope,
    explicit_exclusions,
  };

  const assumption_checks: AssumptionCheck[] = [
    {
      id: "assume_admin_path_bastion",
      statement:
        "Assumed administrative access uses Azure Bastion; adjust if VPN/ExpressRoute is used.",
      required: true,
      confirmed:
        boundary.assumption_confirmations?.assume_admin_path_bastion === "yes",
    },
    {
      id: "assume_no_public_rdp",
      statement:
        "No public RDP to CUI enclave; administrative access via Bastion or VPN only.",
      required: true,
      confirmed:
        boundary.assumption_confirmations?.assume_no_public_rdp === "yes",
    },
  ];
  if (hasMonitor) {
    assumption_checks.push({
      id: "assume_logs_forwarded_to_monitor",
      statement:
        "Logs from enclave are forwarded to Azure Monitor / Log Analytics.",
      required: true,
      confirmed:
        boundary.assumption_confirmations?.assume_logs_forwarded_to_monitor ===
        "yes",
    });
  }
  let creditable = assumption_checks
    .filter((c) => c.required)
    .every((c) => c.confirmed);
  let not_creditable_reasons: string[] | undefined = creditable
    ? undefined
    : assumption_checks
        .filter((c) => c.required && !c.confirmed)
        .map((c) => c.statement);
  const anyCuiCrosses = externalConnections.some((r) => r.cui_crosses_boundary);
  if (anyCuiCrosses) {
    creditable = false;
    not_creditable_reasons = [
      ...(not_creditable_reasons ?? []),
      "CUI leaves enclave boundary: review SC/AC controls and approvals.",
    ];
  }

  if (overlay) {
    for (const node of nodes) {
      const tags = CONTROL_OVERLAY_TAGS[node.id];
      if (tags?.length) {
        node.label = node.label + "<br/>" + tags.join(" / ");
      }
    }
  }

  return {
    mode: "assessor",
    title,
    boundary_label: "CUI Processing Environment (In Scope)",
    azure_platform_label,
    scope_strip,
    assumption_checks,
    creditable,
    not_creditable_reasons,
    nodes,
    edges,
    external_connections: externalConnections,
    generated_at_utc: new Date().toISOString(),
    assumptions,
  };
}
