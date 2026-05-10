/**
 * Severity classification for SSP baseline drift.
 *
 * Pure functions — no DB, no I/O. The detection engine
 * (src/lib/ssp/baseline-drift.ts) loads pinned + current state and
 * calls these to decide minor / moderate / material per the spec
 * rules. Keeping this in its own module makes the rules cheap to
 * unit-test exhaustively without spinning up a DB.
 *
 * The rules encode the spec language:
 *   minor    — log-only; the SSP narrative still defends the
 *              implementation against the change.
 *   moderate — review required; an authorized reviewer should decide
 *              whether the SSP should be revised.
 *   material — SSP redraft trigger; the released SSP no longer
 *              matches the system as built.
 */

export type DriftSeverity = "minor" | "moderate" | "material";

export interface RoutingFlags {
  requires_ssp_redraft: boolean;
  requires_poam_review: boolean;
  requires_document_control_review: boolean;
}

/**
 * Recommendation string surfaced on the adjudication UI. Mirrors the
 * action language the spec calls for.
 */
export interface Classification {
  severity: DriftSeverity;
  routing: RoutingFlags;
  recommendation: string;
}

/* ────────── Evidence-citation drift ─────────────────────────────── */

/**
 * The cited evidence row's bytes have changed (sha256 differs from
 * pinned), but the citation itself is still present. This is what
 * happens on evidence refresh (re-scan, re-uploaded screenshot,
 * regenerated config dump). Per spec: minor — log only.
 */
export function classifyEvidenceHashChanged(): Classification {
  return {
    severity: "minor",
    routing: {
      requires_ssp_redraft: false,
      requires_poam_review: false,
      requires_document_control_review: false,
    },
    recommendation:
      "Evidence refreshed; SSP narrative remains defensible. Log-only.",
  };
}

/**
 * The cited evidence row no longer exists. Per spec: moderate — the
 * SSP cites evidence the system can no longer produce, so the
 * narrative may need to point at a replacement. If the control
 * implementation status has also regressed, the control-status
 * detector raises material separately.
 */
export function classifyEvidenceRemoved(): Classification {
  return {
    severity: "moderate",
    routing: {
      requires_ssp_redraft: false,
      requires_poam_review: false,
      requires_document_control_review: true,
    },
    recommendation:
      "Cited evidence is missing. Confirm the implementation is still met by replacement evidence; if not, redraft the SSP section.",
  };
}

/* ────────── Control-finding drift ───────────────────────────────── */

/**
 * Control aggregateFinding moved between {MET, NOT_MET, NA}. The
 * spec calls regressions to NOT_MET material (control no longer
 * defensible) and flips to NA material (system scope changed). A
 * NOT_MET → MET *improvement* is moderate: it doesn't break the
 * released SSP but suggests the next baseline can ride on more
 * evidence.
 */
export function classifyControlFindingChange(
  previous: string | null,
  current: string | null,
): Classification {
  const prev = (previous ?? "").toUpperCase();
  const curr = (current ?? "").toUpperCase();

  if (prev === "MET" && curr === "NOT_MET") {
    return {
      severity: "material",
      routing: {
        requires_ssp_redraft: true,
        requires_poam_review: true,
        requires_document_control_review: true,
      },
      recommendation:
        "Control regressed MET → NOT_MET. SSP redraft required and POA&M should be opened.",
    };
  }
  if ((prev === "MET" || prev === "NOT_MET") && curr === "NA") {
    return {
      severity: "material",
      routing: {
        requires_ssp_redraft: true,
        requires_poam_review: false,
        requires_document_control_review: true,
      },
      recommendation:
        "Control flipped to N/A. Confirm scope/applicability rationale and redraft the SSP section.",
    };
  }
  if (prev === "NA" && (curr === "MET" || curr === "NOT_MET")) {
    return {
      severity: "material",
      routing: {
        requires_ssp_redraft: true,
        requires_poam_review: curr === "NOT_MET",
        requires_document_control_review: true,
      },
      recommendation:
        "Control left N/A and is now in scope. SSP redraft required to reflect the implementation.",
    };
  }
  if (prev === "NOT_MET" && curr === "MET") {
    // Improvement — the released SSP isn't broken by this, but the
    // operator probably wants to capture the new evidence in the
    // next baseline.
    return {
      severity: "moderate",
      routing: {
        requires_ssp_redraft: false,
        requires_poam_review: false,
        requires_document_control_review: false,
      },
      recommendation:
        "Control improved NOT_MET → MET. Capture new evidence in the next SSP version.",
    };
  }
  // Wobbles or unknown transitions — moderate, surface for review.
  return {
    severity: "moderate",
    routing: {
      requires_ssp_redraft: false,
      requires_poam_review: false,
      requires_document_control_review: true,
    },
    recommendation:
      "Control finding changed. Review whether the SSP narrative still applies.",
  };
}

/* ────────── Boundary-component drift ────────────────────────────── */

/**
 * A boundary component was added after the baseline released. Per
 * spec: material — system scope changed.
 */
export function classifyBoundaryComponentAdded(): Classification {
  return {
    severity: "material",
    routing: {
      requires_ssp_redraft: true,
      requires_poam_review: false,
      requires_document_control_review: true,
    },
    recommendation:
      "New boundary component since baseline release. SSP scope/inventory must be redrafted.",
  };
}

/* ────────── POA&M drift ─────────────────────────────────────────── */

/**
 * A POA&M was opened on a baseline-cited control after release. Per
 * spec: moderate — POA&Ms are part of the controlled record but a
 * new opening doesn't by itself invalidate the released SSP.
 */
export function classifyPoamOpenedPostBaseline(): Classification {
  return {
    severity: "moderate",
    routing: {
      requires_ssp_redraft: false,
      requires_poam_review: true,
      requires_document_control_review: false,
    },
    recommendation:
      "POA&M opened on a controlled control. Confirm whether the SSP should record the deficiency.",
  };
}

/**
 * A POA&M tied to a baseline-cited control was closed after release.
 * Moderate — the SSP may benefit from referencing the closure in
 * the next baseline.
 */
export function classifyPoamClosedPostBaseline(): Classification {
  return {
    severity: "moderate",
    routing: {
      requires_ssp_redraft: false,
      requires_poam_review: true,
      requires_document_control_review: false,
    },
    recommendation:
      "POA&M closed on a controlled control. Plan the closure into the next SSP version.",
  };
}
