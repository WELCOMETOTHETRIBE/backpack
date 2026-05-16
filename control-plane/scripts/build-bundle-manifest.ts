/**
 * Build the CUI Vault Documentation Bundle Master Manifest.
 *
 * Produces a comprehensive client-delivery document covering:
 *   A. QMS Document Bundle       — all EFFECTIVE docs with control mappings
 *   B. Supplemental Governance   — EFFECTIVE docs beyond the CMMC artifact set
 *   C. Option B Traceability     — REFERENCE procedures covered by parent policies
 *   D. Operational Registers     — REFERENCE records/lists maintained operationally
 *   E. CMMC L2 Control Index     — for every control, exactly what satisfies it
 *
 * Env:
 *   QMS_DB_URL — DATABASE_PUBLIC_URL of the QMS production DB.
 *
 * Output: ./docs/bundle/CMMC-CUI-VAULT-BUNDLE-MANIFEST.md
 */

import postgres from "postgres";
import * as fs from "fs";
import * as path from "path";
import { CMMC_ARTIFACT_SPECS } from "../src/lib/artifact-guide";

// ─── Option B: REFERENCE procedures documented inside a parent policy ─────
// label → { parentDoc, parentSection }
const OPTION_B_MATRIX: Record<string, { doc: string; title: string; section: string }> = {
  "Procedures for Incident Reporting":                      { doc: "MAC-POL-215", title: "Incident Response Policy",        section: "Section 4 — Reporting & Escalation" },
  "Procedures for Incident Response Testing":               { doc: "MAC-POL-215", title: "Incident Response Policy",        section: "Section 6 — Testing & Exercises" },
  "Incident response training materials and records":       { doc: "MAC-POL-215", title: "Incident Response Policy",        section: "Section 5 — Training" },
  "Procedures for Maintenance Tool Management":             { doc: "MAC-POL-221", title: "Maintenance Policy",              section: "Section 5 — Approved Tools" },
  "Procedures for Remote Maintenance":                      { doc: "MAC-POL-221", title: "Maintenance Policy",              section: "Section 4 — Remote Maintenance" },
  "Procedures for System Maintenance":                      { doc: "MAC-POL-221", title: "Maintenance Policy",              section: "Section 3 — Scheduled Maintenance" },
  "Procedures for Physical Access Authorizations":          { doc: "MAC-POL-212", title: "Physical Security Policy",        section: "Section 3 — Access Authorization" },
  "Procedures for Physical Access Monitoring":              { doc: "MAC-POL-212", title: "Physical Security Policy",        section: "Section 4 — Monitoring & CCTV" },
  "Procedures for Risk Assessment":                         { doc: "MAC-POL-223", title: "Risk Assessment Policy",          section: "Section 4 — Assessment Procedure" },
  "Procedures for Vulnerability Management":                { doc: "MAC-SOP-230", title: "Vulnerability Scanning and Remediation Procedure", section: "Full document" },
  "Procedures for System Security Plan Development and Review": { doc: "SSP-024",  title: "System Security Plan (CUI Vault)", section: "Section 1.2 — Maintenance & Review" },
  "Procedures for User Identification and Authentication":  { doc: "MAC-POL-211", title: "Identification and Authentication Policy", section: "Section 4 — Authentication Procedures" },
  "Procedures for Authenticator Management":                { doc: "MAC-POL-211", title: "Identification and Authentication Policy", section: "Section 5 — Authenticator Lifecycle" },
  "Procedures for establishing, changing, and revoking authenticators": { doc: "MAC-POL-211", title: "Identification and Authentication Policy", section: "Section 5.2 — Lifecycle Management" },
  "Procedures for Malicious Code Protection":               { doc: "MAC-POL-214", title: "System and Information Integrity Policy", section: "Section 3 — Malicious Code Controls" },
  "Procedures for Physical Access Control":                 { doc: "MAC-SOP-236", title: "Physical Access Control Procedure", section: "Full document" },
  "Procedures for Personnel Screening":                     { doc: "MAC-SOP-233", title: "Personnel Screening Procedure",  section: "Full document" },
  "Procedures for Personnel Termination and Transfer":      { doc: "MAC-SOP-234", title: "Personnel Termination Procedure", section: "Full document" },
  "Procedures for Visitor Control":                         { doc: "MAC-SOP-249", title: "Visitor Control Procedure",       section: "Full document" },
  "Procedures for Mobile Device Access":                    { doc: "MAC-SOP-236", title: "Physical Access Control Procedure", section: "Section 6 — Mobile Devices" },
  "Procedures for Role-Based Security Training":            { doc: "MAC-SOP-227", title: "Security Awareness Training Procedure", section: "Section 3 — Role-Based Tracks" },
  "Procedures for Security Awareness Training":             { doc: "MAC-SOP-227", title: "Security Awareness Training Procedure", section: "Full document" },
  "Security Awareness Training Curriculum & Materials":     { doc: "MAC-SOP-227", title: "Security Awareness Training Procedure", section: "Appendix A — Curriculum" },
};

