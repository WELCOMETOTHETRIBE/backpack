import { SCOPE_OPTIONS } from "./CreateSystemBoundaryModal";
import type { ScopeComponent } from "@/types/boundary";

const scopeLabelByValue = new Map<string, string>();
for (const group of SCOPE_OPTIONS) {
  for (const item of group.items) {
    scopeLabelByValue.set(item.value, item.label);
  }
}

/** Human-readable label for a scope component value. */
export function getScopeComponentLabel(value: ScopeComponent | string): string {
  return scopeLabelByValue.get(value) ?? value;
}

/** Labels for an array of scope component values. */
export function getScopeComponentLabels(values: string[] | null): string[] {
  if (!values?.length) return [];
  return values.map((v) => getScopeComponentLabel(v));
}
