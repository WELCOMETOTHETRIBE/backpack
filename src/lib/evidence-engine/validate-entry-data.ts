import { z } from "zod";
import type { RegisterEntryType } from "@/data/cmmc/types";

export type ValidationResult =
  | { success: true; data: Record<string, unknown> }
  | { success: false; fields: Record<string, string> };

/**
 * Build a Zod schema from a register entry type (required, optional, enums) and parse entryData.
 * Returns field-level errors for API/UI.
 */
export function validateEntryData(
  entryTypeSchema: RegisterEntryType,
  entryData: Record<string, unknown>
): ValidationResult {
  const shape: Record<string, z.ZodTypeAny> = {};
  const allKeys = [...new Set([...entryTypeSchema.required, ...entryTypeSchema.optional])];
  for (const key of allKeys) {
    const allowed = entryTypeSchema.enums[key];
    const isRequired = entryTypeSchema.required.includes(key);
    let fieldSchema: z.ZodTypeAny;
    if (allowed && allowed.length > 0) {
      fieldSchema = z.enum(allowed as [string, ...string[]]);
    } else {
      fieldSchema = z.union([z.string(), z.number(), z.boolean(), z.date()]).or(z.literal(""));
    }
    if (!isRequired) {
      fieldSchema = fieldSchema.optional().nullable();
    }
    shape[key] = fieldSchema;
  }
  const schema = z.object(shape).passthrough();
  const result = schema.safeParse(entryData);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path[0] != null ? String(issue.path[0]) : "unknown";
      if (!fields[path]) fields[path] = issue.message;
    }
    return { success: false, fields };
  }
  const data = result.data as Record<string, unknown>;
  const requiredFields: Record<string, string> = {};
  for (const key of entryTypeSchema.required) {
    const v = data[key];
    if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
      requiredFields[key] = "Required";
    }
  }
  if (Object.keys(requiredFields).length > 0) {
    return { success: false, fields: requiredFields };
  }
  return { success: true, data };
}
