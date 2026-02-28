/**
 * Renders a DiagramSpec to Mermaid flowchart (TB) with trust zones,
 * responsibility classDefs, and boundary-crossing linkStyle.
 */

import type { DiagramSpec, DiagramNode, DiagramEdge, TrustZone } from "./types";

const ZONE_ORDER: TrustZone[] = [
  "Internet",
  "Customer_Admin_Workstation",
  "Azure_Gov_Platform",
  "Azure_Control_Plane",
  "Azure_Data_Plane",
  "Azure_VNet_Boundary",
  "Customer_CUI_Enclave",
  "External_Services_OutOfScope",
];

const ZONE_LABELS: Record<TrustZone, string> = {
  Internet: "Internet",
  Customer_Admin_Workstation: "Customer Admin Workstation",
  Azure_Gov_Platform: "Azure Platform",
  Azure_Control_Plane: "Azure Resource Manager / Control Plane",
  Azure_Data_Plane: "Azure Fabric / Hypervisor",
  Azure_VNet_Boundary: "Azure VNet Boundary",
  Customer_CUI_Enclave: "Customer CUI Enclave",
  External_Services_OutOfScope: "External Services (Out of Scope)",
};

/** Sanitize id for Mermaid (alphanumeric + underscore). */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

/** Escape double quotes in label for Mermaid. */
function escapeLabel(label: string): string {
  return label.replace(/"/g, "#quot;");
}

export function renderMermaid(spec: DiagramSpec): string {
  const lines: string[] = [];
  lines.push("flowchart TB");
  lines.push("    %% " + spec.title);
  lines.push("");

  const nodesById = new Map(spec.nodes.map((n) => [n.id, n]));
  const sortedNodes = [...spec.nodes].sort((a, b) => a.id.localeCompare(b.id));
  const inScopeNodes = sortedNodes.filter((n) => n.in_scope);
  const outOfScopeNodes = sortedNodes.filter((n) => !n.in_scope);

  const zoneToOutOfScopeNodes = new Map<TrustZone, DiagramNode[]>();
  for (const z of ZONE_ORDER) {
    zoneToOutOfScopeNodes.set(z, []);
  }
  for (const n of outOfScopeNodes) {
    const list = zoneToOutOfScopeNodes.get(n.zone) ?? [];
    list.push(n);
  }

  lines.push('    subgraph CUI["' + escapeLabel(spec.boundary_label) + '"]');
  for (const n of inScopeNodes) {
    const sid = safeId(n.id);
    lines.push(`        ${sid}["${escapeLabel(n.label)}"]`);
  }
  lines.push("    end");
  lines.push("");

  for (const zone of ZONE_ORDER) {
    const list = zoneToOutOfScopeNodes.get(zone) ?? [];
    if (list.length === 0) continue;
    const zoneId = zone.replace(/[^a-zA-Z0-9_]/g, "_");
    let zoneLabel = ZONE_LABELS[zone];
    if (zone === "Azure_Control_Plane" && spec.azure_platform_label) {
      zoneLabel = spec.azure_platform_label;
    } else if (zone === "Azure_Gov_Platform" && spec.azure_platform_label) {
      zoneLabel = spec.azure_platform_label;
    }
    lines.push(`    subgraph ${zoneId}["${escapeLabel(zoneLabel)}"]`);
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    for (const n of sorted) {
      const sid = safeId(n.id);
      lines.push(`        ${sid}["${escapeLabel(n.label)}"]`);
    }
    lines.push("    end");
    lines.push("");
  }

  const sortedEdges = [...spec.edges].sort((a, b) => {
    const from = a.from.localeCompare(b.from);
    if (from !== 0) return from;
    const to = a.to.localeCompare(b.to);
    if (to !== 0) return to;
    const labelA = (a.data_type ? `${a.data_type}: ${a.label}` : a.label);
    const labelB = (b.data_type ? `${b.data_type}: ${b.label}` : b.label);
    return labelA.localeCompare(labelB);
  });

  const boundaryCrossingIndices: number[] = [];
  for (let i = 0; i < sortedEdges.length; i++) {
    const e = sortedEdges[i];
    if (e.boundary_crossing) boundaryCrossingIndices.push(i);
  }

  for (const e of sortedEdges) {
    const from = safeId(e.from);
    const to = safeId(e.to);
    if (!nodesById.has(e.from) || !nodesById.has(e.to)) continue;
    const displayLabel = e.data_type
      ? `${e.data_type}: ${e.label}`
      : e.label;
    const enc = e.encrypted ? "|TLS|" : "";
    const label = escapeLabel(displayLabel);
    const edgeStr = enc ? `${from} -->|"${label} ${enc}"| ${to}` : `${from} -->|"${label}"| ${to}`;
    lines.push("    " + edgeStr);
  }

  lines.push("");
  lines.push("    classDef inherited fill:#e8f4ea,stroke:#2e7d32");
  lines.push("    classDef shared fill:#e3f2fd,stroke:#1565c0");
  lines.push("    classDef customer fill:#fff3e0,stroke:#ef6c00");
  lines.push("    classDef inscope fill:#fff,stroke:#111,stroke-width:2px");
  lines.push("    classDef outscope fill:#f8f8f8,stroke:#bbb,stroke-width:1px");
  lines.push("");

  for (const n of sortedNodes) {
    const sid = safeId(n.id);
    if (!n.in_scope) {
      lines.push(`    class ${sid} outscope`);
    } else {
      lines.push(`    class ${sid} inscope`);
    }
  }

  for (const i of boundaryCrossingIndices) {
    lines.push(`    linkStyle ${i} stroke-width:3px,stroke:#b71c1c`);
  }

  lines.push("");
  lines.push('    subgraph Legend["Legend"]');
  lines.push('        LegendScope["In Scope: thick border; Out of Scope: light border"]');
  lines.push('        LegendTypes["Data types: Mgmt, Auth, Logs"]');
  const legendCui =
    "CUI at Rest: data at rest in the CUI processing environment; encryption at rest required.";
  lines.push(`        LegendCUI["${escapeLabel(legendCui)}"]`);
  lines.push("    end");

  return lines.join("\n");
}
