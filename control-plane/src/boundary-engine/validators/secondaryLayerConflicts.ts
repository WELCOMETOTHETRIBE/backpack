import type { ControlRegistryItem } from "../types";
import type { ProviderProfile } from "../types";
import type { SecondaryLayerWarning } from "../types";

/**
 * Returns warnings when a control's primary layer is governance (never_inherited)
 * but a secondary_layer is in always_inherited_layers (platform).
 * Does not throw; use for "review manual allocation" UX.
 */
export function detectSecondaryLayerConflicts(
  controls: ControlRegistryItem[],
  providerProfile: ProviderProfile
): SecondaryLayerWarning[] {
  const neverSet = new Set(providerProfile.never_inherited_layers ?? []);
  const alwaysSet = new Set(providerProfile.always_inherited_layers ?? []);
  const warnings: SecondaryLayerWarning[] = [];

  for (const control of controls) {
    if (!control.secondary_layers?.length) continue;
    if (!neverSet.has(control.layer)) continue;
    const hasPlatformSecondary = control.secondary_layers.some((l) =>
      alwaysSet.has(l)
    );
    if (hasPlatformSecondary) {
      warnings.push({
        control_id: control.control_id,
        message:
          "Control spans governance + platform; review manual allocation.",
      });
    }
  }

  return warnings;
}
