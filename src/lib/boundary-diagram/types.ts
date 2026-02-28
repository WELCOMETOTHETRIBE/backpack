/**
 * Typed spec for C3PAO-grade boundary diagrams.
 * Generated from BoundaryInput + optional allocation results.
 */

export type DiagramMode = "executive" | "assessor";

export type TrustZone =
  | "Internet"
  | "Customer_Admin_Workstation"
  | "Azure_Gov_Platform"
  | "Azure_Control_Plane"
  | "Azure_Data_Plane"
  | "Azure_VNet_Boundary"
  | "Customer_CUI_Enclave"
  | "External_Services_OutOfScope";

export type NodeKind =
  | "user"
  | "workstation"
  | "identity"
  | "network_edge"
  | "compute"
  | "storage"
  | "security_monitoring"
  | "logging_siem"
  | "backup"
  | "key_management"
  | "external_dependency";

export type Responsibility = "Inherited" | "Shared" | "Customer";

export interface DiagramNode {
  id: string;
  label: string;
  zone: TrustZone;
  kind: NodeKind;
  responsibility: Responsibility;
  in_scope: boolean;
  notes?: string[];
}

export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
  data_type?: "CUI" | "Auth" | "Logs" | "Keys" | "Backups" | "Mgmt";
  encrypted?: boolean;
  direction?: "oneway" | "bidirectional";
  boundary_crossing?: boolean;
  notes?: string[];
}

export type DataTypeLabel =
  | "CUI"
  | "Auth"
  | "Logs"
  | "Keys"
  | "Backups"
  | "Mgmt";

export interface ExternalConnectionRow {
  connection_id: string;
  source_zone: TrustZone;
  dest_zone: TrustZone;
  purpose: string;
  protocol_ports: string;
  encryption: string;
  auth: string;
  approval_required: boolean;
  controls_hint: string[];
  data_type?: DataTypeLabel;
  cui_crosses_boundary: boolean;
}

export interface ScopeStrip {
  in_scope: string[];
  out_of_scope: string[];
  explicit_exclusions?: string[];
}

export interface AssumptionCheck {
  id: string;
  statement: string;
  required: boolean;
  confirmed: boolean;
}

export interface DiagramSpec {
  mode: DiagramMode;
  title: string;
  boundary_label: string;
  /** Assessor mode: Azure platform subgraph label (FedRAMP / Commercial). */
  azure_platform_label?: string;
  scope_strip?: ScopeStrip;
  assumption_checks?: AssumptionCheck[];
  creditable?: boolean;
  not_creditable_reasons?: string[];
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  external_connections: ExternalConnectionRow[];
  generated_at_utc: string;
  assumptions: string[];
}
