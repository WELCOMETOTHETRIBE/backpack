/**
 * Generates CMMC / NIST master control CSV for platform governance, evidence routing,
 * and C3PAO-facing exports. Sources are authoritative in-repo.
 *
 * Run: npx tsx src/scripts/generate-cmmc-control-master-csv.ts
 * Output: docs/CMMC_NIST_Control_Master_v1.csv
 */

import * as fs from "fs";
import * as path from "path";

import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { getControlBin, isHybridControl } from "@/lib/compliance/control-bins";
import { AZURE_INHERITED_3_10_CONTROL_IDS } from "@/lib/compliance/azure-inherited-controls";
import { AZURE_ENTRA_7_CONTROL_IDS } from "@/lib/compliance/azure-entra-controls";
import manifestJson from "@/data/os-evidence-nist-manifest.json";
import registerMapJson from "@/data/cmmc/cmmc_l2_register_evidence_map.v1.json";
import titlesJson from "@/data/cmmc/nist_sp_800_171_control_titles.json";
import {
  CONTROL_INTELLIGENCE,
  type ControlIntelligence,
  type EvidenceLane,
} from "@/data/cmmc/control-intelligence";
import { LIKELY_NA_CONTROL_IDS } from "@/lib/compliance/likely-na-controls";
import { sprsScoringData } from "@/lib/sprs/sprs_scoring_data";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "docs", "CMMC_NIST_Control_Master_v1.csv");

const FAMILY_CODE_BY_PREFIX: Record<string, string> = {
  "3.1": "AC",
  "3.2": "AT",
  "3.3": "AU",
  "3.4": "CM",
  "3.5": "IA",
  "3.6": "IR",
  "3.7": "MA",
  "3.8": "MP",
  "3.9": "PS",
  "3.10": "PE",
  "3.11": "RA",
  "3.12": "CA",
  "3.13": "SC",
  "3.14": "SI",
};

const FAMILY_FULL: Record<string, string> = {
  AC: "Access Control",
  AT: "Awareness and Training",
  AU: "Audit and Accountability",
  CM: "Configuration Management",
  IA: "Identification and Authentication",
  IR: "Incident Response",
  MA: "Maintenance",
  MP: "Media Protection",
  PS: "Personnel Security",
  PE: "Physical Protection",
  RA: "Risk Assessment",
  CA: "Security Assessment",
  SC: "System and Communications Protection",
  SI: "System and Information Integrity",
};

function familyCodeFromNistId(id: string): string {
  const parts = id.split(".");
  const prefix = `${parts[0]}.${parts[1]}`;
  return FAMILY_CODE_BY_PREFIX[prefix] ?? "UNK";
}

function cmmcL2ControlId(nistId: string): string {
  const fc = familyCodeFromNistId(nistId);
  return `${fc}.L2-${nistId}`;
}

const osByNist = new Map<
  string,
  { support_level: string; evidence_files: string[]; cmmc_control_id?: string }
>();
for (const c of (manifestJson as { controls: Array<Record<string, unknown>> }).controls) {
  const nr = c.nist_req as string;
  osByNist.set(nr, {
    support_level: c.support_level as string,
    evidence_files: c.evidence_files as string[],
    cmmc_control_id: c.control_id as string | undefined,
  });
}

const intelById = new Map<string, ControlIntelligence>();
for (const row of CONTROL_INTELLIGENCE) {
  intelById.set(row.controlId, row);
}

const sprsById = new Map<string, { value: number; family: string }>();
for (const s of sprsScoringData) {
  sprsById.set(s.id, { value: s.value, family: s.family });
}

const registerList = (
  registerMapJson as {
    registers: Array<{ id: string; name: string; cadence_hint: string | null }>;
    controls: Array<{
      control_id: string;
      family: string;
      registers: string[];
      operational_evidence: { register_entries_required: boolean; cadence_hint: string | null };
      notes?: string;
    }>;
  }
).registers;

const registerCadenceById = new Map<string, string>();
for (const r of registerList) {
  registerCadenceById.set(r.id, r.cadence_hint ?? "");
}

