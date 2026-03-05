/**
 * Normalize a collector run folder into run_manifest.json, control_results.json, evidence_index.json.
 * Run after collectors/validators have produced raw evidence and validation reports.
 *
 * Usage:
 *   npx tsx src/scripts/normalize-collector-run.ts -OutDir <path> -OrgId <uuid> -BoundaryId <uuid> [-RunId <id>]
 *
 * Exits with 1 if overall_status is fail or error.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";

const SCHEMA_VERSION = "1.0.0";

// --- Paths that are safe to export (policy summaries, sanitized configs). Others default exportable=false for raw logs.
const EXPORTABLE_PATTERNS: string[] = [
  "network/firewall-rules-summary.txt",
  "network/firewall.txt",
  "network/smb-signing.txt",
  "crypto/fips.txt",
  "crypto/schannel-protocols.txt",
  "crypto/tls-ciphersuites.txt",
  "policy/account-policy.txt",
  "policy/secpol.cfg",
  "audit/auditpol.txt",
  "audit/auditpol-subcategories.txt",
  "defender/defender-status.txt",
  "defender/defender-preferences.txt",
  "meta/manifest.json",
  "meta/bundle.json",
  "meta/control-mapping.stub.json",
];
// Paths that likely contain identity/host PII or sensitive data (default contains_sensitive=true).
const SENSITIVE_PREFIXES = ["host/", "policy/local-", "policy/account-", "audit/eventlog-", "audit/eventlog-security-sample", "audit/eventlog-4625"];

function parseArgs(): { outDir: string; orgId: string; boundaryId: string; runId: string } {
  const args = process.argv.slice(2);
  const get = (key: string): string => {
    const i = args.indexOf(key);
    if (i === -1 || !args[i + 1]) throw new Error(`Missing ${key} <value>`);
    return args[i + 1];
  };
  const outDir = get("-OutDir");
  const orgId = get("-OrgId");
  const boundaryId = get("-BoundaryId");
  let runId = "";
  try {
    runId = get("-RunId");
  } catch {
    runId = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z-${crypto.randomBytes(4).toString("hex")}`;
  }
  return { outDir, orgId, boundaryId, runId };
}

function sha256File(filePath: string): string {
  const h = crypto.createHash("sha256");
  const f = fs.readFileSync(filePath);
  h.update(f);
  return h.digest("hex");
}

function contentTypeFromPath(relativePath: string): string {
  const ext = path.extname(relativePath).toLowerCase();
  const map: Record<string, string> = {
    ".json": "application/json",
    ".txt": "text/plain",
    ".xml": "application/xml",
    ".html": "text/html",
    ".cfg": "text/plain",
    ".csv": "text/csv",
  };
  return map[ext] ?? "application/octet-stream";
}

function isExportable(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return EXPORTABLE_PATTERNS.some((p) => normalized === p || normalized.endsWith("/" + p));
}

function isSensitive(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return SENSITIVE_PREFIXES.some((p) => normalized.startsWith(p));
}

function* walkDir(dir: string, baseDir: string): Generator<{ full: string; relative: string }> {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const relative = path.relative(baseDir, full).replace(/\\/g, "/");
    if (e.isDirectory()) {
      yield* walkDir(full, baseDir);
    } else if (e.isFile()) {
      yield { full, relative };
    }
  }
}

function buildEvidenceIndex(outDir: string, runId: string, orgId: string, boundaryId: string): {
  files: Array<{
    path: string;
    sha256: string;
    bytes: number;
    content_type?: string;
    exportable?: boolean;
    contains_sensitive?: boolean;
    produced_by?: string;
    description?: string;
  }>;
} {
  const files: Array<{
    path: string;
    sha256: string;
    bytes: number;
    content_type?: string;
    exportable?: boolean;
    contains_sensitive?: boolean;
    produced_by?: string;
    description?: string;
  }> = [];
  for (const { full, relative } of walkDir(outDir, outDir)) {
    if (relative.endsWith(".zip") || relative === "run_manifest.json" || relative === "control_results.json" || relative === "evidence_index.json") continue;
    const stat = fs.statSync(full);
    const sha256 = sha256File(full);
    const exportable = isExportable(relative);
    const contains_sensitive = isSensitive(relative);
    files.push({
      path: relative,
      sha256,
      bytes: stat.size,
      content_type: contentTypeFromPath(relative),
      exportable,
      contains_sensitive,
      produced_by: "Collect-Cui-Evidence-v2.ps1",
      description: relative,
    });
  }
  return {
    schema: "mactech.collector.evidence-index.v1",
    version: SCHEMA_VERSION,
    run_id: runId,
    organization_id: orgId,
    boundary_id: boundaryId,
    files,
  };
}

function reduceWindowsValidationReport(reportPath: string): Record<string, { status: string; check_id?: string; title?: string; severity?: string; observed?: string; expected?: string; remediation?: string; evidence_files?: string[]; evidence_hashes?: Record<string, string>; source: string }> {
  const raw = fs.readFileSync(reportPath, "utf-8");
  const report = JSON.parse(raw) as { checks?: Array<{ control?: string; pass?: boolean; observed?: string; expected?: string; evidence_hint?: string; evidence_files_used?: string[] }> };
  const results: Record<string, { status: string; check_id?: string; title?: string; severity?: string; observed?: string; expected?: string; remediation?: string; evidence_files?: string[]; evidence_hashes?: Record<string, string>; source: string }> = {};
  for (const c of report.checks ?? []) {
    const controlId = c.control;
    if (!controlId || controlId === "BUNDLE.INTEGRITY") continue;
    const status = c.pass ? "pass" : "fail";
    results[controlId] = {
      status,
      check_id: controlId,
      title: (c.observed ?? "").slice(0, 200),
      severity: "medium",
      observed: c.observed,
      expected: c.expected,
      remediation: c.evidence_hint,
      evidence_files: c.evidence_files_used ?? [],
      source: "windows",
    };
  }
  return results;
}

function buildControlResults(
  outDir: string,
  runId: string,
  orgId: string,
  boundaryId: string
): { results: Record<string, unknown>; summary: { checks_total: number; pass: number; fail: number; warn: number; error: number; na: number }; overall_status: string } {
  const results: Record<string, unknown> = {};
  const validationPath = path.join(outDir, "validation-report-windows-hardening.json");
  if (fs.existsSync(validationPath)) {
    const fromWindows = reduceWindowsValidationReport(validationPath);
    for (const [k, v] of Object.entries(fromWindows)) {
      results[k] = v;
    }
  }
  // Counts
  let pass = 0,
    fail = 0,
    warn = 0,
    error = 0,
    na = 0;
  for (const r of Object.values(results)) {
    const status = (r as { status?: string }).status ?? "fail";
    if (status === "pass") pass++;
    else if (status === "fail") fail++;
    else if (status === "warn") warn++;
    else if (status === "error") error++;
    else na++;
  }
  const checks_total = pass + fail + warn + error + na;
  let overall_status: "pass" | "fail" | "warn" | "error" = "pass";
  if (fail > 0 || error > 0) overall_status = "fail";
  else if (warn > 0) overall_status = "warn";

  return {
    results,
    summary: { checks_total, pass, fail, warn, error, na },
    overall_status,
  };
}

function main() {
  const startedAt = new Date();
  const { outDir, orgId, boundaryId, runId } = parseArgs();
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const evidenceIndex = buildEvidenceIndex(outDir, runId, orgId, boundaryId);
  const { results, summary, overall_status } = buildControlResults(outDir, runId, orgId, boundaryId);

  const controlResults = {
    schema: "mactech.collector.control-results.v1",
    version: SCHEMA_VERSION,
    run_id: runId,
    organization_id: orgId,
    boundary_id: boundaryId,
    results,
  };

  const endedAt = new Date();
  const durationSeconds = (endedAt.getTime() - startedAt.getTime()) / 1000;
  const runManifest = {
    schema: "mactech.collector.run-manifest.v1",
    version: SCHEMA_VERSION,
    run_id: runId,
    organization_id: orgId,
    boundary_id: boundaryId,
    collector: {
      name: "cui-evidence-collector",
      version: "2.0.0",
      command: `normalize-collector-run -OutDir ${outDir} -OrgId ${orgId} -BoundaryId ${boundaryId} -RunId ${runId}`,
      toolchain: { node: process.version },
    },
    host: {
      hostname: process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "unknown",
      os: process.platform,
    },
    timing: {
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
    },
    summary: {
      ...summary,
      overall_status,
    },
    artifacts: {
      outputs_root: outDir,
      control_results_path: path.join(outDir, "control_results.json"),
      evidence_index_path: path.join(outDir, "evidence_index.json"),
    },
    notes: ["Generated by normalize-collector-run.ts. Raw evidence remains on-vault."],
  };

  fs.writeFileSync(path.join(outDir, "run_manifest.json"), JSON.stringify(runManifest, null, 2), "utf-8");
  fs.writeFileSync(path.join(outDir, "control_results.json"), JSON.stringify(controlResults, null, 2), "utf-8");
  fs.writeFileSync(path.join(outDir, "evidence_index.json"), JSON.stringify(evidenceIndex, null, 2), "utf-8");

  console.log("Wrote run_manifest.json, control_results.json, evidence_index.json to", outDir);
  if (overall_status === "fail" || overall_status === "error") {
    process.exit(1);
  }
}

main();
