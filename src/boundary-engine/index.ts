import path from "path";
import fs from "fs";
import type {
  ProviderProfile,
  ServiceCatalog,
  GateChecklist,
  LayersOntology,
  ControlRegistryItem,
  BoundaryInput,
  AllocationResult,
} from "./types";
import {
  validateOntology,
  validateOntologyVersion,
  validateProviderProfile,
  validateServiceCatalog,
  validateControlRegistry,
  validateBoundaryInput,
  validateSingleProviderBoundary,
  detectSecondaryLayerConflicts,
} from "./validators";
import { ValidationError } from "./types";
import {
  allocateControls,
  computeSensitivityWarnings,
  computeAllocationHash,
} from "./engine";

/** Resolve path to boundary-engine data directory (works from project root). */
function getDataPath(...segments: string[]): string {
  return path.join(process.cwd(), "src", "boundary-engine", "data", ...segments);
}

/**
 * Loads the Azure Government IaaS provider profile from seed data.
 */
export function loadAzureGovIaasProfile(): ProviderProfile {
  const filePath = getDataPath(
    "providers",
    "azure",
    "government",
    "iaas",
    "profile.v1.json"
  );
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ProviderProfile;
}

/**
 * Loads the Azure Government service catalog (services to layers) from seed data.
 */
export function loadAzureGovServiceCatalog(): ServiceCatalog {
  const filePath = getDataPath(
    "providers",
    "azure",
    "government",
    "iaas",
    "catalog.v1.json"
  );
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ServiceCatalog;
}

/**
 * Loads the Azure Commercial IaaS provider profile from seed data.
 */
export function loadAzureCommercialIaasProfile(): ProviderProfile {
  const filePath = getDataPath(
    "providers",
    "azure",
    "commercial",
    "iaas",
    "profile.v1.json"
  );
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ProviderProfile;
}

/**
 * Loads the Azure Commercial service catalog (services to layers) from seed data.
 */
export function loadAzureCommercialServiceCatalog(): ServiceCatalog {
  const filePath = getDataPath(
    "providers",
    "azure",
    "commercial",
    "iaas",
    "catalog.v1.json"
  );
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ServiceCatalog;
}

/**
 * Loads the gate checklist from seed data.
 */
