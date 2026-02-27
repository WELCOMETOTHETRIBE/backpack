import type { LayerId } from "../types";
import type { ProviderProfile } from "../types";
import { ValidationError } from "../types";

/**
 * Ensures all layer strings referenced in the provider profile exist in the ontology.
 * Checks: always_inherited_layers, never_inherited_layers, default_customer_layers_in_iaas,
 * and every coverage_layers entry in profile.services.
 */
export function validateProviderProfile(
  profile: ProviderProfile,
  ontologyLayers: Set<LayerId>
): void {
  const invalid: string[] = [];

  function checkLayers(layers: string[], context: string): void {
    for (const layer of layers) {
      if (!ontologyLayers.has(layer)) {
        invalid.push(`${context}: ${layer}`);
      }
    }
  }

  checkLayers(profile.always_inherited_layers ?? [], "always_inherited_layers");
  checkLayers(profile.never_inherited_layers ?? [], "never_inherited_layers");
  checkLayers(
    profile.default_customer_layers_in_iaas ?? [],
    "default_customer_layers_in_iaas"
  );

  if (profile.services && typeof profile.services === "object") {
    for (const [svcKey, entry] of Object.entries(profile.services)) {
      if (entry?.coverage_layers) {
        checkLayers(
          entry.coverage_layers,
          `services.${svcKey}.coverage_layers`
        );
      }
    }
  }

  if (invalid.length > 0) {
    throw new ValidationError({
      code: "PROVIDER_PROFILE_UNKNOWN_LAYERS",
      message: "Provider profile references layers not in ontology",
      details: { invalid },
    });
  }

  const governanceInAlwaysInherited = (profile.always_inherited_layers ?? []).filter(
    (layer) => layer.startsWith("Governance/")
  );
  if (governanceInAlwaysInherited.length > 0) {
    throw new ValidationError({
      code: "PROVIDER_PROFILE_GOVERNANCE_IN_ALWAYS_INHERITED",
      message:
        "Governance layers must not appear in always_inherited_layers; they are customer responsibility.",
      details: { layers: governanceInAlwaysInherited },
    });
  }
}
