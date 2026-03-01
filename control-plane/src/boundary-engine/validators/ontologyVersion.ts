import type { LayersOntology } from "../types";
import type { ProviderProfile } from "../types";
import type { ServiceCatalog } from "../types";
import { ValidationError } from "../types";

/**
 * Ensures provider profile and service catalog reference the same ontology
 * by ontology_id and (optionally) exact semver match.
 * Call after loading ontology, profile, and catalog.
 */
export function validateOntologyVersion(
  ontology: LayersOntology,
  profile: ProviderProfile,
  catalog: ServiceCatalog
): void {
  const expectedId = ontology.ontology_id;
  const expectedVersion = ontology.version;

  if (profile.layer_ontology_version !== expectedId) {
    throw new ValidationError({
      code: "ONTOLOGY_VERSION_MISMATCH",
      message: "Provider profile layer_ontology_version does not match ontology",
      details: { expected: expectedId, actual: profile.layer_ontology_version },
    });
  }
  if (
    profile.ontology_semver != null &&
    profile.ontology_semver !== expectedVersion
  ) {
    throw new ValidationError({
      code: "ONTOLOGY_SEMVER_MISMATCH",
      message: "Provider profile ontology_semver does not match ontology.version",
      details: { expected: expectedVersion, actual: profile.ontology_semver },
    });
  }

  if (catalog.layer_ontology_version !== expectedId) {
    throw new ValidationError({
      code: "ONTOLOGY_VERSION_MISMATCH",
      message: "Service catalog layer_ontology_version does not match ontology",
      details: { expected: expectedId, actual: catalog.layer_ontology_version },
    });
  }
  if (
    catalog.ontology_semver != null &&
    catalog.ontology_semver !== expectedVersion
  ) {
    throw new ValidationError({
      code: "ONTOLOGY_SEMVER_MISMATCH",
      message: "Service catalog ontology_semver does not match ontology.version",
      details: { expected: expectedVersion, actual: catalog.ontology_semver },
    });
  }
}
