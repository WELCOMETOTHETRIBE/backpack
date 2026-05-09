/**
 * Phase D — attestation→evidence elevation audit.
 *
 * Produces a per-control audit table answering the customer's
 * directive: "how many other controls can we augment through
 * automated means (or ISSO-weekly)?"
 *
 * Per control, classifies:
 *   - today's evidence path (what met_via is invoked + which pipelines
 *     are feeding the current snapshot)
 *   - achievable evidence path (what could feed it with existing or
 *     adjacent pipelines)
 *   - migration effort (wired / small / medium / large / blocker)
 *   - rationale (brief one-liner)
 *
 * Output: docs/SSP-evidence-elevation-table.md plus a structured
 * docs/SSP-evidence-elevation-table.json that downstream tooling can
 * consume.
 *
 * Usage:
 *   npx tsx src/scripts/phase-d-audit.ts [--org=<slug-or-uuid>]
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getControlStatesForOrg } from "@/lib/canonical-state/get-control-state";

interface AuditRow {
  controlId: string;
  family: string;
  currentMetVia: string;
  currentFinding: string;
  achievablePath: string;
  pipeline: string;
  effort: "wired" | "small" | "medium" | "large" | "blocker";
  rationale: string;
}

/**
 * Family-driven heuristics for what pipeline can elevate which
 * control family. Grounded in MacTech's actual deployed pipelines:
 *
 *   AC (3.1.x)  — Active Directory + Entra ID + OS validators (vault
 *                 evidence collector). Many already MET via evidence.
 *   AT (3.2.x)  — TrainOS bundle pull (training records).
 *   AU (3.3.x)  — Vault audit-event ingest into Codex (already wired
 *                 for some sub-controls).
 *   CM (3.4.x)  — QMS document digest + change-drift register.
 *   IA (3.5.x)  — Entra ID + Azure validators (mostly evidence-MET).
 *   IR (3.6.x)  — IR tabletop bundles (wired end-to-end).
 *   MA (3.7.x)  — Mix: physical maintenance is mostly attestation;
 *                 nonlocal maintenance benefits from Bastion/MFA
 *                 evidence.
 *   MP (3.8.x)  — Mostly attestation + media disposition register.
 *                 Portable storage encryption testable via OS evidence.
 *   PS (3.9.x)  — HR procedure attestation. Limited automation
 *                 surface (background checks etc.).
 *   PE (3.10.x) — Azure FedRAMP High inheritance (ESP elevator).
 *                 Several customer-attested-inherited.
 *   RA (3.11.x) — TrainOS RA wizard + Defender VM. RA bridge wired.
 *   CA (3.12.x) — TrainOS CA cycle bundle + OIS narratives. CA bundle
 *                 mirror to Codex pending.
 *   SC (3.13.x) — OS validators + Azure crypto stack + boundary
 *                 components. Mostly evidence-MET.
 *   SI (3.14.x) — Vault vuln remediation register + Defender alerts +
 *                 OS validators. Mostly evidence-MET.
 */
const FAMILY_PROFILES: Record<
  string,
  {
    pipeline: string;
    effort: "wired" | "small" | "medium" | "large" | "blocker";
    achievablePath: string;
  }