export function loadGateChecklist(): GateChecklist {
  const filePath = getDataPath("gates", "gate_checklists.v1.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as GateChecklist;
}

/**
 * Loads the layers ontology from seed data and returns the parsed object.
 * For a Set of layer IDs, use validateOntology(loadLayersOntology()).
 */
export function loadLayersOntology(): LayersOntology {
  const filePath = getDataPath("ontology", "layers_ontology.v1.json");
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as LayersOntology;
}

/**
 * Loads the controls registry (NIST 800-171 style with layer and default_allocation) from seed data.
 * Used by allocation engine and snapshot export. Throws if file is missing.
 */
export function loadControlsRegistry(): ControlRegistryItem[] {
  const filePath = getDataPath("controls", "controls_registry.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Controls registry not found at ${filePath}. Add a controls_registry.json with ControlRegistryItem[] (control_id, family, title, layer, inheritable_possible, default_allocation).`
    );
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as ControlRegistryItem[];
}

/** Normalize provider string to a canonical key for resolver branching. Exported for API (e.g. storing provider_key). */
export function getNormalizedProviderKey(
  provider: string
): "azure" | "aws" | "gcp" | null {
  const p = (provider ?? "").toLowerCase();
  if (p.includes("azure")) return "azure";
  if (p.includes("aws")) return "aws";
  if (p.includes("gcp") || p.includes("google")) return "gcp";
  return null;
}

function normalizeProviderKey(provider: string): "azure" | "aws" | "gcp" | null {
  return getNormalizedProviderKey(provider);
}

/** Resolve profile and catalog for Azure (Gov vs Commercial from environment). */
function resolveAzureProfileAndCatalog(
  input: BoundaryInput
): { providerProfile: ProviderProfile; serviceCatalog: ServiceCatalog } {
  const env = (input.environment ?? "").toLowerCase();
  if (env.includes("gov") || env.includes("government")) {
    return {
      providerProfile: loadAzureGovIaasProfile(),
      serviceCatalog: loadAzureGovServiceCatalog(),
    };
  }
  return {
    providerProfile: loadAzureCommercialIaasProfile(),
    serviceCatalog: loadAzureCommercialServiceCatalog(),
  };
}

/** Resolver uses provider and environment; accepts full BoundaryInput for future branching (e.g. hosting_model, service_model). */
export function resolveProfileAndCatalog(
  input: BoundaryInput
): { providerProfile: ProviderProfile; serviceCatalog: ServiceCatalog } {
  const normalized = normalizeProviderKey(input.provider ?? "");
  switch (normalized) {
    case "azure":
      return resolveAzureProfileAndCatalog(input);
    case "aws":
      throw new ValidationError({
        code: "PROVIDER_NOT_IMPLEMENTED",
        message: "AWS is not yet implemented.",
        details: {
          provider_received: input.provider,
          implemented_providers: ["Azure"],
        },
      });
    case "gcp":
      throw new ValidationError({
        code: "PROVIDER_NOT_IMPLEMENTED",
        message: "GCP is not yet implemented.",
        details: {
          provider_received: input.provider,
          implemented_providers: ["Azure"],
        },
      });
    default:
      throw new ValidationError({
        code: "UNSUPPORTED_PROVIDER",
        message: "Only Azure is supported; provider must contain 'azure'.",
        details: {
          provider_received: input.provider,
          supported_providers: ["Azure"],
        },
      });
  }
}

export interface AllocateForBoundaryOptions {
  /** Optional control registry version for allocation_hash; if omitted, empty string is used. */
  registryVersion?: string;
}

/**
 * Validates all inputs and runs the allocation engine.
 * Returns allocations (stable-sorted by control_id), counts, assurance_context,
 * optional warnings, and allocation_hash.
 */
export function allocateForBoundary(
  boundaryInput: Parameters<typeof validateBoundaryInput>[0],
  controlsRegistry: ControlRegistryItem[],
  options?: AllocateForBoundaryOptions
): AllocationResult {
  validateSingleProviderBoundary(boundaryInput);

  const ontology = loadLayersOntology();
  const gateChecklist = loadGateChecklist();
  const { providerProfile, serviceCatalog } = resolveProfileAndCatalog(
    boundaryInput as BoundaryInput
  );
  const ontologyLayers = validateOntology(ontology);

  validateOntologyVersion(ontology, providerProfile, serviceCatalog);
  validateProviderProfile(providerProfile, ontologyLayers);
  validateServiceCatalog(serviceCatalog, ontologyLayers);
  validateControlRegistry(controlsRegistry, ontologyLayers);
  const boundary = validateBoundaryInput(boundaryInput, serviceCatalog, gateChecklist);

  const result = allocateControls({
    controls: controlsRegistry,
    providerProfile,
    serviceCatalog,
    gateChecklist,
    boundaryInput: boundary,
  });

  const secondary_layer_warnings = detectSecondaryLayerConflicts(
    controlsRegistry,
    providerProfile
  );
  if (secondary_layer_warnings.length > 0) {
    result.secondary_layer_warnings = secondary_layer_warnings;
  }

  const sensitivity_warnings = computeSensitivityWarnings(boundary);
  if (sensitivity_warnings.length > 0) {
    result.sensitivity_warnings = sensitivity_warnings;
  }

  result.allocation_hash = computeAllocationHash(
    providerProfile.profile_id,
    ontology.version,
    boundary,
    options?.registryVersion ?? ""
  );

  return result;
}

// Re-export types and validators for consumers
export type {
  BoundaryInput,
  ControlRegistryItem,
  ControlAllocation,
  ControlAllocationStatus,
  NotInheritedBecause,
  CoverageStrength,
  LayerCoverageItem,
  AllocationResult,
  AllocationCounts,
  AllocationRationale,
  AssuranceContext,
  SecondaryLayerWarning,
  SensitivityWarning,
  ProviderCapabilityMatrix,
  ServiceForShared,
  ConfiguredButNotCreditableRisk,
  ProviderProfile,
  ServiceCatalog,
  GateChecklist,
  ValidationError,
} from "./types";
export {
  validateOntology,
  validateOntologyVersion,
  validateProviderProfile,
  validateServiceCatalog,
  validateControlRegistry,
  validateBoundaryInput,
  validateSingleProviderBoundary,
  normalizeHostingModel,
  detectSecondaryLayerConflicts,
} from "./validators";
export {
  isServiceActive,
  allocateControls,
  computeSensitivityWarnings,
  getProviderCapabilityMatrix,
  detectBoundaryDrift,
  exportAllocationSnapshot,
  type ExportSnapshotParams,
  type ExportSnapshotResult,
  type SnapshotMetadata,
} from "./engine";
