/**
 * Adjudication questions for CMMC controls. Every control must have at least one question.
 * For controls not listed here, a single plain-English question is derived from the NIST control title.
 */

import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";

/** Explicit question sets for controls that need multiple or custom questions. */
export const CONTROL_ADJUDICATION_QUESTIONS: Record<string, string[]> = {
  "3.1.1": [
    "Do you limit system access to authorized users, processes, and devices only?",
    "Do you have account management procedures for systems and applications?",
    "Do you define and enforce access authorizations (e.g., by role or account type)?",
  ],
  "3.1.5": [
    "Do you employ least privilege for user and privileged accounts?",
    "Do you restrict privileged access to only what is required for specific duties?",
    "Do you have procedures for assigning and reviewing least privilege?",
  ],
  "3.5.3": [
    "Do you use multifactor authentication for local and network access to privileged accounts?",
    "Do you use multifactor authentication for network access to non-privileged accounts?",
    "Do you have a process to enforce MFA where required by this control?",
  ],
};

/**
 * Returns at least one adjudication question for the given control.
 * Uses explicit CONTROL_ADJUDICATION_QUESTIONS when defined; otherwise derives one from the NIST title.
 */
export function getAdjudicationQuestionsForControl(
  controlId: string,
  nistTitle?: string | null
): string[] {
  const explicit = CONTROL_ADJUDICATION_QUESTIONS[controlId];
  if (explicit && explicit.length > 0) return explicit;
  const title = (nistTitle ?? "").trim();
  if (title) return [`Do you have a process for: ${title}?`];
  return ["Do you have the required policies and procedures in place for this control?"];
}

/** Ensures every control in ALL_CONTROL_IDS has at least one question when given a title lookup. */
export function getAllControlIds(): string[] {
  return [...ALL_CONTROL_IDS];
}
