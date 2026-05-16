/**
 * Build CMMC L2 Canonical Document Manifest.
 *
 * Joins the codex's authoritative "required artifacts per control"
 * (CMMC_ARTIFACT_SPECS in artifact-guide.ts) against the live QMS document
 * inventory. Emits:
 *   1. A per-control breakdown showing required releasable media vs what
 *      currently exists in QMS (matched by title) and its release state.
 *   2. A flat de-duped manifest of every UPLOAD artifact required across the
 *      110 CMMC L2 controls, with a status column per artifact.
 *   3. A reconciliation summary: missing-in-QMS, draft-in-QMS, orphaned-in-QMS.
 *
 * Env:
 *   QMS_DB_URL — DATABASE_PUBLIC_URL of the QMS production DB.
 *
 * Output: ./cmmc-doc-manifest.json + ./cmmc-doc-manifest.md
 */

import postgres from "postgres";
import { CMMC_ARTIFACT_SPECS } from "../src/lib/artifact-guide";
import * as fs from "fs";
import * as path from "path";

type QmsDoc = {
  doc_id: string;
  title: string;
  status: string;
  doc_type: string;
  released_at: string | null;
  major_version: number | null;
  minor_version: number | null;
};

type ArtifactRow = {
  label: string;
  handling: string;
  controls: string[]; // every control that requires this artifact
};

type ManifestEntry = {
  artifact_label: string;
  handling: string;
  required_by_controls: string[];
  // Live state:
  qms_match: {
    doc_id: string;
    title: string;
    status: string;
    version: string;
    released: boolean;
  } | null;
  match_confidence: "alias" | "exact" | "fuzzy" | "none";
  match_notes: string;
};

