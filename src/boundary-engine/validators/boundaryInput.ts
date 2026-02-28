import type { BoundaryInput, HostingModel } from "../types";
import type { ServiceCatalog } from "../types";
import type { GateChecklist } from "../types";
import { ValidationError } from "../types";

const HOSTING_MODELS: HostingModel[] = ["on_prem", "iaas", "paas", "saas"];

/**
 * Normalizes hosting_model to lowercase so "IaaS" becomes "iaas".
 * Returns the normalized value or throws if invalid.
 */
export function normalizeHostingModel(value: unknown): HostingModel {
  if (typeof value !== "string") {
    throw new ValidationError({
      code: "BOUNDARY_HOSTING_MODEL_INVALID",
      message: "hosting_model must be a string",
      details: { value },
    });
  }
  const normalized = value.toLowerCase() as HostingModel;
  if (!HOSTING_MODELS.includes(normalized)) {
    throw new ValidationError({
      code: "BOUNDARY_HOSTING_MODEL_INVALID",
      message: `hosting_model must be one of: ${HOSTING_MODELS.join(", ")}`,
      details: { value, normalized },
    });
  }
  return normalized;
}

/**
 * Validates boundary input against catalog and gates.
 * - Every key in services_enabled must exist as service_key in catalog.
 * - Every key in gate_answers must be a known gate (present in gates checklist).
 * - hosting_model is normalized to lowercase.
 * Returns a copy of boundary with normalized hosting_model (caller can use this for engine).
 */
export function validateBoundaryInput(
  boundary: Omit<BoundaryInput, "hosting_model"> & { hosting_model?: unknown },
  catalog: ServiceCatalog,
  gates: GateChecklist
): BoundaryInput {
  const hosting_model = normalizeHostingModel(
    boundary.hosting_model ?? "iaas"
  );

  const catalogServiceKeys = new Set(
    (catalog.services ?? []).map((s) => s.service_key)
  );

  const unknownServices: string[] = [];
  for (const key of Object.keys(boundary.services_enabled ?? {})) {
    if (!catalogServiceKeys.has(key)) {
      unknownServices.push(key);
    }
  }
  if (unknownServices.length > 0) {
    throw new ValidationError({
      code: "BOUNDARY_UNKNOWN_SERVICES",
      message: "Boundary references service keys not in catalog",
      details: { unknownServices },
    });
  }

  const knownGateIds = new Set<string>();
  for (const svc of gates.services ?? []) {
    for (const g of svc.gates ?? []) {
      if (g.gate_id) knownGateIds.add(g.gate_id);
    }
  }

  const unknownGates: string[] = [];
  for (const key of Object.keys(boundary.gate_answers ?? {})) {
    if (!knownGateIds.has(key)) {
      unknownGates.push(key);
    }
  }
  if (unknownGates.length > 0) {
    throw new ValidationError({
      code: "BOUNDARY_UNKNOWN_GATES",
      message: "Boundary references gate IDs not in gate checklist",
      details: { unknownGates },
    });
  }

  return {
    hosting_model,
    provider: boundary.provider ?? "",
    environment: boundary.environment ?? "",
    os: boundary.os,
    services_enabled: boundary.services_enabled ?? {},
    gate_answers: boundary.gate_answers ?? {},
    boundary_exclusions: boundary.boundary_exclusions ?? undefined,
    boundary_inclusions: boundary.boundary_inclusions ?? undefined,
    assumption_confirmations: boundary.assumption_confirmations ?? undefined,
  };
}
