/**
 * Evidence Engine scoring: control status (pass/partial/fail/na), reasons, and Evidence Confidence Score.
 * All logic is driven by control_assessment_logic artifact and register stats.
 */
import { getControlAssessmentLogic } from "@/data/cmmc";
import type { RegisterStats, LastEvidenceType } from "./control-dashboard";

export type ControlStatus = "pass" | "partial" | "fail" | "na";

export type ControlScore = {
  controlId: string;
  family: string;
  controlStatus: ControlStatus;
  reasons: string[];
  lastEvidenceDate: Date | null;
  /** Type of the most recent evidence (from register with latest entry; if tie, worst type). */
  lastEvidenceType: LastEvidenceType;
  nextDueDate: Date | null;
  /** Evidence Confidence Score: 100 = finalized + cadence met, 75 = finalized but late, 50 = draft only, 0 = no evidence. */
  confidencePercent: number;
  /** From responsibilities (DB or template). */
  responsibilityModel?: string;
  /** Banner for inherited: e.g. "Inherited evidence required (provider package)." */
  responsibilityNote?: string;
};

export type ScoringResult = {
  controls: ControlScore[];
  familyReadiness: Record<string, number>;
  overallReadiness: number;
  /** Overall excluding na (pass / (pass + partial + fail)). */
  overallReadinessExcludingNa: number;
};

/**
 * Compute Evidence Confidence Score for a single register's contribution.
 * 100% = finalized + cadence met; 75% = finalized but cadence late; 50% = draft only; 0% = no evidence.
 */
function registerConfidence(stats: RegisterStats): number {
  if (stats.hasFinalInCadence) return 100;
  if (stats.lastFinalizedAt != null) return 75; // finalized but not in cadence
  if (stats.hasAnyEntry) return 50; // draft only
  return 0;
}

/**
 * Compute control-level confidence as the minimum of its required registers' confidence
 * (weakest link), or 100 if no registers required.
 */
function controlConfidence(
  registerKeys: string[],
  statsByRegister: Map<string, RegisterStats>
): number {
  if (registerKeys.length === 0) return 100;
  let min = 100;
  for (const rk of registerKeys) {
    const s = statsByRegister.get(rk);
    const c = s ? registerConfidence(s) : 0;
    if (c < min) min = c;
  }
  return min;
}

export type ResponsibilityByControl = Map<string, { responsibilityModel: string }>;

/** Optional technical evidence from latest collector run: control_id -> status (pass/fail/warn/error/na). */
export type TechnicalResultsByControl = Map<string, { status: string }>;

/**
 * Score all controls from the assessment logic artifact using current register stats.
 * Optional responsibilitiesByControl: when azure_inherited, do not set fail solely for missing operational evidence.
 * Optional technicalResultsByControl: technical check result from latest run; fail -> control fail (unless azure_inherited), pass -> can raise confidence.
 */