> = {
  AC: {
    pipeline: "OS evidence collector (AD/Entra/local accounts) + register",
    effort: "wired",
    achievablePath: "evidence (technical) + governance register",
  },
  AT: {
    pipeline: "TrainOS training-record bundle pull",
    effort: "small",
    achievablePath: "evidence (TrainOS-archived training completions)",
  },
  AU: {
    pipeline: "Vault audit-event ingest (Codex audit_events_register)",
    effort: "small",
    achievablePath: "evidence (technical, register)",
  },
  CM: {
    pipeline: "QMS document digest + change-drift register",
    effort: "wired",
    achievablePath: "evidence (qms_doc + register)",
  },
  IA: {
    pipeline: "Entra/Azure validators + OS evidence collector",
    effort: "wired",
    achievablePath: "evidence (technical)",
  },
  IR: {
    pipeline: "TrainOS IR tabletop bundle (ir_exercise_bundles mirror)",
    effort: "wired",
    achievablePath: "evidence (ir_bundle)",
  },
  MA: {
    pipeline:
      "Bastion/MFA-on-maintenance + ISSO weekly maintenance log review",
    effort: "medium",
    achievablePath: "evidence (technical + ISSO-weekly review register)",
  },
  MP: {
    pipeline: "Media disposition register + portable-storage OS check",
    effort: "medium",
    achievablePath: "evidence (register) + ESP inheritance for some",
  },
  PS: {
    pipeline: "HR system integration (background-check + termination)",
    effort: "large",
    achievablePath:
      "evidence (register) — feasible but customer HR varies; ISSO weekly OK",
  },
  PE: {
    pipeline: "Azure FedRAMP High ESP inheritance",
    effort: "wired",
    achievablePath: "esp_inheritance (Azure shared-responsibility)",
  },
  RA: {
    pipeline: "TrainOS RA wizard → /api/risk-assessments bridge",
    effort: "wired",
    achievablePath: "evidence (ra_envelope)",
  },
  CA: {
    pipeline:
      "TrainOS CA cycle bundle (CA mirror to Codex pending — vault has it)",
    effort: "small",
    achievablePath: "evidence (ca_bundle when mirror lands)",
  },
  SC: {
    pipeline: "OS validators + Azure crypto stack",
    effort: "wired",
    achievablePath: "evidence (technical)",
  },
  SI: {
    pipeline: "Vault vuln remediation register + Defender alerts",
    effort: "wired",
    achievablePath: "evidence (technical + register)",
  },
};

/**
 * Per-control overrides where the family heuristic doesn't fit.
 * Grounded in known characteristics of specific controls.
 */
const CONTROL_OVERRIDES: Record<string, Partial<AuditRow>> = {
  // Inherited Azure FedRAMP High (per CUSTOMER_ATTESTED_INHERITED list)
  "3.10.1": { achievablePath: "esp_inheritance (Azure datacenter)", pipeline: "Azure FedRAMP High", effort: "wired" },
  "3.10.2": { achievablePath: "esp_inheritance (Azure datacenter)", pipeline: "Azure FedRAMP High", effort: "wired" },
  "3.10.4": { achievablePath: "esp_inheritance (Azure datacenter)", pipeline: "Azure FedRAMP High", effort: "wired" },
  "3.10.5": { achievablePath: "esp_inheritance (Azure datacenter)", pipeline: "Azure FedRAMP High", effort: "wired" },

  // Customer-attested-inherited
  "3.10.3": {
    achievablePath: "esp_inheritance + customer attestation",
    pipeline: "Azure FedRAMP High + signed customer attestation",
    effort: "small",
    rationale:
      "Visitor records: datacenter inherited; customer attests no on-site visitors with CUI",
  },
  "3.10.6": {
    achievablePath: "esp_inheritance + customer attestation",
    pipeline: "Azure FedRAMP High + signed customer attestation",
    effort: "small",
    rationale: "Alternate work sites: customer attests no telework with CUI access",
  },

  // Procedural / governance-only controls
  "3.11.1": {
    achievablePath: "evidence (ra_envelope + register)",
    pipeline: "TrainOS RA wizard + risk_register",
    effort: "wired",
    rationale: "RA bridge already in production; finalize triggers rescore.",
  },
  "3.12.4": {
    achievablePath: "evidence (this SSP module) + ois_narrative",
    pipeline: "Codex SSP generator (this module)",
    effort: "wired",
    rationale:
      "The SSP is the evidence — generator + signed versions cover [a]–[h]; verify endpoint detects drift.",
  },
  "3.12.1": {
    achievablePath: "evidence (ca_bundle when mirror lands)",
    pipeline: "TrainOS CA cycle bundle → Codex mirror (pending)",
    effort: "small",
    rationale: "Vault already has CaAssessmentBundle; Codex mirror is one bridge endpoint away.",
  },
  "3.12.2": {
    achievablePath: "evidence (poam_entries + ca_bundle)",
    pipeline: "POA&M tracker + TrainOS CA cycle bundle",
    effort: "small",
    rationale: "POA&M lifecycle already wired; CA bundle citation auto-attaches once mirror lands.",
  },
  "3.12.3": {
    achievablePath: "evidence (ois_narrative + register)",
    pipeline: "ISSO weekly review + register cadence checks",
    effort: "wired",
    rationale: "Continuous monitoring already produces register evidence on cadence.",
  },

  // PS family — HR-flavored controls
  "3.9.1": {
    achievablePath: "evidence (register) — ISSO-weekly capture",
    pipeline: "Personnel-screening register populated by HR",
    effort: "medium",
    rationale: "Manageable via register; full automation requires HR-system integration.",
  },
  "3.9.2": {
    achievablePath: "evidence (register) — ISSO-weekly capture",
    pipeline: "Personnel-action register + Entra account-disable telemetry",
    effort: "small",
    rationale: "Termination-action timestamp from Entra audit logs feeds register.",
  },

  // Wireless — likely N/A in CUI enclave
  "3.1.16": {
    achievablePath: "operator-declared not_applicable",
    pipeline: "control_status_overrides with rationale",
    effort: "wired",
    rationale: "No wireless infrastructure within CUI boundary — declare N/A.",
  },
  "3.1.17": {
    achievablePath: "operator-declared not_applicable",
    pipeline: "control_status_overrides with rationale",
    effort: "wired",
    rationale: "Same as 3.1.16 — no wireless infrastructure.",
  },

  // Mobile — likely N/A
  "3.1.18": {
    achievablePath: "operator-declared not_applicable",
    pipeline: "control_status_overrides with rationale",
    effort: "wired",
    rationale: "No mobile devices in CUI enclave — declare N/A.",
  },
  "3.1.19": {
    achievablePath: "operator-declared not_applicable",
    pipeline: "control_status_overrides with rationale",
    effort: "wired",
    rationale: "Same as 3.1.18 — no mobile CUI.",
  },
};

