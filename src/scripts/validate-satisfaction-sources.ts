#!/usr/bin/env npx tsx
/**
 * C3PAO validation: satisfaction-source bins and 4-bin partition (Pure Technical, Pure Gov, Hybrid-technical, Hybrid-governance).
 * Run: npm run validate-satisfaction-sources
 * Exits 0 if validation passes, 1 otherwise.
 */

import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { runC3PAOValidation } from "@/lib/compliance/satisfaction-sources";
import { validateControlBins } from "@/lib/compliance/control-bins";

function main(): number {
  const result = runC3PAOValidation(ALL_CONTROL_IDS);

  console.log("C3PAO Satisfaction-Source Validation\n");
  console.log("Tally:");
  console.log(`  OS (73):        ${result.tally.os}`);
  console.log(`  Cloud (12):     ${result.tally.cloud}`);
  console.log(`  Often N/A (7):  ${result.tally.oftenNotApplicable}`);
  console.log(`  Governance (18): ${result.tally.governance}`);
  console.log(`  Hybrid (31+6):  ${result.tally.hybrid}`);
  console.log(`  OS ∩ Cloud:     ${result.tally.osAndCloud} (controls in both)`);
  console.log(`  Total:          ${result.totalControls} (expected ${result.expectedTotal})`);
  console.log("");

  if (result.osCloudOverlap.length > 0) {
    console.log("OS ∩ Cloud controls:", result.osCloudOverlap.join(", "));
    console.log("");
  }

  if (result.warnings.length > 0) {
    console.log("Warnings:");
    result.warnings.forEach((w) => console.log("  -", w));
    console.log("");
  }

  if (result.errors.length > 0) {
    console.error("Errors:");
    result.errors.forEach((e) => console.error("  -", e));
    console.error("");
    console.error("Validation FAILED.");
    return 1;
  }

  console.log("Validation passed: all controls assigned, tally adds up.\n");

  const bins = validateControlBins();
  console.log("4-Bin Partition Validation");
  console.log(`  Pure Technical:    ${bins.counts.pure_technical}`);
  console.log(`  Pure Governance:   ${bins.counts.pure_governance}`);
  console.log(`  Hybrid Technical:  ${bins.counts.hybrid_technical}`);
  console.log(`  Hybrid Governance: ${bins.counts.hybrid_governance}`);
  console.log(`  Total:             ${bins.total} (expected ${bins.expected})`);
  if (bins.errors.length > 0) {
    console.error("");
    bins.errors.forEach((e) => console.error("  -", e));
    return 1;
  }
  console.log("4-bin partition OK.\n");

  return 0;
}

process.exit(main());
