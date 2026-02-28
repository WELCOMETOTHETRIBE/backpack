import { describe, it, expect } from "vitest";
import type { BoundaryInput } from "@/boundary-engine";
import { generateDiagramSpec } from "../generateSpec";

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

describe("generateDiagramSpec", () => {
  describe("assessor mode", () => {
    it("produces required nodes for Azure Gov IaaS with Entra, Defender, Monitor, Backup, Key Vault", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "assessor",
      });
      expect(spec.mode).toBe("assessor");
      const ids = new Set(spec.nodes.map((n) => n.id));
      expect(ids.has("admin_workstation")).toBe(true);
      expect(ids.has("user")).toBe(true);
      expect(ids.has("entra_id")).toBe(true);
      expect(ids.has("azure_control_plane")).toBe(true);
      expect(ids.has("azure_data_plane")).toBe(true);
      expect(ids.has("vnet_nsg")).toBe(true);
      expect(ids.has("bastion")).toBe(true);
      expect(ids.has("windows_server")).toBe(true);
      expect(ids.has("cui_store")).toBe(true);
      expect(ids.has("log_agent")).toBe(true);
      expect(ids.has("azure_monitor")).toBe(true);
      expect(ids.has("defender")).toBe(true);
      expect(ids.has("backup_vault")).toBe(true);
      expect(ids.has("key_vault")).toBe(true);
    });

    it("produces at least 5 external_connections rows for full Azure Gov scenario", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "assessor",
      });
      expect(spec.external_connections.length).toBeGreaterThanOrEqual(5);
    });

    it("includes boundary_label and assumptions", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "assessor",
      });
      expect(spec.boundary_label).toBe("CUI Processing Environment (In Scope)");
      expect(spec.assumptions.length).toBeGreaterThanOrEqual(1);
      expect(spec.assumptions.some((a) => a.toLowerCase().includes("bastion"))).toBe(true);
    });

    it("produces edges with boundary_crossing where appropriate", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "assessor",
      });
      const crossing = spec.edges.filter((e) => e.boundary_crossing === true);
      expect(crossing.length).toBeGreaterThan(0);
    });

    it("overlay=true adds control family tags to node labels (Entra ID and Windows Server)", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "assessor",
        overlay: true,
      });
      const entra = spec.nodes.find((n) => n.id === "entra_id");
      const windows = spec.nodes.find((n) => n.id === "windows_server");
      expect(entra).toBeDefined();
      expect(windows).toBeDefined();
      expect(entra!.label).toMatch(/IA|AC/);
      expect(windows!.label).toMatch(/CM|SI|AU|AC/);
    });

    it("when assumption_confirmations missing, spec.creditable is false and not_creditable_reasons populated", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "assessor",
      });
      expect(spec.creditable).toBe(false);
      expect(spec.not_creditable_reasons).toBeDefined();
      expect(spec.not_creditable_reasons!.length).toBeGreaterThanOrEqual(1);
    });

    it("when assumption_confirmations all yes, spec.creditable is true", () => {
      const boundaryWithConfirmations = {
        ...azureGovBoundaryFull,
        assumption_confirmations: {
          assume_admin_path_bastion: "yes",
          assume_no_public_rdp: "yes",
          assume_logs_forwarded_to_monitor: "yes",
        } as Record<string, "yes" | "no">,
      };
      const spec = generateDiagramSpec({
        boundary: boundaryWithConfirmations,
        environment: "government",
        mode: "assessor",
      });
      expect(spec.creditable).toBe(true);
      expect(spec.not_creditable_reasons).toBeUndefined();
    });

    it("external connections have data_type and at least one is Mgmt", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "assessor",
      });
      expect(spec.external_connections.length).toBeGreaterThan(0);
      const withMgmt = spec.external_connections.filter(
        (r) => r.data_type === "Mgmt"
      );
      expect(withMgmt.length).toBeGreaterThanOrEqual(1);
    });

    it("by default no external connection has cui_crosses_boundary true", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "assessor",
      });
      for (const row of spec.external_connections) {
        expect(row.cui_crosses_boundary).toBe(false);
      }
    });
  });

  describe("executive mode", () => {
    it("produces fewer nodes and no external_connections", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "executive",
      });
      expect(spec.mode).toBe("executive");
      expect(spec.nodes.length).toBeLessThan(15);
      expect(spec.external_connections.length).toBe(0);
    });

    it("includes high-level nodes only", () => {
      const spec = generateDiagramSpec({
        boundary: azureGovBoundaryFull,
        environment: "government",
        mode: "executive",
      });
      const ids = spec.nodes.map((n) => n.id);
      expect(ids).toContain("cloud_provider");
      expect(ids).toContain("os_workload");
      expect(ids).toContain("identity");
      expect(ids).toContain("security_monitoring");
    });
  });
});