// ─── Explicit alias map: canonical artifact label → QMS doc_id ────────────
// Hand-curated from a first pass that found jaccard matching too noisy.
// Each entry asserts "this CMMC artifact requirement is satisfied by this
// specific QMS doc." Multiple artifact labels can share a doc (one policy
// covering several requirements). Update this map as the QMS set evolves.
const EXPLICIT_ALIASES: Record<string, string> = {
  // === Policies (POL series) ===
  "Access Control Policy": "MAC-POL-210",
  "Audit and Accountability Policy": "MAC-POL-218",
  "Awareness and Training Policy": "MAC-POL-219",
  "Configuration Management Policy": "MAC-POL-220",
  "Identification and Authentication Policy": "MAC-POL-211",
  "Incident Response Policy": "MAC-POL-215",
  "Maintenance Policy": "MAC-POL-221",
  "Media Handling & Data Disposal Policy": "MAC-POL-213",
  "Media Protection Policy": "MAC-POL-213",
  "Personnel Security Policy": "MAC-POL-222",
  "Physical Security Policy": "MAC-POL-212",
  "Physical and Environmental Protection Policy": "MAC-POL-212",
  "Risk Assessment Policy": "MAC-POL-223",
  "Security Assessment Policy": "MAC-POL-224",
  "Security Planning Policy": "MAC-POL-225",
  "System and Communications Protection Policy": "MAC-POL-226",
  "System and Information Integrity Policy": "MAC-POL-216",
  "Policy for authentication feedback (obscure feedback)": "MAC-POL-228",
  "Information Flow Control Policy": "MAC-POL-227",
  "Insider Threat Policy & Procedures": "MAC-POL-219", // covered under Awareness/Training scope; may want a dedicated POL eventually

  // === Procedures (SOP series) ===
  "Procedures for Account Management": "MAC-SOP-221",
  "Procedures for Access Enforcement": "MAC-SOP-253",
  "Procedures for Least Privilege": "MAC-SOP-253",
  "Access Enforcement and Least Privilege Procedure": "MAC-SOP-253",
  "Procedures for Remote Access": "MAC-SOP-224",
  "Procedures for Audit Review, Analysis, and Reporting": "MAC-SOP-226",
  "Procedures for Configuration Change Control": "MAC-SOP-225",
  "Procedures for Configuration Management": "MAC-SOP-225",
  "Procedures for Continuous Monitoring": "MAC-SOP-256",
  "Procedures for Controlled Maintenance": "MAC-SOP-239",
  "Procedures for Cryptographic Key Management": "MAC-SOP-251",
  "Cryptographic Key Management Procedure": "MAC-SOP-251",
  "Procedures for CUI Handling": "MAC-SOP-248",
  "CUI Marking and Handling Procedure": "MAC-SOP-248",
  "Procedures for CUI Media Handling and Transport": "MAC-SOP-247",
  "Procedures for Flaw Remediation": "MAC-SOP-254",
  "Procedures for Incident Response Testing": "MAC-SOP-232",
  "Procedures for Media Sanitization": "MAC-SOP-246",
  "Procedures for Vulnerability Management": "MAC-SEC-106", // currently DRAFT
  "Procedures for Boundary Protection": "MAC-SOP-250",
  "Boundary Protection and Network Segmentation Procedure": "MAC-SOP-250",
  "Personnel Termination Procedure": "MAC-SOP-234",
  "Physical Access Control Procedure": "MAC-SOP-236",
  "Plan of Action and Milestones (POA&M) Management Procedure": "MAC-SOP-231",
  "Procedures for Security Assessments": "MAC-SOP-227",
  "Procedures for Risk Assessment": "MAC-SOP-229", // currently DRAFT
  "Procedures for Maintenance Tool Management": "MAC-SOP-238",
  "Procedures for Separation of Duties": "MAC-SOP-235", // currently DRAFT
  "Procedures for System Security Plan Development and Review": "MAC-IT-307",
  "Procedures for Incident Reporting": "MAC-SOP-223",

  // === Standards / Configuration Guides (SEC series) ===
  "Audit Logging Configuration Standard / Guide": "MAC-SEC-109",
  "MFA Implementation Standard / Guide": "MAC-SEC-108",

  // === Plans / IT artifacts ===
  "Configuration Management Plan": "MAC-CMP-001",
  "Incident Response Plan": "MAC-IRP-001",
  "Incident response training materials and records": "MAC-POL-215", // covered under POL-215 until distinct doc
  "System Security Plan (SSP)": "MAC-IT-307",
  "System Boundary and Scope Statement": "MAC-IT-308",
  "System Description and Architecture": "MAC-IT-301",
  "Network/security architecture documentation and procedures": "MAC-IT-301",

  // === Gov-rolled (multi-control wrappers from the original artifact guide) ===
  "Gov docs for information transfer controls": "MAC-SOP-244",
  "Gov docs for RDP/collaborative device use and restrictions": "MAC-SOP-245",
  "Gov docs for separation of duties and system management": "MAC-SOP-243",

  // === Recently discovered orphans → standard artifact labels ===
  "External System Connection Policy": "MAC-POL-229",
  "System and Information Integrity Policy": "MAC-POL-214",
  "Separation of Duties Policy": "MAC-POL-235",
  "Separation of Duties Matrix": "MAC-SOP-235",
  "Quarterly Separation of Duties Review": "MAC-SOP-257",
  "Privileged Onboarding Procedure": "MAC-SOP-258",
  "Break-Glass Activation and Post-Hoc Review Procedure": "MAC-SOP-259",
  "User Account Provisioning and Deprovisioning Procedure": "MAC-SOP-221",
  "Account Lifecycle Enforcement Procedure": "MAC-SOP-222",
  "Procedures for Configuration Baseline Management": "MAC-SOP-228",
  "Procedures for Mobile Code Control": "MAC-SOP-237",
  "Mobile Code Control": "MAC-SOP-237",
  "User Access and FCI/CUI Handling Acknowledgement": "MAC-FRM-203",
  "CUI Enclave User Agreement and Rules of Behavior": "MAC-FRM-204",
  "Azure Inheritance and Shared Responsibility Statement": "MAC-SEC-312",
  "CUI Data Flow Diagram": "MAC-IT-305",
  "CUI Vault Architecture Diagram": "MAC-IT-306",
  "FCI and CUI Scope and Data Boundary Statement": "MAC-SEC-302",
  "FCI and CUI Data Handling and Flow Summary": "MAC-SEC-303",
};

// ─── Records / lists that are NOT releasable QMS docs — they're register
// data, runtime evidence, or embedded definitions inside a policy. The
// artifact-guide marks them UPLOAD, but a C3PAO will accept "see register X"
// or "see policy section Y". Flag them so the canonical manifest doesn't
// count them as a missing doc.
const NON_RELEASABLE_PATTERNS: RegExp[] = [
  /^Authorized personnel access list/i,
  /^Definition of /i,
  /^Inventory records of /i,
  /^Legal review and approval records/i,
  /^List of /i,
  /^Records of /i,
  /^Training records /i,
  /^Visitor access logs/i,
  /^System Use Notification \/ Warning Banner Text/i,
  /^Insider Threat Training Materials/i,
  /^Role-Based Training Curriculum/i,
  /^Information Flow Control Policy/i, // covered in System & Comms Protection policy; flag for review
];

