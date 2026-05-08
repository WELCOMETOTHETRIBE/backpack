import assessmentLogicJson from "./control_assessment_logic.v1.json";
import type { ControlAssessmentLogic } from "./types";

const assessmentLogic = assessmentLogicJson as ControlAssessmentLogic;

/**
 * Returns the control assessment logic artifact (110 controls, register requirements, scoring).
 * Use for scoring pass/partial/fail/na and Evidence Confidence Score.
 */
export function getControlAssessmentLogic(): ControlAssessmentLogic {
  return assessmentLogic;
}

export { assessmentLogic };
