# Cloud Provider Onboarding

Checklist for adding a new cloud provider (e.g. AWS, GCP) to the boundary engine. The ontology is cloud-agnostic; provider profiles and catalogs are plug-ins; allocation is layer-based and unchanged per provider.

## File layout

- **Profile:** `src/boundary-engine/data/providers/{provider}/{environment}/{model}/profile.v1.json`
- **Catalog:** `src/boundary-engine/data/providers/{provider}/{environment}/{model}/catalog.v1.json`
- Example: `providers/azure/government/iaas/profile.v1.json`, `catalog.v1.json`

## Required fields in ProviderProfile

| Field | Required | Notes |
|-------|----------|--------|
| `profile_id` | Yes | Unique identifier for the profile |
| `provider` | Yes | Provider name (e.g. Microsoft) |
| `cloud` | Yes | Cloud brand (e.g. Azure) |
| `environment` | Yes | e.g. "Azure Government", "Commercial" |
| `service_model` | Yes | e.g. "IaaS" |
| `layer_ontology_version` | Yes | Must match ontology (e.g. wttt-boundary-layers-v1) |
| `always_inherited_layers` | Yes | Layer IDs always inherited from provider |
| `never_inherited_layers` | Yes | Layer IDs never inherited (e.g. Governance) |
| `default_customer_layers_in_iaas` | Yes | Default customer-owned layers in IaaS |
| `services` | Yes | Map of service_key → service entry |
| `ontology_semver` | Optional | If present, must match ontology.version |
| `cloud_model` | Optional | "IaaS" \| "PaaS" \| "SaaS" (documentation / future use) |
| `assurance` | Optional | FedRAMP or equivalent expectations |
| `evidence_expectations` | Optional | provider_inheritance, customer_configuration |

## Required validation guarantees

- [ ] All layer strings referenced in the profile exist in the layer ontology.
- [ ] `always_inherited_layers` must **not** contain any Governance layer (see Prohibited layers).
- [ ] When `ontology_semver` is specified, it must match the ontology version.

## Prohibited layers

- **Governance layers** (layer IDs starting with `"Governance/"`) must **not** appear in `always_inherited_layers`. They are customer responsibility. The validator throws `PROVIDER_PROFILE_GOVERNANCE_IN_ALWAYS_INHERITED` if any are present.

## Evidence expectation structure

- `evidence_expectations.provider_inheritance`: array of strings (e.g. FedRAMP SSP, continuous monitoring).
- `evidence_expectations.customer_configuration`: array of strings (e.g. tenant config exports, procedures).

## Assurance model declaration

- Use `assurance.fedramp_expected`, `assurance.fedramp_level_target` (or equivalent for non-FedRAMP) to declare what the profile expects.
- Use `environment` to distinguish commercial vs government; align with resolver (e.g. "gov" / "government" for Gov cloud).

## Gate requirements

- Service catalog and gate checklist must align: each catalog service’s `service_key` and required gates must be present in the gate checklist.
- Gates are provider/catalog-scoped; keep `data/gates/` shared or add provider-specific gate files as needed.

## Mapping rule

- Map **provider-specific services** to **existing ontology layers** only. Do **not** add new ontology layers per cloud; use the canonical layer set from `ontology/layers_ontology.v1.json`.

## Resolver integration

- In `resolveProfileAndCatalog`, add a branch for the new provider after normalizing with `normalizeProviderKey` (e.g. "aws" → load AWS profile/catalog from `providers/aws/...`).
- Until implemented, throw `ValidationError` with code `PROVIDER_NOT_IMPLEMENTED` and `implemented_providers: ["Azure"]` (or current list).