function isNonReleasable(label: string): boolean {
  return NON_RELEASABLE_PATTERNS.some((re) => re.test(label));
}

// ─── Title normalization for matching ─────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "policy",
  "procedures",
  "procedure",
  "for",
  "of",
  "and",
  "the",
  "a",
  "an",
  "to",
  "in",
  "cmmc",
  "level",
  "2",
  "mactech",
  "cui",
  "vault",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(" ")
      .filter((w) => w.length > 1 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

// ─── Match an artifact label to a QMS doc title ───────────────────────────
function matchArtifactToQms(
  label: string,
  qmsDocs: QmsDoc[],
  byDocId: Map<string, QmsDoc>,
): { doc: QmsDoc; confidence: "alias" | "exact" | "fuzzy"; score: number } | null {
  // 1. Explicit alias wins (hand-curated)
  const aliasDocId = EXPLICIT_ALIASES[label];
  if (aliasDocId) {
    const aliased = byDocId.get(aliasDocId);
    if (aliased) return { doc: aliased, confidence: "alias", score: 1 };
    // Alias points at a doc_id that doesn't exist in QMS yet — treat as missing
    // (caller surfaces it as a hand-mapped target that doesn't have a row yet).
    return null;
  }
  // 2. Fall back to token overlap
  const labelTokens = tokenize(label);
  let best: { doc: QmsDoc; score: number } | null = null;
  for (const d of qmsDocs) {
    const titleTokens = tokenize(d.title);
    const score = jaccard(labelTokens, titleTokens);
    if (score > (best?.score ?? 0)) best = { doc: d, score };
  }
  if (!best || best.score < 0.4) return null;
  const confidence = best.score >= 0.7 ? "exact" : "fuzzy";
  return { doc: best.doc, confidence, score: best.score };
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const qmsUrl = process.env.QMS_DB_URL;
  if (!qmsUrl) throw new Error("QMS_DB_URL required");
  const sql = postgres(qmsUrl, { ssl: { rejectUnauthorized: false } });

  // 1. Pull live QMS inventory (regular documents + cmmc_documents).
  const docs: QmsDoc[] = (await sql`
    select doc_id, title, status, doc_type, released_at, major_version, minor_version
    from documents
    where status != 'OBSOLETE'
    order by doc_id
  `).map((r) => ({
    doc_id: r.doc_id as string,
    title: r.title as string,
    status: r.status as string,
    doc_type: (r.doc_type as string) ?? "",
    released_at: r.released_at ? new Date(r.released_at as string).toISOString() : null,
    major_version: (r.major_version as number) ?? null,
    minor_version: (r.minor_version as number) ?? null,
  }));
  // Also pull cmmc_documents (CMMC-specific drafts the user is working through)
  const cmmcDocs = (await sql`
    select code as doc_id, title, status, qms_doc_type as doc_type
    from cmmc_documents
  `).map((r) => ({
    doc_id: r.doc_id as string,
    title: r.title as string,
    status: r.status as string,
    doc_type: (r.doc_type as string) ?? "",
    released_at: null,
    major_version: null,
    minor_version: null,
  }));
  // Merge — prefer `documents` over `cmmc_documents` when doc_id collides
  const byDocId = new Map<string, QmsDoc>();
  for (const d of cmmcDocs) byDocId.set(d.doc_id, d);
  for (const d of docs) byDocId.set(d.doc_id, d); // documents wins
  const allDocs = [...byDocId.values()];

  // 2. Build the unified artifact inventory from CMMC_ARTIFACT_SPECS.
  // De-dupe by label, attach the set of controls that require it.
  // Only consider UPLOAD-handling artifacts as "releasable media" (REFERENCE
  // artifacts are inventory/lists, not policies/procedures).
  const byLabel = new Map<string, ArtifactRow>();
  for (const spec of CMMC_ARTIFACT_SPECS) {
    for (const a of spec.artifacts) {
      if (a.handling !== "UPLOAD") continue;
      const key = a.label;
      if (!byLabel.has(key)) {
        byLabel.set(key, { label: a.label, handling: a.handling, controls: [] });
      }
      byLabel.get(key)!.controls.push(spec.controlId);
    }
  }
  // 3. Match each artifact to a QMS doc.
  const manifest: ManifestEntry[] = [];
  for (const a of byLabel.values()) {
    const match = matchArtifactToQms(a.label, allDocs, byDocId);
    manifest.push({
      artifact_label: a.label,
      handling: a.handling,
      required_by_controls: a.controls.sort(),
      qms_match: match
        ? {
            doc_id: match.doc.doc_id,
            title: match.doc.title,
            status: match.doc.status,
            version: match.doc.major_version != null ? `${match.doc.major_version}.${match.doc.minor_version}` : "",
            released: match.doc.status === "EFFECTIVE",
          }
        : null,
      match_confidence: match ? match.confidence : "none",
      match_notes: match ? `Jaccard score ${match.score.toFixed(2)}` : "no QMS doc title overlap ≥ 0.4",
    });
  }
  manifest.sort((a, b) => a.artifact_label.localeCompare(b.artifact_label));

  // 4. Identify orphans: QMS docs that DON'T match any required artifact.
  const matchedDocIds = new Set(
    manifest.filter((m) => m.qms_match).map((m) => m.qms_match!.doc_id),
  );
  const orphans = allDocs.filter((d) => !matchedDocIds.has(d.doc_id));

  // 5. Bucket: by reconciliation state.
  const required_non_releasable = manifest.filter((m) => isNonReleasable(m.artifact_label));
  const required_missing_entirely = manifest.filter(
    (m) => !m.qms_match && !isNonReleasable(m.artifact_label),
  );
  const required_drafted_not_released = manifest.filter(
    (m) => m.qms_match && !m.qms_match.released,
  );
  const required_and_effective = manifest.filter(
    (m) => m.qms_match && m.qms_match.released,
  );

  const summary = {
    generated_at: new Date().toISOString(),
    qms_inventory: {
      total: allDocs.length,
      effective: allDocs.filter((d) => d.status === "EFFECTIVE").length,
      approved_not_effective: allDocs.filter((d) => d.status === "APPROVED").length,
      in_review: allDocs.filter((d) => d.status === "IN_REVIEW").length,
      draft: allDocs.filter((d) => d.status === "DRAFT").length,
    },
    cmmc_required_artifacts: {
      total_distinct_labels: manifest.length,
      effective_in_qms: required_and_effective.length,
      drafted_not_released: required_drafted_not_released.length,
      missing_entirely_as_doc: required_missing_entirely.length,
      non_releasable_records_or_lists: required_non_releasable.length,
    },
    orphaned_qms_docs: orphans.length,
  };

  // 6. Emit JSON + Markdown
  const outDir = process.cwd();
  fs.writeFileSync(
    path.join(outDir, "cmmc-doc-manifest.json"),
    JSON.stringify(
      {
        summary,
        manifest,
        orphans: orphans.map((d) => ({
          doc_id: d.doc_id,
          title: d.title,
          status: d.status,
          version: d.major_version != null ? `${d.major_version}.${d.minor_version}` : "",
        })),
        buckets: {
          required_and_effective: required_and_effective.map((m) => ({
            label: m.artifact_label,
            controls: m.required_by_controls,
            doc_id: m.qms_match!.doc_id,
            title: m.qms_match!.title,
          })),
          required_drafted_not_released: required_drafted_not_released.map((m) => ({
            label: m.artifact_label,
            controls: m.required_by_controls,
            doc_id: m.qms_match!.doc_id,
            title: m.qms_match!.title,
            qms_status: m.qms_match!.status,
          })),
          required_missing_entirely: required_missing_entirely.map((m) => ({
            label: m.artifact_label,
            controls: m.required_by_controls,
          })),
          required_non_releasable: required_non_releasable.map((m) => ({
            label: m.artifact_label,
            controls: m.required_by_controls,
          })),
        },
      },
      null,
      2,
    ),
  );

  // Markdown report
  const md: string[] = [];
  md.push("# CMMC L2 Canonical Document Manifest");
  md.push("");
  md.push(`_Generated ${summary.generated_at}_`);
  md.push("");
  md.push("## Summary");
  md.push("");
  md.push("| Bucket | Count |");
  md.push("|---|---|");
  md.push(`| **QMS total documents** (not OBSOLETE) | ${summary.qms_inventory.total} |`);
  md.push(`| &nbsp;&nbsp;EFFECTIVE | ${summary.qms_inventory.effective} |`);
  md.push(`| &nbsp;&nbsp;APPROVED (signed, not effective) | ${summary.qms_inventory.approved_not_effective} |`);
  md.push(`| &nbsp;&nbsp;IN_REVIEW | ${summary.qms_inventory.in_review} |`);
  md.push(`| &nbsp;&nbsp;DRAFT | ${summary.qms_inventory.draft} |`);
  md.push(`| **CMMC L2 required UPLOAD artifacts** (de-duped) | ${summary.cmmc_required_artifacts.total_distinct_labels} |`);
  md.push(`| &nbsp;&nbsp;EFFECTIVE in QMS ✅ | ${summary.cmmc_required_artifacts.effective_in_qms} |`);
  md.push(`| &nbsp;&nbsp;Drafted but not yet released ⚠️ | ${summary.cmmc_required_artifacts.drafted_not_released} |`);
  md.push(`| &nbsp;&nbsp;Missing as a doc ❌ | ${summary.cmmc_required_artifacts.missing_entirely_as_doc} |`);
  md.push(`| &nbsp;&nbsp;Records / lists (live in registers, not QMS) 📋 | ${summary.cmmc_required_artifacts.non_releasable_records_or_lists} |`);
  md.push(`| **QMS docs NOT mapping to any CMMC requirement** (orphans) | ${summary.orphaned_qms_docs} |`);
  md.push("");

  md.push("## Bucket 1 — ✅ Effective in QMS");
  md.push("");
  md.push("| Required Artifact | QMS doc | Controls |");
  md.push("|---|---|---|");
  for (const m of required_and_effective) {
    md.push(`| ${m.artifact_label} | ${m.qms_match!.doc_id} v${m.qms_match!.version} | ${m.required_by_controls.join(", ")} |`);
  }
  md.push("");

  md.push("## Bucket 2 — ⚠️ Drafted in QMS but not released");
  md.push("");
  md.push("| Required Artifact | QMS doc | QMS status | Controls blocked |");
  md.push("|---|---|---|---|");
  for (const m of required_drafted_not_released) {
    md.push(`| ${m.artifact_label} | ${m.qms_match!.doc_id} v${m.qms_match!.version} | ${m.qms_match!.status} | ${m.required_by_controls.join(", ")} |`);
  }
  md.push("");

  md.push("## Bucket 3 — ❌ Missing entirely from QMS (true doc gap)");
  md.push("");
  md.push("These are policies / procedures / plans that should exist in QMS but don't.");
  md.push("");
  md.push("| Required Artifact | Controls needing it |");
  md.push("|---|---|");
  for (const m of required_missing_entirely) {
    md.push(`| ${m.artifact_label} | ${m.required_by_controls.join(", ")} |`);
  }
  md.push("");

  md.push("## Bucket 4 — 📋 Records / lists / definitions (NOT a QMS doc)");
  md.push("");
  md.push("These artifact labels in `artifact-guide.ts` are records, lists, or definitions — they live in registers or as embedded sections of a policy, not as standalone releasable docs. They should NOT count as missing QMS docs against compliance.");
  md.push("");
  md.push("| Required Artifact | Controls | Where it actually lives |");
  md.push("|---|---|---|");
  for (const m of required_non_releasable) {
    md.push(`| ${m.artifact_label} | ${m.required_by_controls.join(", ")} | register / register entry / embedded |`);
  }
  md.push("");

  md.push("## Orphans — QMS docs not mapping to any CMMC required artifact");
  md.push("");
  md.push("These docs exist in QMS but the matcher couldn't tie them to a CMMC artifact label. Either: a) genuinely scope-creep (delete?), b) intentionally extra-mile (keep, document why), c) the title doesn't match the standard label (rename or add to artifact-guide manually).");
  md.push("");
  md.push("| QMS doc | Title | Status |");
  md.push("|---|---|---|");
  for (const o of orphans) {
    md.push(`| ${o.doc_id} | ${o.title} | ${o.status} |`);
  }
  md.push("");

  fs.writeFileSync(path.join(outDir, "cmmc-doc-manifest.md"), md.join("\n"));

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${path.join(outDir, "cmmc-doc-manifest.json")}`);
  console.log(`Wrote ${path.join(outDir, "cmmc-doc-manifest.md")}`);
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
