// Live audit of the 110-control partition — reads the actual code state.
// Run: npx tsx src/scripts/partition-audit.mts
import { ALL_CONTROL_IDS } from "../lib/artifact-guide";
import {
  ENCLAVE_73_NIST_IDS,
  ENCLAVE_OS_PARTIAL_31_NIST_IDS,
} from "../lib/compliance/os-evidence-manifest";
import { AZURE_INHERITED_3_10_CONTROL_IDS } from "../lib/compliance/azure-inherited-controls";
import { AZURE_ENTRA_15_CONTROL_IDS } from "../lib/compliance/azure-entra-controls";
import {
  CUSTOMER_ATTESTED_INHERITED,
  OUTSTANDING_36_CONTROL_IDS,
  OUTSTANDING_CLOSE_PATHS,
} from "../lib/compliance/outstanding-controls";
import { LIKELY_NA_CONTROL_IDS } from "../lib/compliance/likely-na-controls";
import { PURE_GOV_CONTROL_IDS } from "../lib/governance/seed-data";

// Widen all set element types to plain `string` so .has(id) accepts the
// generic ALL_CONTROL_IDS items (some constant lists use `as const` with
// narrow literal types that would otherwise reject lookups).
const OS_73 = new Set<string>(ENCLAVE_73_NIST_IDS);
const _OS_PARTIAL = new Set<string>(ENCLAVE_OS_PARTIAL_31_NIST_IDS);
const STRICT_INHERIT = new Set<string>(AZURE_INHERITED_3_10_CONTROL_IDS);
const CUST_ATTEST = new Set<string>(CUSTOMER_ATTESTED_INHERITED.map((c) => c.controlId));
const AZURE = new Set<string>(AZURE_ENTRA_15_CONTROL_IDS);
const NA = new Set<string>(LIKELY_NA_CONTROL_IDS);
const PURE_GOV = new Set<string>(PURE_GOV_CONTROL_IDS);
const OUTSTANDING = new Set<string>(OUTSTANDING_36_CONTROL_IDS);

const bins: Record<string, string[]> = {
  "1. Strict inherited (Azure FedRAMP)": [],
  "2. Customer-attested-inherited":     [],
  "3. Architecture-static N/A":         [],
  "4. Pure Governance (policy/SOP)":    [],
  "5. Both OS + Azure validated (DiD)": [],
  "6. OS-only validated":               [],
  "7. Azure-only validated":            [],
  "8. Wizard-managed (register/attestation/training)": [],
  "9. Truly uncategorized":             [],
};

for (const id of ALL_CONTROL_IDS) {
  if (STRICT_INHERIT.has(id))                 { bins["1. Strict inherited (Azure FedRAMP)"].push(id); continue; }
  if (CUST_ATTEST.has(id))                    { bins["2. Customer-attested-inherited"].push(id); continue; }
  if (NA.has(id))                             { bins["3. Architecture-static N/A"].push(id); continue; }
  if (PURE_GOV.has(id))                       { bins["4. Pure Governance (policy/SOP)"].push(id); continue; }
  if (OS_73.has(id) && AZURE.has(id))         { bins["5. Both OS + Azure validated (DiD)"].push(id); continue; }
  if (OS_73.has(id))                          { bins["6. OS-only validated"].push(id); continue; }
  if (AZURE.has(id))                          { bins["7. Azure-only validated"].push(id); continue; }
  if (OUTSTANDING.has(id))                    { bins["8. Wizard-managed (register/attestation/training)"].push(id); continue; }
  bins["9. Truly uncategorized"].push(id);
}

let total = 0;
console.log("\n=== HONEST 110-CONTROL PARTITION (live, post-commit) ===\n");
for (const [name, ids] of Object.entries(bins)) {
  const inline = ids.length <= 12 ? `   [${ids.join(", ")}]` : "";
  console.log(`${name.padEnd(58)} ${String(ids.length).padStart(3)}${inline}`);
  total += ids.length;
}
console.log("─".repeat(70));
console.log(`TOTAL${" ".repeat(53)} ${String(total).padStart(3)}`);

// Bucket breakdown of bin 8 (OUTSTANDING_CLOSE_PATHS is a Map)
const buckets: Record<string, string[]> = { A: [], B: [], C: [], D: [], E: [] };
for (const id of bins["8. Wizard-managed (register/attestation/training)"]) {
  const path = OUTSTANDING_CLOSE_PATHS.get(id);
  if (path && buckets[path.bucket]) buckets[path.bucket].push(id);
}
console.log("\nBin 8 close-path buckets (Outstanding Wizard):");
console.log(`  A (training+IR):       ${buckets.A.length}  [${buckets.A.join(", ")}]`);
console.log(`  B (register entries):  ${buckets.B.length}  [${buckets.B.join(", ")}]`);
console.log(`  C (sign-off):          ${buckets.C.length}  [${buckets.C.join(", ")}]`);
console.log(`  D (training course):   ${buckets.D.length}  [${buckets.D.join(", ")}]`);
console.log(`  E (N/A attestation):   ${buckets.E.length}  [${buckets.E.join(", ")}]`);

// Show bucket totals across the FULL Outstanding 36 (what the wizard surfaces)
const allBuckets: Record<string, string[]> = { A: [], B: [], C: [], D: [], E: [] };
for (const [id, path] of OUTSTANDING_CLOSE_PATHS) {
  if (allBuckets[path.bucket]) allBuckets[path.bucket].push(id);
}
console.log("\nFull Outstanding-36 bucket totals (Outstanding Wizard surface):");
console.log(`  A (training+IR):       ${allBuckets.A.length}`);
console.log(`  B (register entries):  ${allBuckets.B.length}`);
console.log(`  C (sign-off):          ${allBuckets.C.length}`);
console.log(`  D (training course):   ${allBuckets.D.length}`);
console.log(`  E (N/A attestation):   ${allBuckets.E.length}`);
console.log(`  TOTAL:                 ${OUTSTANDING_CLOSE_PATHS.size}`);

console.log("\nDisjointness check:");
const all = new Set<string>();
let overlap = 0;
for (const ids of Object.values(bins)) for (const id of ids) {
  if (all.has(id)) { console.log(`  OVERLAP: ${id}`); overlap++; }
  all.add(id);
}
console.log(`  ${overlap === 0 ? "OK — every control assigned to exactly one bin" : `${overlap} overlaps`}`);
console.log(`  Total distinct: ${all.size}`);