export function computeScoring(
  statsByRegister: Map<string, RegisterStats>,
  options?: { responsibilitiesByControl?: ResponsibilityByControl; technicalResultsByControl?: TechnicalResultsByControl }
): ScoringResult {
  const assessmentLogic = getControlAssessmentLogic();
  const responsibilitiesByControl = options?.responsibilitiesByControl;
  const technicalResultsByControl = options?.technicalResultsByControl;
  const controls: ControlScore[] = [];
  const familyCounts: Record<string, { pass: number; partial: number; fail: number; na: number }> = {};

  for (const c of assessmentLogic.controls) {
    const registerKeys = c.register_requirements?.map((r) => r.register_id) ?? [];
    const noRegistersRequired = !c.requires_operational_evidence || registerKeys.length === 0;
    const responsibility = responsibilitiesByControl?.get(c.control_id);
    const responsibilityModel = responsibility?.responsibilityModel;
    let responsibilityNote: string | undefined;

    let controlStatus: ControlStatus = "na";
    const reasons: string[] = [];
    let lastEvidenceDate: Date | null = null;
    let nextDueDate: Date | null = null;

    let lastEvidenceType: LastEvidenceType = "none";

    if (noRegistersRequired) {
      controlStatus = "na";
      reasons.push("N/A (no operational evidence required)");
    } else {
      const requirements = c.register_requirements ?? [];
      const met: string[] = [];
      const notMet: string[] = [];

      for (const req of requirements) {
        const rk = req.register_id;
        const stats = statsByRegister.get(rk);
        const inCadence = stats?.hasFinalInCadence ?? false;
        if (stats?.lastFinalizedAt) {
          if (lastEvidenceDate == null || stats.lastFinalizedAt > lastEvidenceDate) {
            lastEvidenceDate = stats.lastFinalizedAt;
          }
          if (stats.nextDueAt && (nextDueDate == null || stats.nextDueAt < nextDueDate)) {
            nextDueDate = stats.nextDueAt;
          }
        }
        if (inCadence) met.push(rk);
        else notMet.push(rk);
      }

      const typeOrder: Record<LastEvidenceType, number> = { none: 0, void: 1, draft: 2, final: 3 };
      let maxEntryAt: Date | null = null;
      for (const rk of registerKeys) {
        const stats = statsByRegister.get(rk);
        const at = stats?.lastEntryAt ?? null;
        if (at == null) continue;
        if (maxEntryAt == null || at > maxEntryAt) {
          maxEntryAt = at;
          lastEvidenceType = stats!.lastEvidenceType;
        } else if (at.getTime() === maxEntryAt.getTime() && stats) {
          if (typeOrder[stats.lastEvidenceType] < typeOrder[lastEvidenceType]) {
            lastEvidenceType = stats.lastEvidenceType;
          }
        }
      }
      if (maxEntryAt == null && registerKeys.length > 0) lastEvidenceType = "none";

      if (notMet.length === 0) {
        controlStatus = "pass";
        reasons.push("All register requirements met in cadence.");
      } else if (met.length > 0) {
        controlStatus = "partial";
        reasons.push(`Missing evidence in cadence for: ${notMet.join(", ")}`);
      } else {
        if (responsibilityModel === "azure_inherited") {
          controlStatus = "na";
          responsibilityNote = "Inherited evidence required (provider package).";
          reasons.push(responsibilityNote);
        } else {
          controlStatus = "fail";
          reasons.push(`No evidence in cadence for required registers: ${registerKeys.join(", ")}`);
        }
      }
    }

    // Technical evidence: fail overrides to fail (unless azure_inherited); pass can raise confidence.
    const techResult = technicalResultsByControl?.get(c.control_id);
    if (techResult) {
      if (techResult.status === "fail" && responsibilityModel !== "azure_inherited") {
        controlStatus = "fail";
        reasons.push("Technical check failed (collector run).");
      } else if (techResult.status === "pass" && controlStatus !== "fail") {
        reasons.push("Technical check passed.");
      }
    }

    let confidencePercent = controlConfidence(registerKeys, statsByRegister);
    if (techResult?.status === "pass" && confidencePercent < 100) {
      confidencePercent = Math.min(100, confidencePercent + 10);
    }
    controls.push({
      controlId: c.control_id,
      family: c.family,
      controlStatus,
      reasons,
      lastEvidenceDate,
      lastEvidenceType,
      nextDueDate,
      confidencePercent,
      responsibilityModel,
      responsibilityNote,
    });

    if (!familyCounts[c.family]) {
      familyCounts[c.family] = { pass: 0, partial: 0, fail: 0, na: 0 };
    }
    familyCounts[c.family][controlStatus]++;
  }

  const familyReadiness: Record<string, number> = {};
  for (const [family, counts] of Object.entries(familyCounts)) {
    const total = counts.pass + counts.partial + counts.fail + counts.na;
    const scored = counts.pass + counts.partial + counts.fail;
    familyReadiness[family] = total === 0 ? 0 : Math.round((counts.pass / (scored || total)) * 100);
  }

  const totalControls = controls.length;
  const passCount = controls.filter((x) => x.controlStatus === "pass").length;
  const naCount = controls.filter((x) => x.controlStatus === "na").length;
  const scoredCount = totalControls - naCount;
  const overallReadiness = totalControls === 0 ? 0 : Math.round((passCount / totalControls) * 100);
  const overallReadinessExcludingNa = scoredCount === 0 ? 0 : Math.round((passCount / scoredCount) * 100);

  return {
    controls,
    familyReadiness,
    overallReadiness,
    overallReadinessExcludingNa,
  };
}
