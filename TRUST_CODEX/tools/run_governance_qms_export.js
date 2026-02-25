#!/usr/bin/env node
/**
 * Run the full governance workflow: sign all docs (POL, SOP, FRM, supporting) with
 * current attestee and produce the QMS export ZIP (attestations with hashed signatures,
 * manifest, digest). Uses governance manifest and repo governance docs.
 *
 * Usage (from repo root):
 *   node TRUST_CODEX/tools/run_governance_qms_export.js [--out-dir <dir>]
 *
 * Env (optional): CODEX_ATTESTEE_NAME, CODEX_ATTESTEE_TITLE, CODEX_ATTESTEE_ORG
 * Output: <out-dir>/codex-qms-export-<timestamp>.zip (default: evidence/runs/<runId>/)
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO_ROOT = path.resolve(__dirname, "../..");
const TRUST_CODEX = path.resolve(__dirname, "..");
const MANIFEST_PATH = path.join(TRUST_CODEX, "manual_app", "governance-manifest.json");

function sha256Hex(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function normalize(s) {
  return (s == null || s === undefined) ? "" : String(s).trim();
}

function getAttestee() {
  return {
    name: process.env.CODEX_ATTESTEE_NAME || "Brian MacDonald",
    title: process.env.CODEX_ATTESTEE_TITLE || "System Owner",
    org: process.env.CODEX_ATTESTEE_ORG || "MacTech Solutions",
  };
}

function loadManifest() {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

function readDocContent(repoRoot, docId) {
  const filePath = path.join(repoRoot, docId);
  if (!fs.existsSync(filePath)) {
    const altPath = path.join(TRUST_CODEX, docId);
    if (fs.existsSync(altPath)) return fs.readFileSync(altPath, "utf8");
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

function sortDocKey(d) {
  return `${normalize(d.code).toUpperCase()}|${normalize(d.title)}`;
}

function buildProgress(manifest, attestee, docSignoffs) {
  const docs = manifest.docs || [];
  const created_utc = new Date().toISOString();
  const review_date = new Date().toISOString().slice(0, 10);

  const attestations = [];
  for (const kind of ["policy", "procedure", "supporting"]) {
    const targetKind = kind;
    const subset = docs.filter((d) => {
      const k = normalize(d.kind).toLowerCase();
      if (targetKind === "supporting") return k && k !== "policy" && k !== "procedure";
      return k === targetKind;
    });
    if (subset.length === 0) continue;
    attestations.push({
      id: `att-${created_utc.replace(/[:.]/g, "-")}-${kind}`,
      scope: `bulk:${targetKind}`,
      review_date,
      created_utc,
      name: attestee.name,
      title: attestee.title,
      org: attestee.org,
      notes: `Bulk sign-off for ${subset.length} ${kind} documents.`,
      checks: {
        reviewed_policies: targetKind === "policy",
        reviewed_sops: targetKind === "procedure",
        reviewed_supporting: targetKind === "supporting",
      },
    });
  }

  return {
    __doc_signoffs: docSignoffs,
    __doc_signoffs_by_code: Object.fromEntries(
      Object.entries(docSignoffs).map(([id, s]) => {
        const d = docs.find((x) => String(x.id) === id);
        const code = (d && d.code) ? normalize(d.code).toUpperCase() : id;
        return [code, { ...s, doc_code: d && d.code }];
      })
    ),
    __attestations: attestations,
  };
}

function buildAttestationMarkdown(progress, docs) {
  const docSignoffs = progress.__doc_signoffs || {};
  const docSignoffsByCode = progress.__doc_signoffs_by_code || {};
  const atts = progress.__attestations || [];

  const getDocSignoff = (docId) => docSignoffs[String(docId)] || null;

  const lines = [];
  lines.push("# Trust Codex Manual — Attestations");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  lines.push("## Document sign-offs (per document)");
  lines.push("");
  lines.push("This section enumerates each governance document and the signed record (per-document sign-off).");
  lines.push("");

  const renderTable = (kindLower, heading) => {
    const subset = docs
      .filter((d) => {
        const k = normalize(d.kind).toLowerCase();
        if (kindLower === "supporting") return k && k !== "policy" && k !== "procedure";
        return k === kindLower;
      })
      .slice()
      .sort((a, b) => sortDocKey(a).localeCompare(sortDocKey(b)));
    lines.push(`### ${heading}`);
    lines.push("");
    lines.push("| Code | Title | Signed (UTC) | Signer | SHA-256 |");
    lines.push("|------|-------|--------------|--------|---------|");
    for (const d of subset) {
      const s = getDocSignoff(d.id);
      const signer = s ? normalize(s.name) : "";
      const signed = s ? normalize(s.signed_utc) : "";
      const sha = s && s.doc_sha256 ? s.doc_sha256.slice(0, 16) + "…" : "";
      lines.push(`| ${normalize(d.code)} | ${normalize(d.title)} | ${signed} | ${signer} | ${sha} |`);
    }
    lines.push("");
  };

  renderTable("policy", "Policies");
  renderTable("procedure", "SOPs / Procedures");
  renderTable("supporting", "Plans / Forms / Other (Supporting)");

  const missing = docs.filter((d) => !getDocSignoff(d.id));
  if (missing.length) {
    lines.push("### Missing document sign-offs");
    lines.push("");
    lines.push("The following governance documents do not yet have a per-document sign-off record:");
    lines.push("");
    for (const d of missing.sort((a, b) => sortDocKey(a).localeCompare(sortDocKey(b)))) {
      lines.push(`- ${normalize(d.code) || d.id} — ${normalize(d.title)} (${normalize(d.kind) || "doc"})`);
    }
    lines.push("");
  }

  for (const a of atts) {
    lines.push(`## ${a.scope || "attestation"} — ${a.created_utc || ""}`);
    lines.push("");
    lines.push(`- **Name**: ${a.name || ""}`);
    lines.push(`- **Title/Role**: ${a.title || ""}`);
    lines.push(`- **Organization**: ${a.org || ""}`);
    if (a.review_date) lines.push(`- **Review date**: ${a.review_date}`);
    lines.push(`- **Notes**: ${a.notes || ""}`);
    lines.push("");
    lines.push("### Documents covered");
    lines.push("");
    lines.push(`See Document sign-offs tables above. Kind: \`${(a.scope || "").replace("bulk:", "")}\`.`);
    lines.push("");
    lines.push("### Checklist");
    lines.push(`- [x] Reviewed required ${(a.scope || "").replace("bulk:", "")} documents`);
    lines.push("");
  }

  return lines.join("\n");
}

function buildAttestationWithSignatures(md) {
  const sections = md.split(/\n(?=## )/).filter((s) => s.trim().length > 0);
  const articles = [];
  const signedParts = [];
  for (let i = 0; i < sections.length; i++) {
    const trimmed = sections[i].trim();
    const hash = sha256Hex(trimmed);
    const firstLine = trimmed.split("\n")[0] || "";
    const title = firstLine.replace(/^##\s*/, "").trim();
    articles.push({ id: `article_${i}`, title, sha256: hash });
    signedParts.push(trimmed + "\n\n---\n**QMS signature (SHA-256):** `" + hash + "`\n");
  }
  const mdWithSignatures = signedParts.join("\n\n");
  const digest_sha256 = sha256Hex(mdWithSignatures);
  const manifest = {
    generated_utc: new Date().toISOString(),
    description: "QMS export manifest: digest of attestation export and per-article hashes for controlled record-keeping.",
    digest_sha256,
    attestation_file: "codex-attestations.md",
    articles: articles.map((a) => ({ id: a.id, title: a.title, sha256: a.sha256 })),
  };
  return { md: mdWithSignatures, manifest, digest_sha256 };
}

