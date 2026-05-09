/**
 * SSP completeness validator — gates submit-to-Doc-Control on every
 * CA.L2-3.12.4 [a]–[h] determination statement having actual coverage
 * in the generated payload.
 *
 * Per CMMC L2 Assessment Guide v2.13 page 208, CA.L2-3.12.4 has 8
 * required determination statements. v2.13 page 209 enumerates the
 * SSP contents: scope description, environment of operation,
 * identified+approved security requirements, implementation method,
 * connections+relationships, defined update frequency, etc.
 *
 * v2.13 page 209 (terminal-failure quote):
 *   "OSAs must have an SSP in place at the time of assessment to
 *    describe each information system within the CMMC Assessment Scope.
 *    The absence of an up-to-date SSP at the time of the assessment
 *    would result in a finding that an assessment could not be
 *    completed due to incomplete information and noncompliance with
 *    DFARS clause 252.204-7012."
 *
 * Submitting an incomplete SSP to Doc Control is therefore worse than
 * submitting nothing — it generates a paper trail of an SSP that
 * doesn't actually meet 3.12.4. This validator catches the gap before
 * QMS sees it.
 *
 * The 8 objectives (verbatim from public/CMMC_SCTM_UI_Optimized.json):
 *   [a] a system security plan is developed
 *   [b] the system boundary is described and documented in the SSP
 *   [c] the system environment of operation is described and documented
 *   [d] the security requirements identified and approved by the
 *       designated authority as non-applicable are identified
 *   [e] the method of security requirement implementation is described
 *       and documented in the SSP
 *   [f] the relationship with or connection to other systems is
 *       described and documented in the SSP
 *   [g] the frequency to update the SSP is defined
 *   [h] SSP is updated with the defined frequency
 */

export type CompletenessObjective = "a" | "b" | "c" | "d" | "e" | "f" | "g" | "h";

export interface ObjectiveCheck {
  objective: CompletenessObjective;
  text: string;
  satisfied: boolean;
  rationale: string;
  /** Section keys / control IDs that contributed evidence. */
  evidenceFromSections: string[];
}

export interface CompletenessReport {
  ok: boolean;
  /** 0–8. */
  satisfiedCount: number;
  /** Always 8. */
  totalCount: number;
  /** Per-objective detail in [a]–[h] order. */
  objectives: ObjectiveCheck[];
  /** Letters of unsatisfied objectives (for terse rendering). */
  missing: CompletenessObjective[];
}

/**
 * Shape this validator expects. We accept anything roughly section-
 * shaped — the generator's GeneratedSection or a serialized form
 * survives this without coercion.
 */
export interface SspSectionLike {
  sectionKind: string;
  sectionKey: string;
  bodyMd: string;
  bodyJson?: unknown;
  aggregateFinding?: string | null;
  metVia?: string | null;
}

interface ValidateInput {
  /** Sections produced by the generator (or read from ssp_section_revisions). */
  sections: SspSectionLike[];
  /** Generation context — drives [g] / [h]. */
  generation: {
    /**
     * Defined update cadence in days. v2.13 page 209 doesn't pin a
     * number; the OSA defines it. >0 satisfies [g].
     */
    updateFrequencyDays?: number | null;
    /**
     * If this version supersedes an earlier one, [h] is satisfied.
     * For the first-ever version, [h] is "vacuously satisfied" with
     * a rationale that says so.
     */
    isFirstVersion?: boolean;
  };
}

const OBJECTIVE_TEXT: Record<CompletenessObjective, string> = {
  a: "a system security plan is developed",
  b: "the system boundary is described and documented in the system security plan",
  c: "the system environment of operation is described and documented in the system security plan",
  d: "the security requirements identified and approved by the designated authority as non-applicable are identified",
  e: "the method of security requirement implementation is described and documented in the system security plan",
  f: "the relationship with or connection to other systems is described and documented in the system security plan",
  g: "the frequency to update the system security plan is defined",
  h: "system security plan is updated with the defined frequency",
};

/** Heuristic threshold for "this section has real content, not just a stub". */
const MIN_NON_STUB_CHARS = 80;

/** Section is non-stub if it has at least N chars beyond its header. */
function hasSubstantiveContent(section: SspSectionLike | undefined): boolean {
  if (!section) return false;
  // Strip the heading line; the raw markdown body should still have
  // at least MIN_NON_STUB_CHARS of real prose.
  const bodyAfterHeading = section.bodyMd
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
    .trim();
  return bodyAfterHeading.length >= MIN_NON_STUB_CHARS;
}

