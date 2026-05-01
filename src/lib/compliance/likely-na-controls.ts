/**
 * Controls that are often not applicable; used for the boundary-page questionnaire
 * so users can quickly mark them N/A with a reason.
 *
 * As of the 2026-04-30 outstanding-controls work, several of these are now
 * pre-classified as N/A in CONTROL_INTELLIGENCE for the MacTech CUI Vault
 * architecture (3.7.3, 3.7.4, 3.13.7) or as customer-attested-inherited
 * (3.10.6). The questionnaire still surfaces them so the customer can
 * confirm their environment matches the architectural assumption — answering
 * "yes, this applies to us" reverts the disposition to PARTIAL and triggers
 * the appropriate register requirement (e.g., Visitor Log for 3.10.6).
 *
 * Each entry now carries a `preClassified` field so the UI can render a
 * "✓ Pre-classified as N/A — confirm or override" chip instead of an
 * open-ended yes/no question for the architecture-default cases.
 */
export const LIKELY_NA_CONTROL_IDS = [
  "3.1.16",
  "3.1.17",
  "3.7.3",
  "3.7.4",
  "3.10.6",
  "3.13.7",
  "3.13.14",
] as const;

export type LikelyNaControlId = (typeof LIKELY_NA_CONTROL_IDS)[number];

export const LIKELY_NA_RATIONALE_OPTIONS = [
  "Not in scope for this boundary",
  "We don't use this capability",
  "Handled by provider or contractor",
  "Other",
] as const;

export type PreClassification =
  /** CONTROL_INTELLIGENCE has this as N/A by default for MacTech CUI Vault. */
  | "na_architecture_static"
  /** Snapshot has this as inherited contingent on a customer attestation. */
  | "inherited_customer_attested"
  /** Not pre-classified — true questionnaire question. */
  | null;

export interface LikelyNaControlDef {
  controlId: LikelyNaControlId;
  title: string;
  /** Asked when preClassification is null. */
  question: string;
  /** Default disposition the platform assumes if customer doesn't override. */
  preClassification: PreClassification;
  /** One-line summary of why the architecture defaults this way. */
  preClassificationRationale?: string;
}

export const LIKELY_NA_CONTROL_DEFS: LikelyNaControlDef[] = [
  {
    controlId: "3.1.16",
    title: "Wireless Access Authorization",
    question: "Does this boundary use or allow wireless access to systems?",
    preClassification: "na_architecture_static",
    preClassificationRationale:
      "No wireless infrastructure within the CUI boundary — wired LAN / Azure Bastion only.",
  },
  {
    controlId: "3.1.17",
    title: "Wireless Access Protection",
    question: "Does this boundary use or allow wireless access to systems?",
    preClassification: "na_architecture_static",
    preClassificationRationale: "Same as 3.1.16.",
  },
  {
    controlId: "3.7.3",
    title: "Equipment Sanitization",
    question: "Do you send equipment from this boundary off-site for maintenance?",
    preClassification: "na_architecture_static",
    preClassificationRationale:
      "No physical media in the CUI Vault; Azure-managed deletion handles disposal.",
  },
  {
    controlId: "3.7.4",
    title: "Media Inspection",
    question: "Do you use removable or external diagnostic/test media in systems in this boundary?",
    preClassification: "na_architecture_static",
    preClassificationRationale:
      "No on-prem maintenance permitted; all admin work via Azure PIM.",
  },
  {
    controlId: "3.10.6",
    title: "Alternative Work Sites",
    question: "Does CUI in this boundary get accessed from alternate work sites (e.g., telework)?",
    preClassification: "inherited_customer_attested",
    preClassificationRationale:
      "Inherited from Azure Government FedRAMP High when customer attests no telework / alternate sites.",
  },
  {
    controlId: "3.13.7",
    title: "Split Tunneling",
    question: "Do users in this boundary use remote access (e.g., VPN) where split tunneling could apply?",
    preClassification: "na_architecture_static",
    preClassificationRationale:
      "No VPN; all access via Azure Bastion. Split tunneling does not apply.",
  },
  {
    controlId: "3.13.14",
    title: "Voice Over Internet Protocol",
    question: "Does this boundary use VoIP?",
    preClassification: null,
    preClassificationRationale: undefined,
  },
];

export function getLikelyNaDef(controlId: string): LikelyNaControlDef | undefined {
  return LIKELY_NA_CONTROL_DEFS.find((d) => d.controlId === controlId);
}

/** True when the architecture pre-classifies this control; the UI should show a confirmation chip. */
export function isPreClassified(controlId: string): boolean {
  return getLikelyNaDef(controlId)?.preClassification !== null;
}
