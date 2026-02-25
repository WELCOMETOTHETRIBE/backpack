/**
 * Binning logic for C3PAO Control Adjudication: group controls by satisfaction type
 * (Technical, Governance/Policy, Inherited, N/A) for family × bin matrix.
 */
import { CMMC_ARTIFACT_SPECS } from "@/lib/artifact-guide";
import { getInheritedControls } from "./inherited-controls";

export type AdjudicationBin = "Technical" | "Governance/Policy" | "Inherited" | "N/A";

const FAMILY_PREFIX: Record<string, string> = {
  AC: "3.1",
  AT: "3.2",
  AU: "3.3",
  CM: "3.4",
  IA: "3.5",
  IR: "3.6",
  MA: "3.7",
  MP: "3.8",
  PS: "3.9",
  PE: "3.10",
  RA: "3.11",
  CA: "3.12",
  SC: "3.13",
  SI: "3.14",
};

export const CONTROL_FAMILY_CODES = Object.keys(FAMILY_PREFIX);
export const BIN_COLUMNS: AdjudicationBin[] = ["Technical", "Governance/Policy", "Inherited", "N/A"];

export type ControlRecordForBin = {
  id: string;
  controlId: string;
  implementationStatus: string;
  governanceNarrative?: string | null;
  responsibleRoleId?: string | null;
  roleName?: string | null;
  artifactCount?: number;
  sprs31311Condition?: string | null;
};

const specByControlId = new Map(CMMC_ARTIFACT_SPECS.map((s) => [s.controlId, s]));

/**
 * Returns the satisfaction-type bin for a control (before considering inherited/NA status).
 */
function getSatisfactionBin(controlId: string): "Technical" | "Governance/Policy" {
  const spec = specByControlId.get(controlId);
  if (!spec) return "Technical";
  if (spec.satisfactionType === "Governance-Centric") return "Governance/Policy";
  return "Technical"; // Technical-Centric and Hybrid
}

/**
 * Assigns each control record to one bin. Priority: current status (inherited/not_applicable)
 * → inherited from boundary → satisfaction type.
 */
export function assignControlToBin(
  record: ControlRecordForBin,
  inheritedControlIds: Set<string>
): AdjudicationBin {
  if (record.implementationStatus === "inherited") return "Inherited";
  if (record.implementationStatus === "not_applicable") return "N/A";
  if (inheritedControlIds.has(record.controlId)) return "Inherited";
  return getSatisfactionBin(record.controlId);
}

/**
 * Builds matrix: familyCode -> bin -> records in that cell.
 */
export function buildBinningMatrix(
  records: ControlRecordForBin[],
  boundaryProfileTechnologies: string[]
): Map<string, Map<AdjudicationBin, ControlRecordForBin[]>> {
  const inherited = getInheritedControls(boundaryProfileTechnologies);
  const inheritedSet = new Set(inherited.map((c) => c.controlId));

  const byFamily = new Map<string, Map<AdjudicationBin, ControlRecordForBin[]>>();
  for (const code of CONTROL_FAMILY_CODES) {
    byFamily.set(code, new Map(BIN_COLUMNS.map((b) => [b, []])));
  }

  const prefixToFamily: Record<string, string> = {};
  for (const [code, prefix] of Object.entries(FAMILY_PREFIX)) {
    prefixToFamily[prefix] = code;
  }

  for (const record of records) {
    const parts = record.controlId.split(".");
    const prefix = parts.length >= 2 ? `${parts[0]}.${parts[1]}` : record.controlId;
    const familyCode = prefixToFamily[prefix] ?? "AC";
    const bin = assignControlToBin(record, inheritedSet);
    const familyMap = byFamily.get(familyCode);
    if (familyMap) {
      const list = familyMap.get(bin) ?? [];
      list.push(record);
      familyMap.set(bin, list);
    }
  }

  return byFamily;
}
