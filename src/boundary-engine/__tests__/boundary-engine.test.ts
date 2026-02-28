import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import {
  loadAzureGovIaasProfile,
  loadAzureGovServiceCatalog,
  loadAzureCommercialIaasProfile,
  loadAzureCommercialServiceCatalog,
  loadGateChecklist,
  loadLayersOntology,
  allocateForBoundary,
  resolveProfileAndCatalog,
  getProviderCapabilityMatrix,
  validateOntology,
  validateOntologyVersion,
  validateProviderProfile,
  validateServiceCatalog,
  validateControlRegistry,
  validateBoundaryInput,
  isServiceActive,
  allocateControls,
} from "../index";
import { ValidationError } from "../types";
import type { ControlRegistryItem, BoundaryInput } from "../types";

const DATA_DIR = path.join(
  process.cwd(),
  "src",
  "boundary-engine",
  "data"
);

function loadJson<T>(...segments: string[]): T {
  const filePath = path.join(DATA_DIR, ...segments);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

describe("Boundary Engine", () => {
  describe("loads JSON", () => {
    it("loads ontology with ontology_id and layers array", () => {
      const ontology = loadLayersOntology();
      expect(ontology).toBeDefined();
      expect(ontology.ontology_id).toBe("wttt-boundary-layers-v1");
      expect(Array.isArray(ontology.layers)).toBe(true);
      expect(ontology.layers.length).toBeGreaterThan(0);
      expect(ontology.layers[0]).toHaveProperty("id");
      expect(ontology.layers[0]).toHaveProperty("domain");
    });

    it("loads provider profile with always_inherited_layers and never_inherited_layers", () => {
      const profile = loadAzureGovIaasProfile();
      expect(profile.profile_id).toBe("microsoft-azure-government-iaas-v1");
      expect(Array.isArray(profile.always_inherited_layers)).toBe(true);
      expect(Array.isArray(profile.never_inherited_layers)).toBe(true);
      expect(profile.always_inherited_layers).toContain("Physical");
      expect(profile.always_inherited_layers).toContain("Infrastructure/Hypervisor");
      expect(profile.never_inherited_layers).toContain("Governance/Policy");
    });

    it("loads service catalog with services array and service_key", () => {
      const catalog = loadAzureGovServiceCatalog();
      expect(catalog.catalog_id).toBeDefined();
      expect(Array.isArray(catalog.services)).toBe(true);
      const computeVm = catalog.services.find((s) => s.service_key === "compute_vm");
      expect(computeVm).toBeDefined();
      expect(computeVm?.coverage_layers).toContain("Physical");
    });

    it("loads gate checklist with services and required_gates", () => {
      const gates = loadGateChecklist();
      expect(gates.gates_id).toBeDefined();
      expect(Array.isArray(gates.services)).toBe(true);
      const backup = gates.services.find((s) => s.service_key === "backup_azure_backup");
      expect(backup).toBeDefined();
      expect(backup?.required_gates).toContain("restore_tested");
    });

    it("loads example boundary input with hosting_model IaaS and gate_answers", () => {
      const boundary = loadJson<Record<string, unknown>>(
        "examples",
        "example_boundary_input.v1.json"
      );
      expect(boundary.hosting_model).toBe("IaaS");
      expect(boundary.services_enabled).toBeDefined();
      expect((boundary.gate_answers as Record<string, string>).restore_tested).toBe("no");
    });
  });

  describe("validates ontology and provider/service catalog", () => {
    it("validateOntology returns Set of layer ids", () => {
      const ontology = loadLayersOntology();
      const layers = validateOntology(ontology);
      expect(layers).toBeInstanceOf(Set);
      expect(layers.has("Physical")).toBe(true);
      expect(layers.has("Infrastructure/Hypervisor")).toBe(true);
      expect(layers.has("Backup/Recovery")).toBe(true);
    });

    it("validateProviderProfile passes with loaded profile and ontology", () => {
      const ontology = loadLayersOntology();
      const layers = validateOntology(ontology);
      const profile = loadAzureGovIaasProfile();
      expect(() =>
        validateProviderProfile(profile, layers)
      ).not.toThrow();
    });

    it("validateServiceCatalog passes with loaded catalog and ontology", () => {
      const ontology = loadLayersOntology();
      const layers = validateOntology(ontology);
      const catalog = loadAzureGovServiceCatalog();
      expect(() =>
        validateServiceCatalog(catalog, layers)
      ).not.toThrow();
    });

    it("validateProviderProfile throws ValidationError for unknown layer", () => {
      const ontology = loadLayersOntology();
      const layers = validateOntology(ontology);
      const profile = loadAzureGovIaasProfile();
      const badProfile = {
        ...profile,
        always_inherited_layers: [...profile.always_inherited_layers, "NonExistent/Layer"],
      };
      expect(() =>
        validateProviderProfile(badProfile, layers)
      ).toThrow(ValidationError);
      try {
        validateProviderProfile(badProfile, layers);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).code).toBe("PROVIDER_PROFILE_UNKNOWN_LAYERS");
        expect((e as ValidationError).message).toContain("ontology");
        expect((e as ValidationError).details).toBeDefined();
      }
    });

    it("validateProviderProfile throws when always_inherited_layers contains Governance layer", () => {
      const ontology = loadLayersOntology();
      const layers = validateOntology(ontology);
      const profile = loadAzureGovIaasProfile();
      const badProfile = {
        ...profile,
        always_inherited_layers: [...profile.always_inherited_layers, "Governance/Policy"],
      };
      expect(() => validateProviderProfile(badProfile, layers)).toThrow(ValidationError);
      try {
        validateProviderProfile(badProfile, layers);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).code).toBe("PROVIDER_PROFILE_GOVERNANCE_IN_ALWAYS_INHERITED");
        expect((e as ValidationError).message).toContain("Governance");
        expect((e as ValidationError).details).toBeDefined();
        expect((e as ValidationError).details?.layers).toContain("Governance/Policy");
      }
    });

    it("validateServiceCatalog throws ValidationError for unknown layer in catalog", () => {
      const ontology = loadLayersOntology();
      const layers = validateOntology(ontology);
      const catalog = loadAzureGovServiceCatalog();
      const badCatalog = {
        ...catalog,
        services: [
          ...catalog.services.slice(0, 1),
          {
            ...catalog.services[0],
            service_key: "fake_svc",
            coverage_layers: ["Fake/Layer"],
          },
          ...catalog.services.slice(1),
        ],
      };
      expect(() =>
        validateServiceCatalog(badCatalog, layers)
      ).toThrow(ValidationError);
      try {
        validateServiceCatalog(badCatalog, layers);
      } catch (e) {
        expect((e as ValidationError).code).toBe("SERVICE_CATALOG_UNKNOWN_LAYERS");
      }
    });
  });

  describe("example_boundary_input: gates and always-inherited", () => {
    const exampleBoundaryRaw = loadJson<Record<string, unknown>>(
      "examples",
      "example_boundary_input.v1.json"
    );

    it("normalizes hosting_model IaaS to iaas", () => {
      const catalog = loadAzureGovServiceCatalog();
      const gates = loadGateChecklist();
      const validated = validateBoundaryInput(exampleBoundaryRaw, catalog, gates);
      expect(validated.hosting_model).toBe("iaas");
    });

    it("backup_azure_backup is not active when restore_tested is no", () => {
      const catalog = loadAzureGovServiceCatalog();
      const gates = loadGateChecklist();
      const boundary = validateBoundaryInput(exampleBoundaryRaw, catalog, gates);
      const result = isServiceActive("backup_azure_backup", boundary, gates);
      expect(result.active).toBe(false);
      expect(result.missing_required).toContain("restore_tested");
    });

    it("control whose layer is only covered by backup gets default_allocation when backup is inactive", () => {
      const catalog = loadAzureGovServiceCatalog();
      const gates = loadGateChecklist();
      const profile = loadAzureGovIaasProfile();
      const ontology = loadLayersOntology();
      const layers = validateOntology(ontology);
      validateServiceCatalog(catalog, layers);
      validateProviderProfile(profile, layers);

      const controls: ControlRegistryItem[] = [
        {
          control_id: "backup-only-1",
          family: "CP",
          title: "Backup control",
          layer: "Backup/Recovery",
          inheritable_possible: true,
          default_allocation: {
            on_prem: "Customer",
            iaas: "Customer",
            paas: "Customer",
            saas: "Customer",
          },
        },
      ];
      validateControlRegistry(controls, layers);
      const boundary = validateBoundaryInput(exampleBoundaryRaw, catalog, gates);
      const { allocations } = allocateControls({
        controls,
        providerProfile: profile,
        serviceCatalog: catalog,
        gateChecklist: gates,
        boundaryInput: boundary,
      });
      expect(allocations).toHaveLength(1);
      expect(allocations[0].status).toBe("Customer");
      expect(allocations[0].rationale.rule).toBe("default_allocation");
    });

    it("controls in always_inherited_layers get Inherited and rule always_inherited", () => {
      const controls: ControlRegistryItem[] = [
        {
          control_id: "phys-1",
          family: "PE",
          title: "Physical control",
          layer: "Physical",
          inheritable_possible: true,
          default_allocation: {
            on_prem: "Customer",
            iaas: "Customer",
            paas: "Customer",
            saas: "Customer",
          },
        },
        {
          control_id: "hyper-1",
          family: "PE",
          title: "Hypervisor control",
          layer: "Infrastructure/Hypervisor",
          inheritable_possible: true,
          default_allocation: {
            on_prem: "Customer",
            iaas: "Customer",
            paas: "Customer",
            saas: "Customer",
          },
        },
      ];
      const result = allocateForBoundary(exampleBoundaryRaw, controls);
      expect(result.allocations).toHaveLength(2);
      expect(result.allocations.find((a) => a.control_id === "phys-1")?.status).toBe("Inherited");
      expect(result.allocations.find((a) => a.control_id === "phys-1")?.rationale.rule).toBe("always_inherited");
      expect(result.allocations.find((a) => a.control_id === "hyper-1")?.status).toBe("Inherited");
      expect(result.allocations.find((a) => a.control_id === "hyper-1")?.rationale.rule).toBe("always_inherited");
      expect(result.counts.inherited).toBe(2);
    });
  });

  describe("mocked control registry and output shape", () => {
    const exampleBoundaryRaw = loadJson<Record<string, unknown>>(
      "examples",
      "example_boundary_input.v1.json"
    );

    const mockedControls: ControlRegistryItem[] = [
      {
        control_id: "3.1.1",
        family: "AC",
        title: "Physical access",
        layer: "Physical",
        inheritable_possible: true,
        default_allocation: { on_prem: "Customer", iaas: "Customer", paas: "Customer", saas: "Customer" },
      },
      {
        control_id: "3.1.2",
        family: "AC",
        title: "Hypervisor",
        layer: "Infrastructure/Hypervisor",
        inheritable_possible: true,
        default_allocation: { on_prem: "Customer", iaas: "Customer", paas: "Customer", saas: "Customer" },
      },
      {
        control_id: "3.2.1",
        family: "AC",
        title: "Governance policy",
        layer: "Governance/Policy",
        inheritable_possible: false,
        default_allocation: { on_prem: "Customer", iaas: "Customer", paas: "Customer", saas: "Customer" },
      },
      {
        control_id: "3.3.1",
        family: "AC",
        title: "Identity AuthN",
        layer: "Identity/AuthN",
        inheritable_possible: true,
        default_allocation: { on_prem: "Customer", iaas: "Customer", paas: "Customer", saas: "Customer" },
      },
      {
        control_id: "3.4.1",
        family: "AC",
        title: "Network boundary",
        layer: "Network/Boundary",
        inheritable_possible: true,
        default_allocation: { on_prem: "Customer", iaas: "Customer", paas: "Customer", saas: "Customer" },
      },
      {
        control_id: "3.5.1",
        family: "CP",
        title: "Backup recovery",
        layer: "Backup/Recovery",
        inheritable_possible: true,
        default_allocation: { on_prem: "Customer", iaas: "Customer", paas: "Customer", saas: "Customer" },
      },
    ];

    it("allocations are stable-sorted by control_id", () => {
      const result = allocateForBoundary(exampleBoundaryRaw, mockedControls);
      const ids = result.allocations.map((a) => a.control_id);
      const sorted = [...ids].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
      expect(ids).toEqual(sorted);
    });

    it("counts sum to controls length and match status counts", () => {
      const result = allocateForBoundary(exampleBoundaryRaw, mockedControls);
      const total =
        result.counts.inherited +
        result.counts.shared +
        result.counts.customer +
        result.counts.notApplicable;
      expect(total).toBe(mockedControls.length);

      let inherited = 0,
        shared = 0,
        customer = 0,
        notApplicable = 0;
      for (const a of result.allocations) {
        if (a.status === "Inherited") inherited++;
        else if (a.status === "Shared") shared++;
        else if (a.status === "Customer") customer++;
        else notApplicable++;
      }
      expect(result.counts.inherited).toBe(inherited);
      expect(result.counts.shared).toBe(shared);
      expect(result.counts.customer).toBe(customer);
      expect(result.counts.notApplicable).toBe(notApplicable);
    });

    it("returns expected allocation mix for mocked controls with example boundary", () => {
      const result = allocateForBoundary(exampleBoundaryRaw, mockedControls);
      expect(result.allocations.find((a) => a.control_id === "3.1.1")?.status).toBe("Inherited");
      expect(result.allocations.find((a) => a.control_id === "3.1.2")?.status).toBe("Inherited");
      expect(result.allocations.find((a) => a.control_id === "3.2.1")?.status).toBe("Customer");
      expect(result.allocations.find((a) => a.control_id === "3.2.1")?.rationale.rule).toBe("never_inherited");
      expect(result.allocations.find((a) => a.control_id === "3.3.1")?.status).toBe("Shared");
      expect(result.allocations.find((a) => a.control_id === "3.3.1")?.rationale.rule).toBe("service_covered");
      expect(result.allocations.find((a) => a.control_id === "3.4.1")?.status).toBe("Shared");
      expect(result.allocations.find((a) => a.control_id === "3.5.1")?.status).toBe("Customer");
      expect(result.allocations.find((a) => a.control_id === "3.5.1")?.rationale.rule).toBe("default_allocation");
    });
  });

  describe("Azure Commercial profile and catalog", () => {
    it("loads commercial profile and catalog and validation passes", () => {
      const ontology = loadLayersOntology();
      const profile = loadAzureCommercialIaasProfile();
      const catalog = loadAzureCommercialServiceCatalog();
      expect(profile.profile_id).toContain("commercial");
      expect(catalog.catalog_id).toBeDefined();
      expect(Array.isArray(catalog.services)).toBe(true);
      const layers = validateOntology(ontology);
      expect(() =>
        validateOntologyVersion(ontology, profile, catalog)
      ).not.toThrow();
      expect(() => validateProviderProfile(profile, layers)).not.toThrow();
      expect(() => validateServiceCatalog(catalog, layers)).not.toThrow();
    });
  });

  function minimalBoundary(provider: string, environment: string): BoundaryInput {
    return {
      hosting_model: "iaas",
      provider,
      environment,
      services_enabled: {},
      gate_answers: {},
    };
  }

  describe("resolveProfileAndCatalog", () => {
    it("returns Gov profile and catalog when environment is Government", () => {
      const { providerProfile, serviceCatalog } = resolveProfileAndCatalog(
        minimalBoundary("Azure", "Government")
      );
      expect(providerProfile.profile_id).toBe("microsoft-azure-government-iaas-v1");
      expect(serviceCatalog.catalog_id).toBe("azure-government-services-to-layers-v1");
    });

    it("returns Gov profile and catalog when environment contains gov", () => {
      const { providerProfile } = resolveProfileAndCatalog(
        minimalBoundary("Microsoft Azure", "Azure Gov")
      );
      expect(providerProfile.profile_id).toBe("microsoft-azure-government-iaas-v1");
    });

    it("returns Commercial profile and catalog when environment is Commercial", () => {
      const { providerProfile, serviceCatalog } = resolveProfileAndCatalog(
        minimalBoundary("Azure", "Commercial")
      );
      expect(providerProfile.profile_id).toBe("microsoft-azure-commercial-iaas-v1");
      expect(serviceCatalog.catalog_id).toBe("azure-commercial-services-to-layers-v1");
    });

    it("returns Commercial when environment has no gov/government", () => {
      const { providerProfile } = resolveProfileAndCatalog(
        minimalBoundary("Azure", "Public")
      );
      expect(providerProfile.profile_id).toBe("microsoft-azure-commercial-iaas-v1");
    });

    it("chooses Gov bundle with case-chaos provider and environment", () => {
      const { providerProfile } = resolveProfileAndCatalog(
        minimalBoundary("AZURE", "gOvErNmEnT")
      );
      expect(providerProfile.profile_id).toBe("microsoft-azure-government-iaas-v1");
    });

    it("throws PROVIDER_NOT_IMPLEMENTED for AWS", () => {
      expect(() =>
        resolveProfileAndCatalog(minimalBoundary("AWS", "us-gov"))
      ).toThrow(ValidationError);
      try {
        resolveProfileAndCatalog(minimalBoundary("AWS", "us-gov"));
      } catch (e) {
        expect((e as ValidationError).code).toBe("PROVIDER_NOT_IMPLEMENTED");
        expect((e as ValidationError).details).toMatchObject({
          provider_received: "AWS",
          implemented_providers: ["Azure"],
        });
      }
    });

    it("throws UNSUPPORTED_PROVIDER when provider is unknown", () => {
      expect(() =>
        resolveProfileAndCatalog(minimalBoundary("SomeOtherCloud", "prod"))
      ).toThrow(ValidationError);
      try {
        resolveProfileAndCatalog(minimalBoundary("SomeOtherCloud", "prod"));
      } catch (e) {
        expect((e as ValidationError).code).toBe("UNSUPPORTED_PROVIDER");
        expect((e as ValidationError).details).toMatchObject({
          provider_received: "SomeOtherCloud",
          supported_providers: ["Azure"],
        });
      }
    });
  });

  describe("assurance_context for commercial", () => {
    it("allocateForBoundary with commercial boundary returns Assurance must be explicitly selected", () => {
      const catalog = loadAzureCommercialServiceCatalog();
      const serviceKeys = catalog.services.map((s) => s.service_key);
      const services_enabled = Object.fromEntries(
        serviceKeys.map((k) => [k, k === "compute_vm"])
      ) as Record<string, boolean>;
      const boundaryCommercial = {
        provider: "Azure",
        environment: "Commercial",
        hosting_model: "iaas",
        services_enabled,
        gate_answers: {},
      };
      const controls: ControlRegistryItem[] = [
        {
          control_id: "3.1.1",
          family: "AC",
          title: "Physical",
          layer: "Physical",
          inheritable_possible: true,
          default_allocation: {
            on_prem: "Customer",
            iaas: "Customer",
            paas: "Customer",
            saas: "Customer",
          },
        },
      ];
      const result = allocateForBoundary(boundaryCommercial, controls);
      expect(result.assurance_context).toBeDefined();
      expect(result.assurance_context!.provider_assurance_target).toBe(
        "Assurance must be explicitly selected"
      );
      expect(result.assurance_context!.customer_must_confirm_scope).toBe(true);
    });
  });

  describe("getProviderCapabilityMatrix", () => {
    it("returns inherited_layer_count and services_for_shared from profile and catalog", () => {
      const profile = loadAzureGovIaasProfile();
      const catalog = loadAzureGovServiceCatalog();
      const gates = loadGateChecklist();
      const matrix = getProviderCapabilityMatrix({
        providerProfile: profile,
        serviceCatalog: catalog,
        gateChecklist: gates,
      });
      expect(matrix.inherited_layer_count).toBe(
        profile.always_inherited_layers.length
      );
      expect(matrix.services_for_shared.length).toBeGreaterThan(0);
      expect(matrix.services_for_shared.every((s) => s.coverage_layer_count > 0)).toBe(true);
      expect(matrix.configured_but_not_creditable_risks).toBeUndefined();
    });

    it("includes configured_but_not_creditable_risks when boundary has enabled-but-inactive service", () => {
      const profile = loadAzureGovIaasProfile();
      const catalog = loadAzureGovServiceCatalog();
      const gates = loadGateChecklist();
      const boundary = loadJson<Record<string, unknown>>(
        "examples",
        "example_boundary_input.v1.json"
      );
      const validated = validateBoundaryInput(
        boundary as Parameters<typeof validateBoundaryInput>[0],
        catalog,
        gates
      );
      const matrix = getProviderCapabilityMatrix({
        providerProfile: profile,
        serviceCatalog: catalog,
        gateChecklist: gates,
        boundaryInput: validated,
      });
      expect(matrix.inherited_layer_count).toBeGreaterThan(0);
      expect(matrix.services_for_shared.length).toBeGreaterThan(0);
      const risks = matrix.configured_but_not_creditable_risks ?? [];
      const backupRisk = risks.find((r) => r.service_key === "backup_azure_backup");
      expect(backupRisk).toBeDefined();
      expect(backupRisk!.missing_required_gates).toContain("restore_tested");
    });
  });
});
