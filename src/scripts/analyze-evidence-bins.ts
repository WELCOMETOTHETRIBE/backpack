/**
 * Evidence-bin gap analysis. For each of the 110 NIST SP 800-171 Rev. 2
 * controls, determines whether it's covered by ANY of:
 *
 *   1. Azure evidence       (cloud / FedRAMP-inherited)
 *   2. OS evidence          (Windows Server enclave baseline manifest)
 *   3. ISSO audit package   (EnclaveWatch weekly export handlers)
 *   4. Doc Control export   (QMS governance manifest, pure-gov + hybrid-gov)
 *   5. TrainOS export       (AT + IR + RA-3.11.1 + CA modules per data sheet)
 *
 * Reports the controls falling OUTSIDE all five bins — the gap surface
 * needing a different evidence source.
 *
 * Pure file-based; no DB needed. Run with: npx tsx
 * src/scripts/analyze-evidence-bins.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { AZURE_INHERITED_3_10_CONTROL_IDS } from "@/lib/compliance/azure-inherited-controls";
import { AZURE_ENTRA_15_CONTROL_IDS } from "@/lib/compliance/azure-entra-controls";
import {
  PURE_GOV_CONTROL_IDS,
  HYBRID_GOV_CONTROL_IDS,
} from "@/lib/governance/seed-data";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";

// ── Bin 1: Azure evidence ────────────────────────────────────────────
//   AZURE_INHERITED_3_10 (4 strict-inherited PE controls) +
//   CUSTOMER_ATTESTED_INHERITED (3.10.3, 3.10.6) +
//   AZURE_ENTRA_15 (15 Azure-validated controls).
const AZURE_BIN = new Set<string>([
  ...AZURE_INHERITED_3_10_CONTROL_IDS,
  "3.10.3",
  "3.10.6",
  ...AZURE_ENTRA_15_CONTROL_IDS,
]);

// ── Bin 2: OS evidence ───────────────────────────────────────────────
//   ENCLAVE_73_NIST_IDS — read directly from the manifest so the count
//   stays canonical (currently 73).
async function loadOsBin(): Promise<Set<string>> {
  const filePath = path.join(
    process.cwd(),
    "src",
    "data",
    "os-evidence-nist-manifest.json",
  );
  const raw = await fs.readFile(filePath, "utf8");
  const data = JSON.parse(raw) as {
    controls: Array<{ nist_req: string }>;
  };
  return new Set(data.controls.map((c) => c.nist_req));
}

// ── Bin 3: ISSO audit package ────────────────────────────────────────
//   Reverse-mapped from src/lib/evidence-engine/isso-export/handlers/*.ts
//   JSDoc + literal refs. Each weekly-review payload covers the controls
//   below.
const ISSO_BIN = new Set<string>([
  // access-authorizations
  "3.1.5",
  "3.1.6",
  "3.5.1",
  "3.10.6",
  // assessment-findings
  "3.12.1",
  // audit-log-review
  "3.1.7",
  "3.3.2",
  "3.3.3",
  "3.3.5",
  "3.12.3",
  "3.14.3",
  "3.14.7",
  // change-drift-log
  "3.4.1",
  "3.4.2",
  "3.4.3",
  // control-freshness
  // (only references 3.1.7, already covered)
  // incident-log
  "3.6.1",
  "3.6.2",
  // maintenance-log
  "3.7.1",
  "3.7.2",
  "3.7.5",
  // media-handling-log
  "3.8.1",
  "3.8.2",
  "3.8.3",
  "3.8.6",
  "3.8.7",
  "3.8.9",
  // personnel-screening
  "3.9.1",
  "3.9.2",
  // policy-review
  "3.12.4",
  // training-completion
  "3.2.1",
  "3.2.2",
  "3.2.3",
  // vuln-remediation
  "3.4.4",
  "3.11.2",
  "3.11.3",
  "3.14.1",
]);

// ── Bin 4: Doc Control export (QMS) ──────────────────────────────────
//   Pure-governance + Hybrid-governance per src/lib/governance/seed-data.ts.
//   Both feed the QMS manifest's controls_mapped fields.
const DOCCONTROL_BIN = new Set<string>([
  ...PURE_GOV_CONTROL_IDS,
  ...HYBRID_GOV_CONTROL_IDS,
]);

// ── Bin 5: TrainOS export ────────────────────────────────────────────
//   Per the MacTech Training data sheet:
//     AT-001 + AT-002 → AT.L2-3.2.1, 3.2.2, 3.2.3
//     IR Tabletop     → IR.L2-3.6.1, 3.6.2, 3.6.3
//     Annual RA       → RA.L2-3.11.1
//     CA-001          → CA.L2-3.12.1, 3.12.2, 3.12.3, 3.12.4
const TRAINOS_BIN = new Set<string>([
  "3.2.1",
  "3.2.2",
  "3.2.3",
  "3.6.1",
  "3.6.2",
  "3.6.3",
  "3.11.1",
  "3.12.1",
  "3.12.2",
  "3.12.3",
  "3.12.4",
]);

async function main() {
  const osBin = await loadOsBin();

  const logic = getControlAssessmentLogic();
  const allControls = logic.controls.map((c) => c.control_id).sort(cmp);

  type CoverageRow = {
    controlId: string;
    family: string;
    azure: boolean;
    os: boolean;
    isso: boolean;
    docControl: boolean;
    trainos: boolean;
    binsHit: number;
  };

  const rows: CoverageRow[] = allControls.map((cid) => {
    const azure = AZURE_BIN.has(cid);
    const os = osBin.has(cid);
    const isso = ISSO_BIN.has(cid);
    const docControl = DOCCONTROL_BIN.has(cid);
    const trainos = TRAINOS_BIN.has(cid);
    return {
      controlId: cid,
      family: cid.split(".").slice(0, 2).join("."),
      azure,
      os,
      isso,
      docControl,
      trainos,
      binsHit:
        Number(azure) + Number(os) + Number(isso) + Number(docControl) + Number(trainos),
    };
  });

  const uncovered = rows.filter((r) => r.binsHit === 0);
  const covered = rows.filter((r) => r.binsHit > 0);

  console.log("══════════════════════════════════════════════════════════════");
  console.log("Evidence-bin coverage analysis — 110 NIST SP 800-171 Rev. 2 controls");
  console.log("══════════════════════════════════════════════════════════════\n");

  console.log(`Total controls:         ${rows.length}`);
  console.log(`Covered by ≥1 bin:      ${covered.length}`);
  console.log(`Uncovered (gap):        ${uncovered.length}\n`);

  console.log("Per-bin counts:");
  console.log(`  Azure:        ${rows.filter((r) => r.azure).length}`);
  console.log(`  OS:           ${rows.filter((r) => r.os).length}`);
  console.log(`  ISSO:         ${rows.filter((r) => r.isso).length}`);
  console.log(`  Doc Control:  ${rows.filter((r) => r.docControl).length}`);
  console.log(`  TrainOS:      ${rows.filter((r) => r.trainos).length}\n`);

  if (uncovered.length === 0) {
    console.log("✓ Every control is covered by at least one bin.");
  } else {
    console.log(
      `Controls falling OUTSIDE all 5 bins (${uncovered.length}):`,
    );
    console.log(
      "─────────────────────────────────────────────────────────────",
    );
    const byFamily = new Map<string, string[]>();
    for (const r of uncovered) {
      const arr = byFamily.get(r.family) ?? [];
      arr.push(r.controlId);
      byFamily.set(r.family, arr);
    }
    for (const [family, ids] of [...byFamily.entries()].sort()) {
      console.log(`  ${family}: ${ids.join(", ")}`);
    }
  }

  // Sanity: count single-bin coverage (controls covered by exactly one
  // bin — those are fragile; a gap in that single bin = audit risk).
  const fragile = rows.filter((r) => r.binsHit === 1);
  if (fragile.length > 0) {
    console.log(
      `\nFragile controls (covered by exactly ONE bin) — ${fragile.length}:`,
    );
    console.log(
      "─────────────────────────────────────────────────────────────",
    );
    for (const r of fragile) {
      const which = [
        r.azure && "Azure",
        r.os && "OS",
        r.isso && "ISSO",
        r.docControl && "Doc Control",
        r.trainos && "TrainOS",
      ]
        .filter(Boolean)
        .join("");
      console.log(`  ${r.controlId.padEnd(8)} via ${which}`);
    }
  }
}

function cmp(a: string, b: string): number {
  const aa = a.split(".").map(Number);
  const bb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const av = aa[i] ?? 0;
    const bv = bb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
