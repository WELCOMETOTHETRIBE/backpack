# Boundary Engine Seed Pack (Azure Government / IaaS)

This zip contains the core data files needed to compute control allocation (Inherited / Shared / Customer) from a user-defined system boundary.

## Files

- `providers/azure/government/iaas/profile.v1.json`
  Provider profile for Azure Government (IaaS). Defines always-inherited layers and never-inherited governance layers.

- `providers/azure/government/iaas/catalog.v1.json`
  Normalized catalog mapping Azure Gov services to the layers they support.

- `providers/azure/commercial/iaas/profile.v1.json`, `catalog.v1.json`
  Azure Commercial IaaS profile and catalog.

- `ontology/layers_ontology.v1.json`
  Canonical layer enum. All control registry `layer` fields MUST match one of these values (case-sensitive).

- `gates/gate_checklists.v1.json`
  Gate checklist schema for each optional service. A service contributes layers only when its required gates evaluate to 'yes'.

- `examples/example_boundary_input.v1.json`
  Example boundary input + gate answers payload.

## How to use

Your engine should:
1. Validate that all layer strings referenced are present in the ontology.
2. Load provider profile + service catalog + gate schema.
3. Evaluate gates for enabled services.
4. For each control in your `controls_registry.json`:
   - If control.layer in provider.never_inherited_layers -> Customer
   - Else if control.layer in provider.always_inherited_layers -> Inherited
   - Else if control.layer is covered by any enabled service with satisfied gates -> Shared
   - Else -> use control.default_allocation[hosting_model]

## Gates: configured but not creditable

When a service is **enabled** but one or more of its **required** gate answers are not `"yes"`, the service does **not** contribute its coverage layers to allocation (the engine treats it as inactive for coverage). The allocation output includes `rationale.gates_missing_required`: a map of service_key to the list of required gate IDs that were missing. The UI should surface this as **configured but not creditable** — for example: *"Backup configured; restore testing not confirmed — not creditable for Backup/Recovery coverage"* — and optionally list the missing gates so the user knows what to complete to get credit.

## Control registry layer rule

Every control must have **exactly one** canonical `layer` (an ontology layer ID). The engine uses only this field for allocation. Controls that span multiple concerns (e.g. 3.1.7) should use the *dominant* layer and can record the rest in optional `secondary_layers` (metadata only; the engine does not use `secondary_layers` for allocation). Do not encode multiple layers in `layer` as a single string (e.g. avoid "Identity/Access + Logging"); use one layer ID and optional `secondary_layers`.

## Notes

This seed pack does NOT include the full 110-control registry to avoid duplicating your canonical control source of truth.
Integrate it with your existing `controls.json` (NIST 800-171 Rev2 110 controls) and ensure each control has a valid `layer`. Run `validate-control-registry-layers.ts` to report unknown or ambiguous layers.