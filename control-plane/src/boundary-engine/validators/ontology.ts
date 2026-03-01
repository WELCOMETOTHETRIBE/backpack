import type { LayerId } from "../types";
import type { LayersOntology } from "../types";
import { ValidationError } from "../types";

/**
 * Validates ontology JSON and returns the set of valid layer IDs.
 * Throws ValidationError if structure is invalid or layers array is missing/empty.
 */
export function validateOntology(ontology: unknown): Set<LayerId> {
  if (!ontology || typeof ontology !== "object") {
    throw new ValidationError({
      code: "ONTOLOGY_INVALID",
      message: "Ontology must be a non-null object",
      details: { ontology },
    });
  }

  const o = ontology as Record<string, unknown>;
  const layers = o.layers;

  if (!Array.isArray(layers)) {
    throw new ValidationError({
      code: "ONTOLOGY_LAYERS_MISSING",
      message: "Ontology must have a 'layers' array",
      details: { keys: Object.keys(o) },
    });
  }

  const set = new Set<LayerId>();
  for (let i = 0; i < layers.length; i++) {
    const entry = layers[i];
    if (!entry || typeof entry !== "object" || typeof (entry as Record<string, unknown>).id !== "string") {
      throw new ValidationError({
        code: "ONTOLOGY_LAYER_INVALID",
        message: `Ontology layer at index ${i} must be an object with string 'id'`,
        details: { index: i, entry },
      });
    }
    set.add((entry as { id: string }).id);
  }

  return set;
}
