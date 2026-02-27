import type { BoundaryInput, ControlRegistryItem, AllocationResult } from "../types";

/** Dynamic import to avoid circular dependency with index (index -> engine -> exportSnapshot -> index). */
async function getEngine() {
  const mod = await import("../index");
  return {
    allocateForBoundary: mod.allocateForBoundary,
    resolveProfileAndCatalog: mod.resolveProfileAndCatalog,
    loadLayersOntology: mod.loadLayersOntology,
  };
}

/**
 * Snapshot schema: snapshot_json is the full AllocationResult (allocations, counts,
 * assurance_context, warnings, allocation_hash). Metadata is stored separately in
 * snapshot_metadata_json (generated_at, engine_version, ontology, profile_id, catalog_id, etc.).
 */
export interface SnapshotMetadata {
  generated_at: string;
  engine_version: string;
  ontology: { id: string; version: string };
  provider_profile_id: string;
  catalog_id: string;
  registry_version: string;
  allocation_hash: string;
}

export interface ExportSnapshotParams {
  account_id: string;
  boundary_id: string;
  boundary_input: BoundaryInput;
  controls_registry: ControlRegistryItem[];
  registry_version?: string;
  engine_version: string;
}

export interface ExportSnapshotResult {
  snapshot_metadata: SnapshotMetadata;
  snapshot_json: AllocationResult;
  allocation_hash: string;
}

/**
 * Runs allocation, then builds snapshot metadata and full snapshot payload.
 */
export async function exportAllocationSnapshot(
  params: ExportSnapshotParams
): Promise<ExportSnapshotResult> {
  const {
    boundary_input,
    controls_registry,
    registry_version = "",
    engine_version,
  } = params;

  const { allocateForBoundary, resolveProfileAndCatalog, loadLayersOntology } =
    await getEngine();

  const result = allocateForBoundary(boundary_input, controls_registry, {
    registryVersion: registry_version,
  });

  const ontology = loadLayersOntology();
  const { providerProfile, serviceCatalog } = resolveProfileAndCatalog(boundary_input);

  const allocation_hash = result.allocation_hash ?? "";

  const snapshot_metadata: SnapshotMetadata = {
    generated_at: new Date().toISOString(),
    engine_version,
    ontology: {
      id: ontology.ontology_id ?? "",
      version: ontology.version ?? "",
    },
    provider_profile_id: providerProfile.profile_id,
    catalog_id: serviceCatalog.catalog_id,
    registry_version: registry_version ?? "",
    allocation_hash,
  };

  return {
    snapshot_metadata,
    snapshot_json: result,
    allocation_hash,
  };
}