// ─── Register requirements: REFERENCE labels that are operational records ──
// These are maintained in Codex registers or as documented evidence, NOT as
// standalone QMS-releasable documents.
const REGISTER_REQUIREMENTS: Array<{
  label: string;
  controls: string[];
  register: string;
  notes: string;
}> = [
  { label: "List of active system accounts & associated individuals",     controls: ["3.1.1"], register: "Access Register / Identity Provider export", notes: "Entra ID user list; export monthly" },
  { label: "Records of transferred/terminated employees",                 controls: ["3.1.1"], register: "HR offboarding log + IAM audit trail",       notes: "Retained in HRIS and Azure AD audit logs" },
  { label: "Access authorization records",                                controls: ["3.1.1"], register: "Access Register",                             notes: "Role assignment records in Entra ID and Codex Access Register" },
  { label: "List of approved user privileges/authorizations",             controls: ["3.1.2"], register: "Access Register — privilege matrix",          notes: "RBAC assignments; reviewed quarterly" },
  { label: "List of information flow authorizations",                     controls: ["3.1.3"], register: "Information Flow Register",                   notes: "Approved data paths in network diagram and firewall ruleset" },
  { label: "Separation of Duties Matrix",                                 controls: ["3.1.4"], register: "SoD Register (Codex)",                        notes: "R1–R10 role matrix, QMS-pinned to MAC-SOP-235 v2.0" },
  { label: "System Use Notification / Warning Banner Text",               controls: ["3.1.9"], register: "System Configuration Record",                 notes: "Banner text configured in Entra ID and Windows Group Policy" },
  { label: "Records of CUI system use",                                   controls: ["3.1.10"], register: "Audit Log Register",                         notes: "Azure Monitor / Sentinel — 90-day retention" },
  { label: "Definition of CUI categories handled",                        controls: ["3.1.22"], register: "SSP Appendix — CUI Inventory",               notes: "Documented in SSP-024 Appendix B" },
  { label: "Audit log records",                                           controls: ["3.3.1","3.3.2"], register: "Audit Log Register",                  notes: "Azure Sentinel + Log Analytics; write-once storage" },
  { label: "Audit review records and reports",                            controls: ["3.3.2"], register: "Audit Review Log",                            notes: "Monthly review reports filed in Codex Audit Register" },
  { label: "Records of configuration change control activities",          controls: ["3.4.3"], register: "Change Management Log",                       notes: "Change tickets in issue tracker; CAB approval documented" },
  { label: "Baseline configuration documentation",                        controls: ["3.4.1","3.4.2"], register: "Configuration Baseline Register",     notes: "OS baselines in Codex; linked to MAC-SOP-225 and MAC-CMP-001" },
  { label: "Inventory records of authorized software",                    controls: ["3.4.8","3.4.9"], register: "Software Inventory Register",         notes: "Intune managed-app catalog; reviewed quarterly" },
  { label: "Role-Based Training Curriculum & Materials",                  controls: ["3.2.2"], register: "Training Records Register",                   notes: "Codex Training Records; linked to MAC-SOP-227" },
  { label: "Training records showing completion",                         controls: ["3.2.1","3.2.2","3.2.3"], register: "Training Records Register",   notes: "Completion certificates stored in Codex Training Register" },
  { label: "Insider Threat Training Materials",                           controls: ["3.2.3"], register: "Training Records Register",                   notes: "Awareness module in annual training; tracked in Codex" },
  { label: "Records of maintenance activities and personnel",             controls: ["3.7.1","3.7.2"], register: "Maintenance Log",                     notes: "Azure maintenance activity log + signed maintenance tickets" },
  { label: "Inventory records of media",                                  controls: ["3.8.1","3.8.2"], register: "Media Inventory Register",            notes: "Asset inventory; USB/media tracking per MAC-POL-213" },
  { label: "Records of media sanitization and disposal",                  controls: ["3.8.3"], register: "Media Disposal Log",                         notes: "Certificate of destruction retained 3 years" },
  { label: "List of personnel authorized physical access",                controls: ["3.10.1"], register: "Physical Access Register",                   notes: "Badge-access enrollment list; reviewed quarterly" },
  { label: "Visitor access logs",                                         controls: ["3.10.3"], register: "Visitor Log",                                notes: "Physical sign-in/out log at facility entrance" },
  { label: "POA&M (Plan of Action & Milestones)",                        controls: ["3.12.2"], register: "POA&M Register (Codex)",                     notes: "Managed natively in Codex POAM module; linked to risk assessments" },
  { label: "Risk assessment report",                                      controls: ["3.11.1"], register: "Risk Assessment Register (Codex)",           notes: "Codex risk assessment module; annual full ARA + ad-hoc for changes" },
  { label: "Records of vulnerability scanning results",                   controls: ["3.11.2","3.11.3"], register: "Vulnerability Management Register", notes: "Tenable/Qualys reports + remediation tracking in Codex" },
  { label: "Security assessment report",                                  controls: ["3.12.1"], register: "Assessment Register (Codex)",                notes: "C3PAO assessment + internal assessment reports" },
  { label: "Security alert monitoring and response records",              controls: ["3.14.3","3.14.6","3.14.7"], register: "Incident/Alert Log",       notes: "Sentinel incidents + response documentation" },
  { label: "Records of actions taken in response to monitoring",         controls: ["3.14.7"], register: "Incident/Alert Log",                         notes: "Sentinel incident closure records" },
  { label: "Legal review and approval records for external connections", controls: ["3.1.20"], register: "External System Connections Register",       notes: "Codex external-connections snapshot; approved list documented" },
  { label: "Authorized personnel access list for CUI systems",           controls: ["3.1.1","3.1.2"], register: "Access Register",                    notes: "Entra ID group membership; verified against employment records" },
];

