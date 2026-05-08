/**
 * Register key aliases.
 *
 * Two parallel vocabularies refer to the same logical register:
 *
 *   1. `register_id` in `register_entry_schemas.v1.json` — singular, terse.
 *      e.g. "access_authorization", "termination", "media_destruction". This
 *      is what `CONTROL_INTELLIGENCE.registerSchemaId` references and what
 *      `register_cadence_rules.v1.json` keys off of.
 *
 *   2. `registerKey` in `REGISTER_DEFINITIONS` (src/lib/governance/seed-data.ts)
 *      — plural / more descriptive. e.g. "access_authorizations",
 *      "terminations", "media_destruction_log". This is what gets written
 *      into `governance_registers.register_key` when an org is onboarded.
 *
 * When code wants to know "is register X provisioned for this org?" or
 * "how many final entries does register X have?", it holds the schema id
 * (from CONTROL_INTELLIGENCE) but the org row and the entry counts are
 * keyed by the seed-data key. Without a resolver, 14 of 24 registers
 * look unprovisioned / empty even when they exist.
 *
 * This file is the single source of truth mapping the two. Use
 * `resolveRegisterKeyCandidates(schemaId)` when you need to look up an
 * org register or final-entry count by a schema id; use
 * `schemaIdForRegisterKey(orgKey)` when you need to go the other way
 * (e.g. looking up cadence rules from an org register row).
 */

/**
 * schemaId → canonical seed-data registerKey (only listed when they differ).
 * Derived from src/lib/governance/seed-data.ts REGISTER_DEFINITIONS.
 */
const SCHEMA_ID_TO_SEED_KEY: Record<string, string> = {
  access_authorization: "access_authorizations",
  termination: "terminations",
  audit_log_review: "audit_log_review_records",
  control_monitoring: "control_monitoring_log",
  media_destruction: "media_destruction_log",
  authenticator_mgmt: "mfa_enrollment_roster",
  poam: "poam_tracker",
  policy_review: "policy_review_log",
  sod_matrix: "separation_of_duties_matrix",
};

/**
 * Inverse of the above: seed-data registerKey → schemaId (only when they differ).
 */
const SEED_KEY_TO_SCHEMA_ID: Record<string, string> = Object.fromEntries(
  Object.entries(SCHEMA_ID_TO_SEED_KEY).map(([schemaId, seedKey]) => [seedKey, schemaId])
);

/**
 * All register keys that could identify the same logical register as the
 * given input. Accepts either vocabulary; returns both candidates when they
 * differ, or a single-element array when they don't. Use this for
 * `Set.has()` / `Map.get()` lookups when you want to be robust against
 * which vocabulary holds the data.
 */
export function resolveRegisterKeyCandidates(id: string): string[] {
  if (!id) return [];
  const candidates = new Set<string>([id]);
  const seed = SCHEMA_ID_TO_SEED_KEY[id];
  if (seed) candidates.add(seed);
  const schema = SEED_KEY_TO_SCHEMA_ID[id];
  if (schema) candidates.add(schema);
  return [...candidates];
}

/**
 * Given any register key (schema id or seed key), return the canonical
 * schema id used by register_entry_schemas / CONTROL_INTELLIGENCE /
 * register_cadence_rules. Returns the input unchanged if no alias is
 * registered.
 */
export function schemaIdForRegisterKey(id: string): string {
  if (!id) return id;
  return SEED_KEY_TO_SCHEMA_ID[id] ?? id;
}
