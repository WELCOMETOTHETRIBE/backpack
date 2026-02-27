import type {
  ProviderProfile,
  ServiceCatalog,
  GateChecklist,
  BoundaryInput,
  ProviderCapabilityMatrix,
  ServiceForShared,
  ConfiguredButNotCreditableRisk,
} from "../types";
import { isServiceActive } from "./evaluateGates";

/**
 * Returns a concise summary for the boundary wizard sidebar: inherited layer count,
 * services that can increase Shared coverage (with gate counts), and when boundary
 * is provided, top "configured but not creditable" risks.
 */
export function getProviderCapabilityMatrix(params: {
  providerProfile: ProviderProfile;
  serviceCatalog: ServiceCatalog;
  gateChecklist: GateChecklist;
  boundaryInput?: BoundaryInput;
}): ProviderCapabilityMatrix {
  const {
    providerProfile,
    serviceCatalog,
    gateChecklist,
    boundaryInput,
  } = params;

  const inherited_layer_count =
    (providerProfile.always_inherited_layers ?? []).length;

  const gateByKey = new Map(
    (gateChecklist.services ?? []).map((s) => [s.service_key, s])
  );

  const services_for_shared: ServiceForShared[] = (
    serviceCatalog.services ?? []
  )
    .filter((s) => (s.coverage_layers ?? []).length > 0)
    .map((s) => {
      const gate = gateByKey.get(s.service_key);
      return {
        service_key: s.service_key,
        display_name: s.display_name,
        required_gate_count: gate?.required_gates?.length ?? 0,
        optional_gate_count: gate?.optional_gates?.length ?? 0,
        coverage_layer_count: (s.coverage_layers ?? []).length,
      };
    })
    .sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "en", { sensitivity: "base" })
    );

  let configured_but_not_creditable_risks: ConfiguredButNotCreditableRisk[] | undefined;
  if (boundaryInput) {
    const risks: ConfiguredButNotCreditableRisk[] = [];
    for (const svc of serviceCatalog.services ?? []) {
      if (boundaryInput.services_enabled[svc.service_key] !== true) continue;
      const result = isServiceActive(
        svc.service_key,
        boundaryInput,
        gateChecklist
      );
      if (!result.active && result.missing_required.length > 0) {
        risks.push({
          service_key: svc.service_key,
          display_name: svc.display_name,
          missing_required_gates: result.missing_required,
        });
      }
    }
    risks.sort(
      (a, b) => b.missing_required_gates.length - a.missing_required_gates.length
    );
    if (risks.length > 0) {
      configured_but_not_creditable_risks = risks;
    }
  }

  return {
    inherited_layer_count,
    services_for_shared,
    configured_but_not_creditable_risks,
  };
}
