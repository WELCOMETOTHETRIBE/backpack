import type { LayerId } from "../types";
import type { ServiceCatalog } from "../types";
import { ValidationError } from "../types";

/**
 * Ensures every coverage_layers entry in each catalog service exists in the ontology.
 */
export function validateServiceCatalog(
  catalog: ServiceCatalog,
  ontologyLayers: Set<LayerId>
): void {
  const invalid: Array<{ service_key: string; layer: string }> = [];

  if (!Array.isArray(catalog.services)) {
    throw new ValidationError({
      code: "SERVICE_CATALOG_INVALID",
      message: "Catalog must have a 'services' array",
      details: { catalog_id: catalog.catalog_id },
    });
  }

  for (const svc of catalog.services) {
    const layers = svc.coverage_layers ?? [];
    for (const layer of layers) {
      if (!ontologyLayers.has(layer)) {
        invalid.push({ service_key: svc.service_key, layer });
      }
    }
    for (const item of svc.coverage ?? []) {
      if (!ontologyLayers.has(item.layer)) {
        invalid.push({ service_key: svc.service_key, layer: item.layer });
      }
    }
  }

  if (invalid.length > 0) {
    throw new ValidationError({
      code: "SERVICE_CATALOG_UNKNOWN_LAYERS",
      message: "Service catalog references layers not in ontology",
      details: { invalid },
    });
  }
}
