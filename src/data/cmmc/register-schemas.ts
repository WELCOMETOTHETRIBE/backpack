import registerSchemasJson from "./register_entry_schemas.v1.json";
import type { RegisterEntrySchemas } from "./types";

const registerSchemas = registerSchemasJson as RegisterEntrySchemas;

/**
 * Returns register entry schemas (23 registers, entry types, required/optional, enums, attachments, default_cadence_days).
 * Treat as authoritative for form generation and validation.
 */
export function getRegisterSchemas(): RegisterEntrySchemas {
  return registerSchemas;
}

/**
 * Get schema for a single register by register_id (e.g. "access_authorization").
 */
export function getRegisterSchemaByRegisterId(registerId: string) {
  return registerSchemas.registerSchemas.find((s) => s.register_id === registerId) ?? null;
}

export { registerSchemas };