// ─── Controls that are satisfied by NATIVE Codex features (not docs) ─────
const NATIVE_CONTROLS: Record<string, string> = {
  "3.12.3": "Codex Continuous Monitoring dashboard — automated control recomputation from OS baseline runs, vulnerability data, and register evidence",
};

async function main() {
  const qmsUrl = process.env.QMS_DB_URL;
  if (!qmsUrl) throw new Error("QMS_DB_URL required");
  const sql = postgres(qmsUrl, { ssl: { rejectUnauthorized: false } });

  // ── Pull all EFFECTIVE docs with their CMMC control tags ──────────────────
  const docsWithTags = await sql`
    SELECT
      d.doc_id,
      d.title,
      d.doc_type::text AS doc_type,
      d.major_version,
      d.minor_version,
      d.effective_date,
      COALESCE(
        ARRAY_AGG(t.control_id ORDER BY t.control_id) FILTER (WHERE t.control_id IS NOT NULL),
        '{}'::text[]
      ) AS control_ids
    FROM documents d
    LEFT JOIN document_cmmc_control_tags t ON t.document_id = d.id::text
    WHERE d.status = 'EFFECTIVE'
    GROUP BY d.doc_id, d.title, d.doc_type, d.major_version, d.minor_version, d.effective_date
    ORDER BY d.doc_id
  `;

  // Also pull the CMMC artifact manifest JSON we already built
  const manifestPath = path.join(process.cwd(), "cmmc-doc-manifest.json");
  const manifestData = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // Build map: doc_id → controls from the canonical CMMC artifact manifest
  const docToControls = new Map<string, Set<string>>();
  for (const entry of manifestData.buckets.required_and_effective as Array<{ doc_id: string; controls: string[] }>) {
    if (!docToControls.has(entry.doc_id)) docToControls.set(entry.doc_id, new Set());
    for (const c of entry.controls) docToControls.get(entry.doc_id)!.add(c);
  }

  // Merge DB control tags into the map
  for (const row of docsWithTags) {
    const docId = row.doc_id as string;
    if (!docToControls.has(docId)) docToControls.set(docId, new Set());
    for (const c of (row.control_ids as string[])) {
      docToControls.get(docId)!.add(c);
    }
  }

  // ── Build control → docs/registers/option-B map ───────────────────────────
  const controlIndex = new Map<string, {
    docs: Array<{ doc_id: string; title: string; version: string }>;
    registers: string[];
    optionB: Array<{ label: string; parent_doc: string; parent_title: string }>;
    native: string | null;
  }>();

  // Collect all control IDs from artifact-guide
  for (const spec of CMMC_ARTIFACT_SPECS) {
    if (!controlIndex.has(spec.controlId)) {
      controlIndex.set(spec.controlId, { docs: [], registers: [], optionB: [], native: null });
    }
  }
  // Add native controls
  for (const [cid, desc] of Object.entries(NATIVE_CONTROLS)) {
    if (!controlIndex.has(cid)) controlIndex.set(cid, { docs: [], registers: [], optionB: [], native: null });
    controlIndex.get(cid)!.native = desc;
  }

  // Map docs → controls
  for (const row of docsWithTags) {
    const docId = row.doc_id as string;
    const controls = docToControls.get(docId) ?? new Set<string>();
    const version = `${row.major_version}.${row.minor_version}`;
    for (const cid of controls) {
      if (!controlIndex.has(cid)) controlIndex.set(cid, { docs: [], registers: [], optionB: [], native: null });
      const entry = controlIndex.get(cid)!;
      if (!entry.docs.some((d) => d.doc_id === docId)) {
        entry.docs.push({ doc_id: docId, title: row.title as string, version });
      }
    }
  }

  // Map registers → controls
  for (const reg of REGISTER_REQUIREMENTS) {
    for (const cid of reg.controls) {
      if (!controlIndex.has(cid)) controlIndex.set(cid, { docs: [], registers: [], optionB: [], native: null });
      controlIndex.get(cid)!.registers.push(`${reg.label} → ${reg.register}`);
    }
  }

  // Map Option B → controls
  for (const spec of CMMC_ARTIFACT_SPECS) {
    for (const artifact of spec.artifacts) {
      if (artifact.handling === "REFERENCE" && OPTION_B_MATRIX[artifact.label]) {
        const ob = OPTION_B_MATRIX[artifact.label];
        if (!controlIndex.has(spec.controlId)) controlIndex.set(spec.controlId, { docs: [], registers: [], optionB: [], native: null });
        const entry = controlIndex.get(spec.controlId)!;
        if (!entry.optionB.some((o) => o.label === artifact.label)) {
          entry.optionB.push({ label: artifact.label, parent_doc: ob.doc, parent_title: ob.title });
        }
      }
    }
  }

  // Sort controls numerically (3.1.1, 3.1.2, … 3.14.7)
  const sortedControls = [...controlIndex.keys()].sort((a, b) => {
    const ap = a.split(".").map(Number);
    const bp = b.split(".").map(Number);
    for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
      if ((ap[i] ?? 0) !== (bp[i] ?? 0)) return (ap[i] ?? 0) - (bp[i] ?? 0);
    }
    return 0;
  });

  // ── Group EFFECTIVE docs by type ──────────────────────────────────────────
  const TYPE_LABELS: Record<string, string> = {
    POLICY: "Policies",
    SOP: "Standard Operating Procedures",
    SECURITY: "Security Standards & Guides",
    INCIDENT_RESPONSE_PLAN: "Incident Response Plans",
    CONFIGURATION_MANAGEMENT_PLAN: "Configuration Management Plans",
    IT_SYSTEM: "IT System / Architecture Documents",
    SSP: "System Security Plans",
    AUDIT_ASSESSMENT: "Audit & Assessment Documents",
    WORK_INSTRUCTION: "Work Instructions",
    FORM: "Forms",
    OTHER: "Other Documents",
  };
  const docsByType = new Map<string, typeof docsWithTags>();
  for (const row of docsWithTags) {
    const t = row.doc_type as string;
    if (!docsByType.has(t)) docsByType.set(t, []);
    docsByType.get(t)!.push(row);
  }

  // ── Build supplemental docs (EFFECTIVE, have control tags, not in CMMC manifest core) ──
  const coreDocIds = new Set(docToControls.keys());
  // But remove docs that show up in control index via artifact-guide only
  // Supplemental = docs with control tags that the artifact-guide doesn't explicitly require
  const supplementalDocIds = new Set<string>();
  for (const row of docsWithTags) {
    const docId = row.doc_id as string;
    const controls = docToControls.get(docId);
    if (controls && controls.size > 0 && !manifestData.buckets.required_and_effective.some((e: { doc_id: string }) => e.doc_id === docId)) {
      supplementalDocIds.add(docId);
    }
  }

  // ── Generate Markdown ─────────────────────────────────────────────────────
  const md: string[] = [];
  const now = new Date().toISOString().split("T")[0];

  md.push("# MacTech CUI Vault — CMMC L2 Documentation Bundle Master Manifest");
  md.push("");
  md.push(`_Generated ${now} | NIST SP 800-171 Rev 2 | CMMC Level 2_`);
  md.push("");
  md.push("---");
  md.push("");
  md.push("## Overview");
  md.push("");
  md.push("This master manifest documents every artifact comprising the CUI Vault compliance package. It is organized into five sections:");
  md.push("");
  md.push("| Section | Contents |");
  md.push("|---------|----------|");
  md.push("| **A — QMS Document Bundle** | All EFFECTIVE governance documents released through the 4-seat SoD chain |");
  md.push("| **B — Supplemental Governance Documents** | EFFECTIVE documents beyond the core CMMC artifact set |");
  md.push("| **C — Option B: Procedures in Parent Policies** | Procedures documented within parent policy documents |");
  md.push("| **D — Operational Register Requirements** | Records, logs, and lists maintained operationally in Codex |");
  md.push("| **E — Complete CMMC L2 Control Coverage Index** | Every control → documents + registers that satisfy it |");
  md.push("");

  // ── Section A: QMS Document Bundle ────────────────────────────────────────
  md.push("---");
  md.push("");
  md.push("## Section A — QMS Document Bundle");
  md.push("");
  md.push("All documents below are **EFFECTIVE** in the QMS, having passed the full 4-seat Separation of Duties signature chain (Author → Reviewer → SIA Recorder → Approver → Quality Release). Each is included in the Codex governance manifest and available for C3PAO review.");
  md.push("");

  const totalEffective = docsWithTags.length;
  md.push(`**Total EFFECTIVE documents: ${totalEffective}**`);
  md.push("");

  for (const [docType, label] of Object.entries(TYPE_LABELS)) {
    const typeDocs = docsByType.get(docType);
    if (!typeDocs || typeDocs.length === 0) continue;
    md.push(`### ${label}`);
    md.push("");
    md.push("| Document ID | Title | Version | CMMC Controls |");
    md.push("|-------------|-------|---------|---------------|");
    for (const row of typeDocs) {
      const docId = row.doc_id as string;
      const controls = [...(docToControls.get(docId) ?? [])].sort();
      const controlStr = controls.length > 0 ? controls.join(", ") : "—";
      const version = `v${row.major_version}.${row.minor_version}`;
      md.push(`| **${docId}** | ${row.title} | ${version} | ${controlStr} |`);
    }
    md.push("");
  }

  // Handle any doc types not in the label map
  for (const [docType, rows] of docsByType) {
    if (TYPE_LABELS[docType]) continue;
    md.push(`### ${docType}`);
    md.push("");
    md.push("| Document ID | Title | Version | CMMC Controls |");
    md.push("|-------------|-------|---------|---------------|");
    for (const row of rows) {
      const docId = row.doc_id as string;
      const controls = [...(docToControls.get(docId) ?? [])].sort();
      md.push(`| **${docId}** | ${row.title} | v${row.major_version}.${row.minor_version} | ${controls.join(", ") || "—"} |`);
    }
    md.push("");
  }

  // ── Section B: Supplemental Governance Docs ───────────────────────────────
  md.push("---");
  md.push("");
  md.push("## Section B — Supplemental Governance Documents");
  md.push("");
  md.push("These EFFECTIVE documents are part of the MacTech governance framework and provide additional evidence for CMMC controls. They are included in the Codex governance manifest and are available to the C3PAO as supporting artifacts.");
  md.push("");
  if (supplementalDocIds.size === 0) {
    md.push("_All EFFECTIVE documents with CMMC control tags are included in Section A._");
  } else {
    md.push("| Document ID | Title | CMMC Controls | Purpose |");
    md.push("|-------------|-------|---------------|---------|");
    for (const docId of [...supplementalDocIds].sort()) {
      const row = docsWithTags.find((r) => r.doc_id === docId);
      if (!row) continue;
      const controls = [...(docToControls.get(docId) ?? [])].sort().join(", ");
      md.push(`| **${docId}** | ${row.title} | ${controls || "—"} | Supplemental governance evidence |`);
    }
  }
  md.push("");

  // ── Section C: Option B Traceability ─────────────────────────────────────
  md.push("---");
  md.push("");
  md.push("## Section C — Option B: Procedures Documented in Parent Policies");
  md.push("");
  md.push("The following CMMC artifact labels are satisfied by sections within existing parent policy documents rather than as standalone QMS releases. This is the **Option B** coverage model used by MacTech for procedures that are integrally part of a parent policy's scope.");
  md.push("");
  md.push("A C3PAO assessor may request the parent document and verify the relevant section directly.");
  md.push("");
  md.push("| CMMC Artifact Required | Covered By | Document | Section |");
  md.push("|------------------------|------------|----------|---------|");
  for (const [label, ob] of Object.entries(OPTION_B_MATRIX)) {
    md.push(`| ${label} | **${ob.doc}** | ${ob.title} | ${ob.section} |`);
  }
  md.push("");

  // ── Section D: Operational Register Requirements ──────────────────────────
  md.push("---");
  md.push("");
  md.push("## Section D — Operational Register Requirements");
  md.push("");
  md.push("These artifacts are **not releasable QMS documents** — they are operational records, logs, lists, and definitions maintained in live registers (primarily Codex) or as embedded evidence in policy documents. A C3PAO will verify these by inspecting the register or requesting an export, not by reviewing a signed QMS document.");
  md.push("");
  md.push(`**Total register requirements: ${REGISTER_REQUIREMENTS.length}**`);
  md.push("");
  md.push("| Required Artifact | CMMC Controls | Where Maintained | Notes |");
  md.push("|-------------------|---------------|------------------|-------|");
  for (const reg of REGISTER_REQUIREMENTS) {
    md.push(`| ${reg.label} | ${reg.controls.join(", ")} | ${reg.register} | ${reg.notes} |`);
  }
  md.push("");

  // ── Section E: CMMC L2 Control Coverage Index ─────────────────────────────
  md.push("---");
  md.push("");
  md.push("## Section E — Complete CMMC L2 Control Coverage Index");
  md.push("");
  md.push("For each of the 110 CMMC Level 2 controls, this index shows exactly which QMS documents, operational registers, and Option B procedures satisfy it.");
  md.push("");
  md.push("**Legend:**");
  md.push("- 📄 **QMS Document** — signed EFFECTIVE document in the governance manifest");
  md.push("- 📋 **Register** — operational record maintained in Codex or documented evidence");
  md.push("- 🔗 **Option B** — procedure covered by a section in a parent policy");
  md.push("- 🖥️ **Native** — satisfied by Codex platform functionality");
  md.push("");

  let controlsCovered = 0;
  let controlsEmpty = 0;
  for (const cid of sortedControls) {
    const entry = controlIndex.get(cid)!;
    const hasAnything = entry.docs.length > 0 || entry.registers.length > 0 || entry.optionB.length > 0 || entry.native;
    if (hasAnything) controlsCovered++; else controlsEmpty++;

    md.push(`### ${cid}`);
    md.push("");
    if (entry.docs.length > 0) {
      for (const d of entry.docs.sort((a, b) => a.doc_id.localeCompare(b.doc_id))) {
        md.push(`- 📄 **${d.doc_id}** v${d.version} — ${d.title}`);
      }
    }
    if (entry.optionB.length > 0) {
      for (const ob of entry.optionB) {
        md.push(`- 🔗 *${ob.label}* → see **${ob.parent_doc}** (${ob.parent_title})`);
      }
    }
    if (entry.registers.length > 0) {
      for (const r of entry.registers) {
        md.push(`- 📋 ${r}`);
      }
    }
    if (entry.native) {
      md.push(`- 🖥️ ${entry.native}`);
    }
    if (!hasAnything) {
      md.push(`- ⚠️ _No coverage mapped — review required_`);
    }
    md.push("");
  }

  md.push("---");
  md.push("");
  md.push("## Coverage Summary");
  md.push("");
  md.push(`| Metric | Value |`);
  md.push(`|--------|-------|`);
  md.push(`| CMMC L2 controls indexed | ${sortedControls.length} |`);
  md.push(`| Controls with coverage | ${controlsCovered} |`);
  md.push(`| Controls with no coverage mapped | ${controlsEmpty} |`);
  md.push(`| QMS documents (EFFECTIVE) | ${totalEffective} |`);
  md.push(`| Option B procedure coverages | ${Object.keys(OPTION_B_MATRIX).length} |`);
  md.push(`| Operational register requirements | ${REGISTER_REQUIREMENTS.length} |`);
  md.push(`| Manifest generated | ${now} |`);
  md.push("");

  // ── Write output ──────────────────────────────────────────────────────────
  const outDir = path.join(process.cwd(), "docs", "bundle");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "CMMC-CUI-VAULT-BUNDLE-MANIFEST.md");
  fs.writeFileSync(outPath, md.join("\n"));

  console.log(`\nWrote ${outPath}`);
  console.log(`\nCoverage: ${controlsCovered}/${sortedControls.length} controls mapped`);
  console.log(`Documents: ${totalEffective} EFFECTIVE`);
  console.log(`Option B: ${Object.keys(OPTION_B_MATRIX).length} procedures`);
  console.log(`Registers: ${REGISTER_REQUIREMENTS.length} requirements`);

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
