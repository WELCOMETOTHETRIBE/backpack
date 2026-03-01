import controlLibrary from "@/data/control-library.v1.json";
import portalSchema from "@/data/portal-control-schema.v1.json";

/**
 * Canonical control definitions (v1).
 * Framework metadata belongs in the Control Plane (outside the CUI boundary).
 */
export function getControlLibrary() {
  return controlLibrary as any;
}

/**
 * Portal adjudication schema (v1).
 * Drives UI upload slots + technical evidence expectations.
 */
export function getPortalControlSchema() {
  return portalSchema as any;
}
