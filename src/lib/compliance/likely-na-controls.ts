/**
 * Controls that are often not applicable; used for the boundary-page questionnaire
 * so users can quickly mark them N/A with a reason.
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

export interface LikelyNaControlDef {
  controlId: LikelyNaControlId;
  title: string;
  question: string;
}

export const LIKELY_NA_CONTROL_DEFS: LikelyNaControlDef[] = [
  {
    controlId: "3.1.16",
    title: "Wireless Access Authorization",
    question: "Does this boundary use or allow wireless access to systems?",
  },
  {
    controlId: "3.1.17",
    title: "Wireless Access Protection",
    question: "Does this boundary use or allow wireless access to systems?",
  },
  {
    controlId: "3.7.3",
    title: "Equipment Sanitization",
    question: "Do you send equipment from this boundary off-site for maintenance?",
  },
  {
    controlId: "3.7.4",
    title: "Media Inspection",
    question: "Do you use removable or external diagnostic/test media in systems in this boundary?",
  },
  {
    controlId: "3.10.6",
    title: "Alternative Work Sites",
    question: "Does CUI in this boundary get accessed from alternate work sites (e.g., telework)?",
  },
  {
    controlId: "3.13.7",
    title: "Split Tunneling",
    question: "Do users in this boundary use remote access (e.g., VPN) where split tunneling could apply?",
  },
  {
    controlId: "3.13.14",
    title: "Voice Over Internet Protocol",
    question: "Does this boundary use VoIP?",
  },
];

export function getLikelyNaDef(controlId: string): LikelyNaControlDef | undefined {
  return LIKELY_NA_CONTROL_DEFS.find((d) => d.controlId === controlId);
}
