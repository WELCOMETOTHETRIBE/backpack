import { describe, it, expect } from "vitest";
import { generateDiagramSpec } from "../generateSpec";
import { renderMermaid } from "../renderMermaid";
import type { BoundaryInput } from "@/boundary-engine";
import type { DiagramSpec } from "../types";

const azureGovBoundaryFull: BoundaryInput = {
  hosting_model: "IaaS",
  provider: "Azure",
  environment: "Government",
  os: "Windows Server 2025 Datacenter",
  services_enabled: {
    compute_vm: true,
    network_nsg: true,
    identity_entra_id: true,
    security_defender_for_cloud: true,
    logging_azure_monitor_log_analytics: true,
    crypto_azure_key_vault: true,
    backup_azure_backup: true,
    network_azure_firewall: false,
    network_expressroute: false,
  },
  gate_answers: {},
};

describe("renderMermaid", () => {
  it("is deterministic: same spec yields identical output", () => {
    const spec = generateDiagramSpec({
      boundary: azureGovBoundaryFull,
      environment: "government",
      mode: "assessor",
    });
    const a = renderMermaid(spec);
    const b = renderMermaid(spec);
    expect(a).toBe(b);
  });

  it("produces valid flowchart TB with subgraphs", () => {
    const spec = generateDiagramSpec({
      boundary: azureGovBoundaryFull,
      environment: "government",
      mode: "assessor",
    });
    const out = renderMermaid(spec);
    expect(out).toMatch(/^flowchart TB/);
    expect(out).toContain('subgraph CUI["CUI Processing Environment');
    expect(out).toContain("classDef inherited");
    expect(out).toContain("classDef shared");
    expect(out).toContain("classDef customer");
    expect(out).toContain("classDef outscope");
  });

  it("is deterministic for executive mode", () => {
    const spec = generateDiagramSpec({
      boundary: azureGovBoundaryFull,
      environment: "government",
      mode: "executive",
    });
    const a = renderMermaid(spec);
    const b = renderMermaid(spec);
    expect(a).toBe(b);
  });

  it("includes linkStyle for boundary-crossing edges when present", () => {
    const spec: DiagramSpec = generateDiagramSpec({
      boundary: azureGovBoundaryFull,
      environment: "government",
      mode: "assessor",
    });
    const out = renderMermaid(spec);
    const hasCrossing = spec.edges.some((e) => e.boundary_crossing);
    if (hasCrossing) {
      expect(out).toContain("linkStyle");
      expect(out).toContain("stroke-width");
    }
  });
});
