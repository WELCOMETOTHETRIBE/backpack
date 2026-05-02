import {
  CONTROL_FAMILIES,
  getControlFamilyPrefix,
} from "@/components/governance-wizard/constants";

const FAMILY_CODE_BY_PREFIX: Record<string, string> = Object.fromEntries(
  CONTROL_FAMILIES.map((f) => [f.controlPrefix, f.code])
);

// SCTM detail lives at /dashboard/controls?family=XX&control=YYY. The
// /dashboard/controls/[id] route expects a UUID, not a NIST id, so linking
// directly there 404s.
export function controlDetailHref(controlId: string): string {
  const code = FAMILY_CODE_BY_PREFIX[getControlFamilyPrefix(controlId)];
  return code
    ? `/dashboard/controls?family=${code}&control=${controlId}`
    : `/dashboard/controls?control=${controlId}`;
}
