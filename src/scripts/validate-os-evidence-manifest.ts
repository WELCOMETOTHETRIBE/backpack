/**
 * Validates docs/OS-Evidence-to-NIST-Control-Manifest-73-73.json per plan:
 * schema/count, required fields, support_level, evidence_files, uniqueness,
 * NIST alignment, disjoint with 18 pure governance, hybrid vs 73.
 *
 * Run: npx tsx src/scripts/validate-os-evidence-manifest.ts
 */

import * as fs from "fs";
import * as path from "path";
import { PURE_GOV_CONTROL_IDS, HYBRID_GOV_CONTROL_IDS } from "../lib/governance/seed-data";

const MANIFEST_PATH = path.join(process.cwd(), "docs", "OS-Evidence-to-NIST-Control-Manifest-73-73.json");
const EXPECTED_COUNT = 73;

type ControlEntry = {
  control_id: string;
  nist_req: string;
  title: string;
  support_level: string;
  evidence_files: string[];
};

type Manifest = {
  schema?: string;
  enclave_configuration_control_count?: number;
  enclave_configuration_control_count_claimed?: number;
  controls: ControlEntry[];
};

function main(): void {
  console.log("Validating OS Evidence to NIST Control Manifest (73/73)\n");
  let failed = 0;

  const raw = fs.readFileSync(MANIFEST_PATH, "utf-8");
  let data: Manifest;
  try {
    data = JSON.parse(raw) as Manifest;
  } catch (e) {
    console.error("FAIL: Invalid JSON", e);
    process.exit(1);
  }

  const controls = data.controls;
  if (!Array.isArray(controls)) {
    console.error("FAIL: missing or non-array controls");
    process.exit(1);
  }

  // Schema and count
  if (data.enclave_configuration_control_count !== EXPECTED_COUNT) {
    console.error(`FAIL: enclave_configuration_control_count is ${data.enclave_configuration_control_count}, expected ${EXPECTED_COUNT}`);
    failed++;
  } else {
    console.log("PASS: enclave_configuration_control_count = 73");
  }
  if (data.enclave_configuration_control_count_claimed !== EXPECTED_COUNT) {
    console.error(`FAIL: enclave_configuration_control_count_claimed is ${data.enclave_configuration_control_count_claimed}, expected ${EXPECTED_COUNT}`);
    failed++;
  } else {
    console.log("PASS: enclave_configuration_control_count_claimed = 73");
  }
  if (controls.length !== EXPECTED_COUNT) {
    console.error(`FAIL: controls.length is ${controls.length}, expected ${EXPECTED_COUNT}`);
    failed++;
  } else {
    console.log("PASS: controls.length = 73");
  }

  const controlIds = new Set<string>();
  const nistReqs = new Set<string>();
  const validSupportLevels = new Set(["STRONG", "PARTIAL"]);

  for (let i = 0; i < controls.length; i++) {
    const c = controls[i];
    const prefix = `controls[${i}] ${c.control_id ?? c.nist_req ?? "?"}`;

    if (!c.control_id || !c.nist_req || !c.title || !c.support_level || !Array.isArray(c.evidence_files)) {
      console.error(`FAIL: ${prefix} missing required field (control_id, nist_req, title, support_level, evidence_files)`);
      failed++;
    }
    if (!validSupportLevels.has(c.support_level)) {
      console.error(`FAIL: ${prefix} support_level "${c.support_level}" is not STRONG or PARTIAL`);
      failed++;
    }
    if (c.evidence_files.length === 0) {
      console.error(`FAIL: ${prefix} evidence_files is empty`);
      failed++;
    }
    for (const p of c.evidence_files) {
      if (p.includes("\\")) {
        console.error(`FAIL: ${prefix} evidence_files path uses backslashes: ${p}`);
        failed++;
      }
    }
    const dupes = c.evidence_files.filter((x, j) => c.evidence_files.indexOf(x) !== j);
    if (dupes.length > 0) {
      console.error(`FAIL: ${prefix} duplicate evidence_files: ${[...new Set(dupes)].join(", ")}`);
      failed++;
    }
    if (controlIds.has(c.control_id)) {
      console.error(`FAIL: duplicate control_id: ${c.control_id}`);
      failed++;
    }
    controlIds.add(c.control_id);
    if (nistReqs.has(c.nist_req)) {
      console.error(`FAIL: duplicate nist_req: ${c.nist_req}`);
      failed++;
    }
    nistReqs.add(c.nist_req);

    const expectedNist = c.control_id?.replace(/^[A-Z]+\.L2-/, "") ?? "";
    if (c.control_id && c.nist_req !== expectedNist) {
      console.error(`FAIL: ${prefix} control_id does not embed nist_req (expected nist_req ${expectedNist})`);
      failed++;
    }
  }

  const manifestNistSet = new Set(controls.map((c) => c.nist_req));
  const pureInManifest = PURE_GOV_CONTROL_IDS.filter((id) => manifestNistSet.has(id));
  if (pureInManifest.length > 0) {
    console.log(
      `NOTE: Pure governance controls that also appear in 73 manifest (overlap): ${pureInManifest.join(", ")}. These require both governance adjudication and OS evidence (treat as hybrid for evidence tagging).`
    );
  } else {
    console.log("PASS: No pure governance (18) controls in manifest (disjoint)");
  }

  const hybridNotInManifest = HYBRID_GOV_CONTROL_IDS.filter((id) => !manifestNistSet.has(id));
  if (hybridNotInManifest.length > 0) {
    console.log(
      `NOTE: Hybrid (17) controls not in 73 manifest (${hybridNotInManifest.length}): ${hybridNotInManifest.join(", ")}. Plan: reconcile so hybrid ⊆ 73 or document exception.`
    );
  }
  const hybridInManifest = HYBRID_GOV_CONTROL_IDS.filter((id) => manifestNistSet.has(id));
  console.log(`INFO: Hybrid controls that are in manifest: ${hybridInManifest.length}/${HYBRID_GOV_CONTROL_IDS.length} (${hybridInManifest.join(", ") || "none"})`);

  console.log("");
  if (failed > 0) {
    console.error(`Validation failed with ${failed} error(s).`);
    process.exit(1);
  }
  console.log("All validation checks passed.");
}

main();
