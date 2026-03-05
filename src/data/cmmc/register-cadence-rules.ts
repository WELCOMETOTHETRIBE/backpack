import cadenceRulesJson from "./register_cadence_rules.v1.json";
import type { RegisterCadenceRules } from "./types";

const cadenceRules = cadenceRulesJson as RegisterCadenceRules;

/**
 * Returns the register cadence rules artifact (all 23 registers).
 * Use for cadence_days, warning_days, and event-driven (cadence_days=0) logic.
 * Takes precedence over register schema default_cadence_days when present.
 */
export function getRegisterCadenceRules(): RegisterCadenceRules {
  return cadenceRules;
}

/** Lookup by register_id. */
export function getCadenceRuleByRegisterId(registerId: string) {
  return cadenceRules.rules.find((r) => r.register_id === registerId) ?? null;
}

export { cadenceRules };
