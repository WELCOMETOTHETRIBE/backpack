#!/usr/bin/env npx tsx
/**
 * C3PAO validation: satisfaction-source bins (73 OS, 12 Cloud, 7 N/A, rest Governance).
 * Run: npm run validate-satisfaction-sources
 * Exits 0 if validation passes, 1 otherwise.
 */

import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { runC3PAOValidation } from "@/lib/compliance/satisfaction-sources";

function main(): number {
  const result = runC3PAOValidation(ALL_CONTROL_IDS);

  console.log("C3PAO Satisfaction-Source Validation\n");
  console.log("Tally:");
  console.log(`  OS (73):        ${result.tally.os}`);
  console.log(`  Cloud (12):     ${result.tally.cloud}`);
  console.log(`  N/A (7):        ${result.tally.na}`);
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

  console.log("Validation passed: all controls assigned, tally adds up.");
  return 0;
}

process.exit(main());