function familyOf(controlId: string): string {
  // 3.1.x → AC, 3.2.x → AT, 3.3.x → AU, 3.4.x → CM, 3.5.x → IA,
  // 3.6.x → IR, 3.7.x → MA, 3.8.x → MP, 3.9.x → PS, 3.10.x → PE,
  // 3.11.x → RA, 3.12.x → CA, 3.13.x → SC, 3.14.x → SI
  const map: Record<string, string> = {
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
  // Match the longest family prefix first (3.10 vs 3.1)
  const candidates = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const prefix of candidates) {
    if (controlId.startsWith(prefix + ".")) return map[prefix];
  }
  return "??";
}

function compareControlIds(a: string, b: string): number {
  const A = a.split(".").map((p) => parseInt(p, 10) || 0);
  const B = b.split(".").map((p) => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const av = A[i] ?? 0;
    const bv = B[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return a.localeCompare(b);
}

async function main() {
  const argv = process.argv.slice(2);
  let slug = "mactech-solutions-llc";
  for (const a of argv) {
    if (a.startsWith("--org=")) slug = a.slice("--org=".length);
  }

  const [org] = await db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  if (!org) throw new Error(`Org not found: ${slug}`);

  const states = await getControlStatesForOrg(org.id);

  const rows: AuditRow[] = [];
  for (const cid of [...states.keys()].sort(compareControlIds)) {
    const s = states.get(cid)!;
    const family = familyOf(cid);
    const profile = FAMILY_PROFILES[family] ?? {
      pipeline: "unknown",
      effort: "blocker" as const,
      achievablePath: "unknown",
    };
    const override = CONTROL_OVERRIDES[cid] ?? {};
    rows.push({
      controlId: cid,
      family,
      currentMetVia: s.metVia,
      currentFinding: s.aggregateFinding,
      achievablePath: override.achievablePath ?? profile.achievablePath,
      pipeline: override.pipeline ?? profile.pipeline,
      effort: override.effort ?? profile.effort,
      rationale: override.rationale ?? "",
    });
  }

  // ── Write the markdown table ──────────────────────────────────
  const effortTally: Record<string, number> = {
    wired: 0,
    small: 0,
    medium: 0,
    large: 0,
    blocker: 0,
  };
  for (const r of rows) effortTally[r.effort]++;

  const findingTally: Record<string, number> = { MET: 0, NOT_MET: 0, NA: 0 };
  for (const r of rows) findingTally[r.currentFinding] = (findingTally[r.currentFinding] ?? 0) + 1;

  const md = [
    `# SSP — Evidence Elevation Audit (Phase D)`,
    ``,
    `**Org:** ${slug}`,
    `**Generated:** ${new Date().toISOString()}`,
    `**Source:** canonical adjudication snapshots + family-driven pipeline heuristics + per-control overrides`,
    ``,
    `## Headline numbers`,
    ``,
    `Today's canonical state:`,
    `- **${findingTally.MET}** MET · **${findingTally.NA}** N/A · **${findingTally.NOT_MET}** NOT MET (= ${findingTally.MET + findingTally.NA} defensible)`,
    ``,
    `Migration effort to push every control onto an evidence-backed (or ESP-inherited) path:`,
    `- **${effortTally.wired}** controls already wired (no migration needed)`,
    `- **${effortTally.small}** small effort (single bridge endpoint, register provisioning, or attestation declaration)`,
    `- **${effortTally.medium}** medium effort (process changes + integration work)`,
    `- **${effortTally.large}** large effort (HR-system integration or similar)`,
    `- **${effortTally.blocker}** blocker (no path identified — manual SSP narrative remains the only option)`,
    ``,
    `## Per-control table`,
    ``,
    `| Control | Family | Today's met_via | Today's finding | Achievable path | Pipeline | Effort | Rationale |`,
    `|---|---|---|---|---|---|---|---|`,
    ...rows.map(
      (r) =>
        `| \`${r.controlId}\` | ${r.family} | \`${r.currentMetVia}\` | ${r.currentFinding} | ${r.achievablePath} | ${r.pipeline} | ${r.effort} | ${r.rationale || "—"} |`,
    ),
    ``,
    `## How to read this`,
    ``,
    `**Today's met_via** is what the canonical helper currently records for the control's MET-elevator path (one of: \`evidence\`, \`esp_inheritance\`, \`enduring_exception\`, \`dod_cio_adjudication\`, \`operational_plan_of_action\`, \`not_met\`, \`not_applicable\`). \`evidence\` means at least one operational-evidence lane (technical / register / artifact / attestation) is satisfied. The other elevators correspond to the four AG p.10–11-recognized MET paths.`,
    ``,
    `**Achievable path** describes the strongest lane the control *could* land on with existing or adjacent pipelines. Where the family heuristic doesn't fit a specific control, a per-control override is recorded above (e.g., wireless controls in a CUI enclave with no wireless infrastructure are declared N/A).`,
    ``,
    `**Effort categories**:`,
    `- **wired**: existing pipeline already produces (or is configured to produce) the recommended evidence; no work required beyond rescore.`,
    `- **small**: a single bridge endpoint, register provisioning, or operator declaration would unlock the elevation.`,
    `- **medium**: process changes, integration work, or sustained ISSO-weekly involvement.`,
    `- **large**: HR-system integration or similar platform-spanning work; feasible but expensive.`,
    `- **blocker**: no automatable path identified — the SSP narrative + manual evidence-collection remain the only option.`,
    ``,
    `**Rationale** is supplied where the override or the effort classification benefits from a one-line explanation.`,
    ``,
    `---`,
    `_Generated by \`src/scripts/phase-d-audit.ts\`. Re-run on demand; the audit is read-only and idempotent._`,
    ``,
  ].join("\n");

  const outDir = path.join(process.cwd(), "docs");
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "SSP-evidence-elevation-table.md"), md);
  await fs.writeFile(
    path.join(outDir, "SSP-evidence-elevation-table.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        org: slug,
        findingTally,
        effortTally,
        rows,
      },
      null,
      2,
    ),
  );

  console.log(
    `Wrote docs/SSP-evidence-elevation-table.md and .json — ${rows.length} controls audited.`,
  );
  console.log(
    `Effort: wired=${effortTally.wired} small=${effortTally.small} medium=${effortTally.medium} large=${effortTally.large} blocker=${effortTally.blocker}`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
