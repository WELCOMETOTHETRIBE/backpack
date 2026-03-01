import type {
  ControlRegistryItem,
  ControlAllocationStatus,
  ControlAllocation,
  AllocationRationale,
  AllocationCounts,
  AllocationResult,
  BoundaryInput,
  ProviderProfile,
  ServiceCatalog,
  GateChecklist,
  NotInheritedBecause,
  CoverageStrength,
} from "../types";
import { isServiceActive } from "./evaluateGates";

/** Hosting model key used to index default_allocation (lowercase). */
type HostingKey = keyof ControlRegistryItem["default_allocation"];

/**
 * Allocates each control to Inherited | Shared | Customer | NotApplicable using strict precedence.
 * Uses catalog for service->layer coverage; only always_inherited_layers yield Inherited.
 */
export function allocateControls(params: {
  controls: ControlRegistryItem[];
  providerProfile: ProviderProfile;
  serviceCatalog: ServiceCatalog;
  gateChecklist: GateChecklist;
  boundaryInput: BoundaryInput;
}): AllocationResult {
  const {
    controls,
    providerProfile,
    serviceCatalog,
    gateChecklist,
    boundaryInput,
  } = params;

  const hosting = (boundaryInput.hosting_model.toLowerCase() ||
    "iaas") as HostingKey;
  const neverSet = new Set(providerProfile.never_inherited_layers ?? []);
  const alwaysSet = new Set(providerProfile.always_inherited_layers ?? []);
  const providerRefs =
    providerProfile.evidence_expectations?.provider_inheritance ?? [];
  const customerTasks =
    providerProfile.evidence_expectations?.customer_configuration ?? [];

  const allocations: ControlAllocation[] = [];

  for (const control of controls) {
    const layer = control.layer;
    let status: ControlAllocationStatus;
    let rule: AllocationRationale["rule"];
    let contributing_services: string[] = [];
    let gates_missing_required: Record<string, string[]> = {};
    let coverage_strength: CoverageStrength | undefined;

    if (neverSet.has(layer)) {
      status = "Customer";
      rule = "never_inherited";
    } else if (alwaysSet.has(layer)) {
      status = "Inherited";
      rule = "always_inherited";
    } else {
      const activeContributors: string[] = [];
      const enabledButInactiveMissing: Record<string, string[]> = {};
      const contributorStrengths: CoverageStrength[] = [];

      for (const svc of serviceCatalog.services ?? []) {
        const coversLayer = svc.coverage?.length
          ? svc.coverage.some((c) => c.layer === layer)
          : (svc.coverage_layers ?? []).includes(layer);
        if (!coversLayer) continue;

        const result = isServiceActive(
          svc.service_key,
          boundaryInput,
          gateChecklist
        );
        if (result.active) {
          activeContributors.push(svc.service_key);
          const strength = svc.coverage?.find((c) => c.layer === layer)?.strength;
          if (strength) contributorStrengths.push(strength);
        } else if (
          boundaryInput.services_enabled[svc.service_key] === true &&
          result.missing_required.length > 0
        ) {
          enabledButInactiveMissing[svc.service_key] = result.missing_required;
        }
      }

      if (activeContributors.length > 0) {
        status = "Shared";
        rule = "service_covered";
        contributing_services = activeContributors;
        gates_missing_required = enabledButInactiveMissing;
        coverage_strength =
          contributorStrengths.includes("platform")
            ? "platform"
            : contributorStrengths[0];
      } else {
        const defaultStatus =
          control.default_allocation[hosting] ?? "Customer";
        status = defaultStatus;
        rule = "default_allocation";
      }
    }

    // Guard: service coverage never yields Inherited (CMMC; configuration + operation remain customer responsibility).
    if (rule === "service_covered") {
      status = "Shared";
    }

    let provider_evidence_refs: string[] | undefined;
    let customer_evidence_tasks: string[] | undefined;
    let not_inherited_because: NotInheritedBecause | undefined;
    if (status === "Inherited") {
      provider_evidence_refs = providerRefs.length > 0 ? [...providerRefs] : undefined;
      customer_evidence_tasks = ["Confirm services in FedRAMP scope"];
    } else if (status === "Shared") {
      provider_evidence_refs = providerRefs.length > 0 ? [...providerRefs] : undefined;
      customer_evidence_tasks = customerTasks.length > 0 ? [...customerTasks] : undefined;
      not_inherited_because =
        rule === "service_covered"
          ? "shared_platform_operational"
          : undefined;
    } else if (status === "Customer" || status === "NotApplicable") {
      provider_evidence_refs = [];
      customer_evidence_tasks = customerTasks.length > 0 ? [...customerTasks] : undefined;
    }

    allocations.push({
      control_id: control.control_id,
      status,
      layer,
      rationale: {
        rule,
        contributing_services,
        gates_missing_required,
        coverage_strength,
      },
      provider_evidence_refs,
      customer_evidence_tasks,
      not_inherited_because,
    });
  }

  allocations.sort((a, b) =>
    a.control_id.localeCompare(b.control_id, "en", { sensitivity: "base" })
  );

  const counts: AllocationCounts = {
    inherited: 0,
    shared: 0,
    customer: 0,
    notApplicable: 0,
  };
  for (const a of allocations) {
    if (a.status === "Inherited") counts.inherited++;
    else if (a.status === "Shared") counts.shared++;
    else if (a.status === "Customer") counts.customer++;
    else counts.notApplicable++;
  }

  const isGov = (providerProfile.environment ?? "")
    .toLowerCase()
    .includes("government");
  const fedrampExpected = providerProfile.assurance?.fedramp_expected === true;
  const assurance_context = {
    provider_assurance_target: isGov && fedrampExpected
      ? (providerProfile.assurance?.fedramp_level_target
          ? `FedRAMP ${providerProfile.assurance.fedramp_level_target} (expected)`
          : "FedRAMP High (expected)")
      : "Assurance must be explicitly selected",
    customer_must_confirm_scope: true,
  };

  return { allocations, counts, assurance_context };
}
