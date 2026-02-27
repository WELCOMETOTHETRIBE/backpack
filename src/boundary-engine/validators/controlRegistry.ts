import type { LayerId } from "../types";
import type { ControlRegistryItem } from "../types";
import { ValidationError } from "../types";

/**
 * Ensures each control's layer value exists in the ontology.
 */
export function validateControlRegistry(
  controls: ControlRegistryItem[],
  ontologyLayers: Set<LayerId>
): void {
  const invalid: Array<{ control_id: string; layer: string }> = [];

  for (const c of controls) {
    if (!ontologyLayers.has(c.layer)) {
      invalid.push({ control_id: c.control_id, layer: c.layer });
    }
  }

  if (invalid.length > 0) {
    throw new ValidationError({
      code: "CONTROL_REGISTRY_UNKNOWN_LAYERS",
      message: "Control registry references layers not in ontology",
      details: { invalid },
    });
  }
}