const registersByControl = new Map<
  string,
  { registers: string[]; register_entries_required: boolean; notes: string }
>();
for (const c of (
  registerMapJson as {
    controls: Array<{
      control_id: string;
      registers: string[];
      operational_evidence: { register_entries_required: boolean };
      notes?: string;
    }>;
  }
).controls) {
  registersByControl.set(c.control_id, {
    registers: c.registers ?? [],
    register_entries_required: c.operational_evidence?.register_entries_required ?? false,
    notes: c.notes ?? "",
  });
}

const pe = new Set(AZURE_INHERITED_3_10_CONTROL_IDS as readonly string[]);
const ent7 = new Set(AZURE_ENTRA_7_CONTROL_IDS);
const likelyNa = new Set(LIKELY_NA_CONTROL_IDS as readonly string[]);

const titles = titlesJson as Record<string, string>;

function csvEscape(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("\r")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function laneHuman(lanes: EvidenceLane[]): string {
  return lanes
    .map((l) => {
      if (l === "lane_1_technical") return "OS_collector";
      if (l === "lane_2_azure") return "Azure_Gov_FedRAMP_or_Entra";
      if (l === "lane_3_governance") return "Governance_manifest";
      return l;
    })
    .join("|");
}

function buildValidationProfiles(args: {
  osLane: boolean;
  pe: boolean;
  ent7: boolean;
  regRequired: boolean;
  governanceHeavy: boolean;
}): { codes: string; summary: string } {
  const codes: string[] = [];
  if (args.osLane) codes.push("V");
  if (args.ent7) codes.push("Z");
  if (args.pe) codes.push("C");
  if (args.governanceHeavy) codes.push("D");
  if (args.regRequired) codes.push("E");
  const parts: string[] = [];
  if (args.osLane) parts.push("Windows collector + validator (event-driven; schedule per org)");
  if (args.ent7) parts.push("Azure CLI / Entra export (export_azure_evidence.sh; monthly + on change)");
  if (args.pe) parts.push("FedRAMP physical inheritance (3.10.1–3.10.5)");
  if (args.governanceHeavy) parts.push("Policies / procedures / SSP governance (policy_review register)");
  if (args.regRequired) parts.push("Operational registers per cadence_hint in cmmc_l2_register_evidence_map");
  return { codes: codes.join("+"), summary: parts.join(" · ") };
}

function main(): void {
  const header = [
    "nist_control_id",
    "cmmc_l2_control_id",
    "nist_family_code",
    "nist_family_full_name",
    "control_title",
    "sprs_weight_1_3_5",
    "sprs_family_per_dod_table",
    "control_bin_pure_technical_pure_governance_hybrid_technical_hybrid_governance",
    "is_hybrid_bin_yes_no",
    "likely_na_boundary_questionnaire_yes_no",
    "os_evidence_lane_collect_cui_evidence_v2_yes_no",
    "os_support_level_STRONG_PARTIAL_na",
    "os_evidence_files_pipe_separated",
    "os_collector_note",
    "azure_fedramp_pe_inheritance_lane_3_10_1_to_3_10_5_yes_no",
    "azure_entra_seven_ui_lane_yes_no",
    "cloud_lane_classification",
    "governance_document_emphasis_heavy_or_ssp_reference",
    "operational_register_ids_pipe_separated",
    "operational_register_entries_required_yes_no",
    "operational_register_cadence_hints_semicolon_separated",
    "intelligence_disposition",
    "intelligence_evidence_lanes_pipe",
    "intelligence_cadence_type",
    "intelligence_policy_doc_required_yes_no",
    "intelligence_register_required_yes_no",
    "intelligence_register_schema_id",
    "intelligence_c3pao_examiner_note",
    "intelligence_conmon_trigger",
    "intelligence_na_rationale",
    "validation_profile_codes_V_Z_C_D_E",
    "validation_summary_for_cmm_c_platform",
    "source_notes",
  ];

  const rows: string[] = [header.join(",")];

  for (const id of ALL_CONTROL_IDS) {
    const fc = familyCodeFromNistId(id);
    const title = titles[id] ?? "";
    const os = osByNist.get(id);
    const osY = !!os;
    const osFiles = os?.evidence_files ?? [];
    const sp = sprsById.get(id);
    const bin = getControlBin(id);
    const hybrid = isHybridControl(id) ? "yes" : "no";
    const pureTech = bin === "pure_technical" ? "yes" : "no";
    const govEmphasis = bin === "pure_technical" ? "ssp_reference_primary" : "governance_package_heavy";

    const peInh = pe.has(id);
    const ent7lane = ent7.has(id);
    let cloudClass = "none";
    if (peInh && ent7lane) cloudClass = "fedramp_pe_and_entra_7";
    else if (peInh) cloudClass = "fedramp_pe_inheritance_only";
    else if (ent7lane) cloudClass = "azure_entra_7_only";

    const regEntry = registersByControl.get(id);
    const regIds = regEntry?.registers.join("|") ?? "";
    const regReq = regEntry?.register_entries_required === true ? "yes" : "no";
    const hints =
      regEntry?.registers
        .map((k) => `${k}=${registerCadenceById.get(k) ?? ""}`)
        .filter((s) => !s.endsWith("="))
        .join("; ") ?? "";

    const intel = intelById.get(id);
    const gi = intel
      ? laneHuman(intel.evidenceLanes)
      : "";
    const examiner = intel?.c3paoExaminerNote?.replace(/\r?\n/g, " ") ?? "";
    const conmon = intel?.conmonTrigger?.replace(/\r?\n/g, " ") ?? "";
    const naRat = intel?.naRationale?.replace(/\r?\n/g, " ") ?? "";

    const { codes: valCodes, summary: valSum } = buildValidationProfiles({
      osLane: osY,
      pe: peInh,
      ent7: ent7lane,
      regRequired: regEntry?.register_entries_required === true,
      governanceHeavy: bin !== "pure_technical",
    });

    const sourceNotes = [
      "control_bin: control-bins.ts",
      osY ? "os: os-evidence-nist-manifest.json" : "",
      "registers: cmmc_l2_register_evidence_map.v1.json",
      "intel: control-intelligence.ts",
      "titles: src/data/cmmc/nist_sp_800_171_control_titles.json + vault lineage",
    ]
      .filter(Boolean)
      .join("; ");

    const osNote = osY
      ? "Collect-Cui-Evidence-v2.ps1 bundle paths; validate_windows_server_hardening.py for OS 73 manifest alignment"
      : "Not in enclave OS manifest (37 controls) — use other lanes";

    const line = [
      csvEscape(id),
      csvEscape(cmmcL2ControlId(id)),
      csvEscape(fc),
      csvEscape(FAMILY_FULL[fc] ?? ""),
      csvEscape(title),
      sp ? String(sp.value) : "",
      csvEscape(sp?.family ?? ""),
      csvEscape(bin),
      hybrid,
      likelyNa.has(id) ? "yes" : "no",
      osY ? "yes" : "no",
      csvEscape(osY ? os!.support_level : "n/a"),
      csvEscape(osFiles.join("|")),
      csvEscape(osNote),
      peInh ? "yes" : "no",
      ent7lane ? "yes" : "no",
      csvEscape(cloudClass),
      csvEscape(govEmphasis),
      csvEscape(regIds),
      regReq,
      csvEscape(hints),
      csvEscape(intel?.disposition ?? ""),
      csvEscape(gi),
      csvEscape(intel?.cadenceType ?? ""),
      intel?.policyDocRequired === true ? "yes" : intel ? "no" : "",
      intel?.registerRequired === true ? "yes" : intel ? "no" : "",
      csvEscape(intel?.registerSchemaId ?? ""),
      csvEscape(examiner),
      csvEscape(conmon),
      csvEscape(naRat),
      csvEscape(valCodes),
      csvEscape(valSum),
      csvEscape(sourceNotes),
    ];

    rows.push(line.join(","));
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, rows.join("\n") + "\n", "utf-8");
  console.log(`Wrote ${ALL_CONTROL_IDS.length} rows to ${OUT}`);
}

main();
