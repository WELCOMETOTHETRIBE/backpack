import type { BoundaryInput } from "../types";
import type { GateChecklist } from "../types";
import type { ServiceActiveResult } from "../types";

/**
 * Determines if a service is active for coverage: enabled and all required gates are "yes".
 * Services with no gate schema (e.g. compute_vm) are active when enabled.
 */
export function isServiceActive(
  service_key: string,
  boundary: BoundaryInput,
  gateChecklist: GateChecklist
): ServiceActiveResult {
  const enabled = boundary.services_enabled[service_key] === true;
  if (!enabled) {
    return { active: false, missing_required: [] };
  }

  const entry = (gateChecklist.services ?? []).find(
    (s) => s.service_key === service_key
  );
  const required_gates = entry?.required_gates ?? [];

  const missing_required: string[] = [];
  for (const gate_id of required_gates) {
    const answer = boundary.gate_answers[gate_id];
    if (answer !== "yes") {
      missing_required.push(gate_id);
    }
  }

  return {
    active: missing_required.length === 0,
    missing_required,
  };
}