function main() {
  const args = process.argv.slice(2);
  let outDir = path.join(REPO_ROOT, "evidence", "runs");
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--out-dir" && args[i + 1]) {
      outDir = args[i + 1];
      i++;
    }
  }

  const now = new Date();
  const runId = now.toISOString().slice(0, 10).replace(/-/g, "") + "-" + now.toTimeString().slice(0, 8).replace(/:/g, "");
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const exportDir = path.join(outDir, runId);
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const attestee = getAttestee();
  console.log("Attestee:", attestee.name, "|", attestee.title, "|", attestee.org);

  const manifest = loadManifest();
  const docs = manifest.docs || [];
  console.log("Governance documents:", docs.length);

  const created_utc = new Date().toISOString();
  const docSignoffs = {};
  for (const d of docs) {
    const content = readDocContent(REPO_ROOT, d.id);
    const docSha256 = content ? sha256Hex(content) : "";
    docSignoffs[d.id] = {
      doc_id: d.id,
      signed_utc: created_utc,
      review_date: new Date().toISOString().slice(0, 10),
      name: attestee.name,
      title: attestee.title,
      org: attestee.org,
      notes: "Bulk sign-off (CLI)",
      doc_sha256: docSha256,
      record_json_path: "",
    };
  }

  const progress = buildProgress(manifest, attestee, docSignoffs);
  const mdPlain = buildAttestationMarkdown(progress, docs);
  const { md, manifest: qmsManifest, digest_sha256 } = buildAttestationWithSignatures(mdPlain);

  const attestationFilename = `codex-attestations-${ts}.md`;
  const manifestFilename = "qms-manifest.json";
  const hashesFilename = "hashes.sha256.txt";

  const docsDir = path.join(exportDir, "docs");
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

  const documentArtifacts = [];
  const hashesLines = [
    digest_sha256 + "  " + attestationFilename,
    ...(qmsManifest.articles || []).map((a) => a.sha256 + "  " + a.id + "  " + (a.title || "").replace(/\s+/g, " ").slice(0, 60)),
  ];

  for (const d of docs) {
    const content = readDocContent(REPO_ROOT, d.id);
    const docContent = content != null ? content : "";
    const contentSha256 = sha256Hex(docContent);
    const signatureBlock = "\n\n---\n**QMS signature (SHA-256):** `" + contentSha256 + "`\n";
    const signedContent = docContent + signatureBlock;
    const fileSha256 = sha256Hex(signedContent);
    const baseName = path.basename(d.id);
    const docFilename = "docs/" + baseName;
    const docPath = path.join(exportDir, docFilename);
    fs.writeFileSync(docPath, signedContent, "utf8");
    documentArtifacts.push({
      code: d.code,
      title: d.title,
      kind: d.kind,
      filename_in_zip: docFilename,
      content_sha256: contentSha256,
      file_sha256: fileSha256,
    });
    hashesLines.push(fileSha256 + "  " + docFilename);
  }

  qmsManifest.documents = documentArtifacts;

  fs.writeFileSync(path.join(exportDir, attestationFilename), md, "utf8");
  fs.writeFileSync(path.join(exportDir, manifestFilename), JSON.stringify(qmsManifest, null, 2), "utf8");
  fs.writeFileSync(path.join(exportDir, hashesFilename), hashesLines.join("\n") + "\n", "utf8");

  const zipName = `codex-qms-export-${ts}.zip`;
  const zipPath = path.join(exportDir, zipName);
  const { execSync } = require("child_process");
  try {
    execSync(
      `zip -r "${zipPath}" "${attestationFilename}" "${manifestFilename}" "${hashesFilename}" docs`,
      { cwd: exportDir, stdio: "inherit" }
    );
  } catch (e) {
    console.error("zip failed. Files written to", exportDir);
    process.exitCode = 1;
    return;
  }

  console.log("Export written to:", zipPath);
  console.log("  -", attestationFilename);
  console.log("  -", manifestFilename);
  console.log("  -", hashesFilename);
  console.log("  - docs/ (" + docs.length + " governance documents, each with hashed signature block)");
  console.log("  - Digest SHA-256:", digest_sha256);
}

main();
