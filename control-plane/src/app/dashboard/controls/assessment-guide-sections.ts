/**
 * Parses Assessment Guide guidance text into structured sections for display.
 * Handles headers: Assessment Objectives, Potential Assessment Methods, Discussion,
 * Further Discussion, Example(s), Potential Assessment Considerations, Key References.
 */

const PAGE_BREAK = /--\s*\d+\s+of\s+\d+\s+--/g;
const FOOTER = /CMMC Assessment Guide – Level 2[^\n]*/gi;
const AC_HEADER = /AC\.L2-\d+\.\d+[^\n]*\n/g;

export type GuideSection = { label: string; body: string };

const SECTION_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Assessment objectives", pattern: /ASSESSMENT OBJECTIVES\s*\[NIST SP 800-171A\]\s*\d*\s*\n/i },
  { label: "Potential assessment methods and objects", pattern: /POTENTIAL ASSESSMENT METHODS AND OBJECTS\s*\[NIST SP 800-171A\]\s*\d*\s*\n/i },
  { label: "Discussion (NIST SP 800-171 Rev. 2)", pattern: /DISCUSSION\s*\[NIST SP 800-171 REV\.?\s*2\]\s*\d*\s*\n/i },
  { label: "Further discussion", pattern: /FURTHER DISCUSSION\s*\n/i },
  { label: "Examples", pattern: /Example\s+\d\s*\n/i },
  { label: "Potential assessment considerations", pattern: /Potential Assessment Considerations\s*\n/i },
  { label: "Key references", pattern: /KEY REFERENCES?\s*\n/i },
];

function cleanChunk(text: string): string {
  return text
    .replace(PAGE_BREAK, "")
    .replace(FOOTER, "")
    .replace(AC_HEADER, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split guidance text into labeled sections for the Assessment Guide.
 * Returns array of { label, body }; any text before the first match is in a "Context" or "Overview" section.
 */
export function parseAssessmentGuideSections(guidance: string | null | undefined): GuideSection[] {
  if (!guidance || !guidance.trim()) return [];

  let cleaned = cleanChunk(guidance);
  const sections: GuideSection[] = [];
  let lastIndex = 0;
  const matches: { index: number; label: string; pattern: RegExp }[] = [];

  for (const { label, pattern } of SECTION_PATTERNS) {
    const m = cleaned.match(pattern);
    if (m) {
      const index = cleaned.indexOf(m[0]);
      matches.push({ index, label, pattern });
    }
  }
  matches.sort((a, b) => a.index - b.index);

  for (const { index, label, pattern } of matches) {
    if (index > lastIndex) {
      const body = cleaned.slice(lastIndex, index).trim();
      if (body.length > 0) {
        const existing = sections.find((s) => s.label === "Overview");
        if (existing) existing.body += "\n\n" + body;
        else sections.push({ label: "Overview", body });
      }
    }
    const endOfMatch = index + (cleaned.slice(index).match(pattern)?.[0]?.length ?? 0);
    let nextStart = cleaned.length;
    const nextMatch = matches.find((m) => m.index > index);
    if (nextMatch) nextStart = nextMatch.index;
    const body = cleaned.slice(endOfMatch, nextStart).trim();
    if (body.length > 0) {
      if (label === "Examples") {
        const existing = sections.find((s) => s.label === "Examples");
        if (existing) existing.body += "\n\n" + body;
        else sections.push({ label: "Examples", body });
      } else {
        sections.push({ label, body });
      }
    }
    lastIndex = nextStart;
  }

  if (lastIndex < cleaned.length) {
    const body = cleaned.slice(lastIndex).trim();
    if (body.length > 0) sections.push({ label: "More", body });
  }

  return sections;
}

/**
 * Strip page breaks and footers from requirement or discussion text for display.
 */
export function cleanDisplayText(text: string | null | undefined): string {
  if (!text) return "";
  return cleanChunk(text);
}

/** Strip leading stray parsing chars (e.g. "*:") from section body text; does not remove markdown **bold**. */
function stripStraySectionPrefix(s: string): string {
  return s.replace(/^\s*\*:\s*/i, "").trim();
}

/** Splits text on "How the Codex Accelerator Helps" so assessor content can be shown without product-specific copy. */
export function extractCodexAcceleratorSection(text: string): { main: string; codex: string } {
  const codexMarker = /\s*\*?\s*\*?How the Codex Accelerator Helps\*?\s*:?\s*/i;
  const idx = text.search(codexMarker);
  if (idx === -1) return { main: text, codex: "" };
  const main = text.slice(0, idx).replace(/\s*$/, "");
  const after = stripStraySectionPrefix(text.slice(idx).replace(codexMarker, "").trim());
  return { main, codex: after };
}

const ASSESSOR_FALLBACK_LABELS = ["Potential assessment methods and objects", "Assessment objectives"];

export type SctmAssessorInput = {
  assessor_interrogation?: {
    assessor_questions?: string;
    examine_criteria?: string;
    test_procedures?: string;
  };
} | null | undefined;

/**
 * Builds the full assessment guide section list: What assessors do (from SCTM or NIST fallback),
 * How this platform helps, then remaining parsed NIST sections.
 */
export function buildAssessmentGuideSections(
  controlId: string,
  nistDiscussionGuidance: string | null | undefined,
  sctmOptimized: SctmAssessorInput,
  getPlatformHelp: (id: string) => string
): GuideSection[] {
  const guideSections = parseAssessmentGuideSections(nistDiscussionGuidance);
  let whatAssessorsSection: GuideSection | null = null;
  let remainingGuideSections = guideSections;

  const hasAssessorContent =
    sctmOptimized?.assessor_interrogation &&
    (sctmOptimized.assessor_interrogation.assessor_questions ||
      sctmOptimized.assessor_interrogation.examine_criteria ||
      sctmOptimized.assessor_interrogation.test_procedures);

  if (hasAssessorContent && sctmOptimized?.assessor_interrogation) {
    const testProcedures = sctmOptimized.assessor_interrogation.test_procedures ?? "";
    const { main: testMain } = extractCodexAcceleratorSection(testProcedures);
    const body = [
      sctmOptimized.assessor_interrogation.assessor_questions &&
        `**Interview**\n\n${sctmOptimized.assessor_interrogation.assessor_questions}`,
      sctmOptimized.assessor_interrogation.examine_criteria &&
        `**Examine**\n\n${sctmOptimized.assessor_interrogation.examine_criteria}`,
      testMain && `**Test**\n\n${testMain}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (body.trim()) {
      whatAssessorsSection = { label: "What assessors do", body: body.trim() };
    }
  }

  if (!whatAssessorsSection && guideSections.length > 0) {
    const firstAssessor = guideSections.find((s) => ASSESSOR_FALLBACK_LABELS.includes(s.label));
    if (firstAssessor?.body?.trim()) {
      whatAssessorsSection = { label: "What assessors do", body: firstAssessor.body.trim() };
      remainingGuideSections = guideSections.filter((s) => s !== firstAssessor);
    }
  }

  const platformHelpSection: GuideSection = {
    label: "How this platform helps",
    body: getPlatformHelp(controlId),
  };

  return [
    ...(whatAssessorsSection ? [whatAssessorsSection] : []),
    platformHelpSection,
    ...remainingGuideSections,
  ];
}
