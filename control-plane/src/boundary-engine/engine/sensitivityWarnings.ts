import type { BoundaryInput } from "../types";
import type { SensitivityWarning } from "../types";

/**
 * Returns risk/sensitivity warnings from boundary configuration.
 * Non-blocking; does not change allocation status.
 */
export function computeSensitivityWarnings(
  boundaryInput: BoundaryInput
): SensitivityWarning[] {
  const warnings: SensitivityWarning[] = [];
  const env = (boundaryInput.environment ?? "").toLowerCase();
  const isGov = env.includes("government");
  const os = (boundaryInput.os ?? "").toLowerCase();
  const isWindows = os.includes("windows");

  if (
    boundaryInput.hosting_model === "iaas" &&
    isGov &&
    boundaryInput.services_enabled["identity_entra_id"] !== true &&
    isWindows
  ) {
    warnings.push({
      code: "local_accounts_only_iaas",
      message: "Local accounts only in IaaS boundary",
    });
  }

  return warnings;
}