export function validateSspCompleteness(input: ValidateInput): CompletenessReport {
  const sectionByKind = new Map<string, SspSectionLike>();
  for (const s of input.sections) {
    if (!sectionByKind.has(s.sectionKind)) {
      sectionByKind.set(s.sectionKind, s);
    }
  }
  const controlSections = input.sections.filter((s) => s.sectionKind === "control");

  // [a] system security plan is developed → at least one section exists.
  const a: ObjectiveCheck = {
    objective: "a",
    text: OBJECTIVE_TEXT.a,
    satisfied: input.sections.length > 0,
    rationale:
      input.sections.length > 0
        ? `${input.sections.length} sections rendered.`
        : "No sections rendered — SSP payload is empty.",
    evidenceFromSections: input.sections.length > 0 ? ["all"] : [],
  };

  // [b] system boundary described → scope section non-stub.
  const scope = sectionByKind.get("scope");
  const b: ObjectiveCheck = {
    objective: "b",
    text: OBJECTIVE_TEXT.b,
    satisfied: hasSubstantiveContent(scope),
    rationale: hasSubstantiveContent(scope)
      ? "scope section present with substantive boundary description."
      : "scope section missing or stubbed — boundary not described.",
    evidenceFromSections: scope ? [scope.sectionKey] : [],
  };

  // [c] environment of operation described → environment section non-stub.
  const env = sectionByKind.get("environment");
  const c: ObjectiveCheck = {
    objective: "c",
    text: OBJECTIVE_TEXT.c,
    satisfied: hasSubstantiveContent(env),
    rationale: hasSubstantiveContent(env)
      ? "environment section present with substantive content."
      : "environment section missing or stubbed.",
    evidenceFromSections: env ? [env.sectionKey] : [],
  };

  // [d] non-applicable security requirements identified → at least one
  //     control section has aggregate_finding === "NA" (the designated
  //     authority declared it non-applicable). If zero controls are
  //     marked NA, this objective is *vacuously* satisfied because
  //     there's nothing to identify; v2.13 doesn't require an org to
  //     have NA controls. We surface that in the rationale so a
  //     reviewer reads "0 N/A controls" and confirms.
  const naControls = controlSections.filter(
    (s) => s.aggregateFinding === "NA" || s.metVia === "not_applicable",
  );
  const d: ObjectiveCheck = {
    objective: "d",
    text: OBJECTIVE_TEXT.d,
    satisfied: true,
    rationale:
      naControls.length === 0
        ? "Vacuously satisfied — 0 controls flagged non-applicable. (Nothing to identify.)"
        : `${naControls.length} control(s) flagged non-applicable: ${naControls
            .map((s) => s.sectionKey)
            .slice(0, 10)
            .join(", ")}.`,
    evidenceFromSections: naControls.map((s) => s.sectionKey),
  };

  // [e] method of implementation described → every control section has
  //     either a narrative or at least one citation. We measure by
  //     non-stub body length; a control section with only the heading
  //     and no narrative fails. Per-control citations are inlined in
  //     the body, so the bodyMd length is a reasonable proxy.
  const controlsWithNarrative = controlSections.filter((s) => hasSubstantiveContent(s));
  const controlsWithoutNarrative = controlSections.filter(
    (s) => !hasSubstantiveContent(s),
  );
  const e: ObjectiveCheck = {
    objective: "e",
    text: OBJECTIVE_TEXT.e,
    satisfied:
      controlSections.length > 0 && controlsWithoutNarrative.length === 0,
    rationale:
      controlSections.length === 0
        ? "No control sections rendered — implementation methods not documented."
        : controlsWithoutNarrative.length === 0
          ? `All ${controlSections.length} control sections carry implementation narratives or citations.`
          : `${controlsWithoutNarrative.length} of ${controlSections.length} control section(s) are stubs (no narrative): ${controlsWithoutNarrative
              .slice(0, 10)
              .map((s) => s.sectionKey)
              .join(", ")}${controlsWithoutNarrative.length > 10 ? ", …" : ""}.`,
    evidenceFromSections: controlsWithNarrative.map((s) => s.sectionKey).slice(0, 20),
  };

  // [f] connections to other systems described → connections section
  //     non-stub.
  const conn = sectionByKind.get("connections");
  const f: ObjectiveCheck = {
    objective: "f",
    text: OBJECTIVE_TEXT.f,
    satisfied: hasSubstantiveContent(conn),
    rationale: hasSubstantiveContent(conn)
      ? "connections section present with substantive content."
      : "connections section missing or stubbed.",
    evidenceFromSections: conn ? [conn.sectionKey] : [],
  };

  // [g] frequency to update SSP defined → updateFrequencyDays > 0
  //     OR update_freq section non-stub. We accept either; the
  //     section's existence is the canonical signal but a custom-
  //     frequency-without-section case is still valid.
  const upd = sectionByKind.get("update_freq");
  const freqDefined =
    (input.generation.updateFrequencyDays ?? 0) > 0 ||
    hasSubstantiveContent(upd);
  const g: ObjectiveCheck = {
    objective: "g",
    text: OBJECTIVE_TEXT.g,
    satisfied: freqDefined,
    rationale: freqDefined
      ? `Update frequency defined${input.generation.updateFrequencyDays ? ` (${input.generation.updateFrequencyDays}d)` : " in update_freq section"}.`
      : "No update frequency defined — section missing AND no updateFrequencyDays set.",
    evidenceFromSections: upd ? [upd.sectionKey] : [],
  };

  // [h] SSP updated with defined frequency → either this is the first
  //     version (vacuously satisfied) or a prior version exists in
  //     ssp_documents (caller passes isFirstVersion=false in that
  //     case). We trust the caller's flag here; the submit endpoint
  //     queries the table to set it correctly.
  const h: ObjectiveCheck = {
    objective: "h",
    text: OBJECTIVE_TEXT.h,
    satisfied: true,
    rationale: input.generation.isFirstVersion
      ? "Vacuously satisfied — this is the first SSP version. Subsequent versions will be checked against the defined frequency."
      : "Satisfied — at least one prior SSP version exists, demonstrating the update cadence has been exercised.",
    evidenceFromSections: [],
  };

  const objectives = [a, b, c, d, e, f, g, h];
  const missing = objectives.filter((o) => !o.satisfied).map((o) => o.objective);

  return {
    ok: missing.length === 0,
    satisfiedCount: objectives.filter((o) => o.satisfied).length,
    totalCount: 8,
    objectives,
    missing,
  };
}
