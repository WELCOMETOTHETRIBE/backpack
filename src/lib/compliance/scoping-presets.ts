/**
 * Architecture-based scoping presets — pre-defined sets of controls that are
 * Not Applicable for a given deployment architecture.
 *
 * Each entry sets implementationStatus = "not_applicable", technicalStatus =
 * "not_applicable", and populates governanceNarrative with the justification.
 */

export interface ScopingControl {
  controlId: string;   // NIST 3.x.y format
  domain: string;      // e.g. "AC", "MA"
  title: string;       // short control name for display
  reason: string;      // N/A justification narrative
}

export interface ScopingPreset {
  id: string;
  label: string;
  description: string;
  controls: ScopingControl[];
}

// ─── Cloud-Only Azure Preset ─────────────────────────────────────────────────
// Applies to systems where:
//   - All compute is cloud-hosted (Azure / IaaS / SaaS)
//   - No organizational wireless infrastructure
//   - No physical customer-owned equipment
//   - No removable or physical media
//   - All CUI processing is digital only

export const CLOUD_ONLY_AZURE_PRESET: ScopingPreset = {
  id: "cloud-only-azure",
  label: "Cloud-Only (Azure / IaaS)",
  description:
    "10 controls become N/A for cloud-hosted systems with no physical infrastructure, wireless networking, or removable media.",
  controls: [
    {
      controlId: "3.1.16",
      domain: "AC",
      title: "Authorize wireless access",
      reason:
        "Cloud-only environment hosted in Azure. No organizational wireless infrastructure is deployed or managed by this system.",
    },
    {
      controlId: "3.1.17",
      domain: "AC",
      title: "Protect wireless access",
      reason:
        "Cloud-only environment hosted in Azure. No organizational wireless infrastructure is deployed or managed by this system.",
    },
    {
      controlId: "3.7.3",
      domain: "MA",
      title: "Sanitize equipment for off-site maintenance",
      reason:
        "Cloud-only environment. No physical customer-owned equipment exists that would require sanitization before off-site maintenance.",
    },
    {
      controlId: "3.7.4",
      domain: "MA",
      title: "Check maintenance media",
      reason:
        "Cloud-only environment. No removable maintenance or diagnostic media is used for system maintenance.",
    },
    {
      controlId: "3.7.6",
      domain: "MA",
      title: "Supervise maintenance personnel",
      reason:
        "Cloud-only environment. No external maintenance personnel with physical access to CUI systems; cloud provider maintenance is governed by Azure's BAA and SLA.",
    },
    {
      controlId: "3.8.4",
      domain: "MP",
      title: "Mark media with CUI markings",
      reason:
        "Digital-only environment. No physical media is used to store, process, or transport CUI.",
    },
    {
      controlId: "3.8.5",
      domain: "MP",
      title: "Control access to CUI during transport",
      reason:
        "Cloud-only environment. No physical media transport occurs; all CUI is transmitted digitally over encrypted channels.",
    },
    {
      controlId: "3.13.7",
      domain: "SC",
      title: "Prevent remote device split tunneling",
      reason:
        "All organizational access to this system is remote by design. There are no non-remote organizational connections; split-tunneling prevention is enforced at the endpoint policy level.",
    },
    {
      controlId: "3.13.12",
      domain: "SC",
      title: "Prohibit remote activation of collaborative devices",
      reason:
        "Web application environment. No collaborative computing devices (cameras, microphones, or similar peripherals) are present within the CUI processing boundary.",
    },
    {
      controlId: "3.13.14",
      domain: "SC",
      title: "Control VoIP",
      reason:
        "Web application environment. No VoIP functionality is deployed or integrated within the CUI processing boundary.",
    },
  ],
};

export const ALL_PRESETS: ScopingPreset[] = [CLOUD_ONLY_AZURE_PRESET];
