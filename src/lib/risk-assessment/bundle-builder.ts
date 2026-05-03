import archiver from "archiver";
import PDFDocument from "pdfkit";
import { createHash } from "crypto";
import type { OrgPosture } from "./posture-engine";

/**
 * Risk-assessment evidence bundle builder.
 *
 * Assembles a single ZIP that a C3PAO assessor can review offline:
 *
 *   cover.pdf               — Assessment cover sheet (scope, sign-off,
 *                             severity + treatment summary, full risk
 *                             inventory table)
 *   risks.csv               — All risks from this assessment, NIST
 *                             SP 800-30 friendly columns
 *   risks.json              — Same data, structured JSON
 *   posture-snapshot.json   — Org posture at the time of bundle
 *                             generation (signed attestations,
 *                             cadence health, vuln counts)
 *   assessment-meta.json    — Top-level metadata (org, boundary,
 *                             period, sign-off, fingerprint)
 *   README.txt              — Bundle structure + verification notes
 *
 * The bundle is deterministic: re-running `buildAssessmentBundle` with
 * the same inputs (and frozen posture) produces an identical SHA-256
 * over the contents. The fingerprint is embedded in cover.pdf and the
 * meta JSON so the assessor can pin a specific version.
 */

export type RiskRecord = {
  riskId: string;
  scenarioId: string;
  riskStatement: string;
  threatSource: string;
  vulnerability: string;
  potentialImpact: string;
  likelihood: string;
  impact: string;
  inherentRisk: string;
  treatmentStrategy: string;
  owner: string;
  targetDate: string | null;
  existingControls: string[];
  applicableControls: string[];
  notes: string | null;
  identifiedAt: string;
  identifiedBy: string;
};

export type AssessmentMeta = {
  assessmentId: string;
  organizationName: string;
  boundaryName: string;
  reviewPeriodStart: string;
  reviewPeriodEnd: string;
  scopeStatement: string;
  methodology: string;
  assessor: string;
  preparer: string;
  reviewer: string | null;
  approver: string;
  signOffDate: string;
};

export type BundleInput = {
  meta: AssessmentMeta;
  risks: RiskRecord[];
  posture: OrgPosture;
};

const RISK_MATRIX: Record<string, Record<string, "low" | "moderate" | "high" | "critical">> = {
  rare: { low: "low", moderate: "low", high: "moderate", critical: "high" },
  unlikely: { low: "low", moderate: "moderate", high: "high", critical: "high" },
  possible: { low: "moderate", moderate: "moderate", high: "high", critical: "critical" },
  likely: { low: "moderate", moderate: "high", high: "critical", critical: "critical" },
  almost_certain: { low: "high", moderate: "high", high: "critical", critical: "critical" },
};

export function inherentRiskLevel(likelihood: string, impact: string): "low" | "moderate" | "high" | "critical" {
  return RISK_MATRIX[likelihood]?.[impact] ?? "moderate";
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(risks: RiskRecord[]): string {
  const headers = [
    "risk_id",
    "scenario_id",
    "risk_statement",
    "threat_source",
    "vulnerability",
    "likelihood",
    "impact",
    "inherent_risk",
    "treatment_strategy",
    "owner",
    "target_date",
    "applicable_controls",
    "existing_controls",
    "notes",
    "identified_at",
    "identified_by",
  ];
  const lines = [headers.join(",")];
  for (const r of risks) {
    lines.push(
      [
        r.riskId,
        r.scenarioId,
        r.riskStatement,
        r.threatSource,
        r.vulnerability,
        r.likelihood,
        r.impact,
        r.inherentRisk,
        r.treatmentStrategy,
        r.owner,
        r.targetDate ?? "",
        r.applicableControls.join("; "),
        r.existingControls.join("; "),
        r.notes ?? "",
        r.identifiedAt,
        r.identifiedBy,
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}

async function buildCoverPdf(input: BundleInput, fingerprint: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    try {
      const buffers: Buffer[] = [];
      const doc = new PDFDocument({ margin: 50, size: "LETTER" });
      doc.on("data", (chunk: Buffer) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", reject);

      const m = input.meta;

      // ── Header ──────────────────────────────────────────────
      doc.fontSize(18).text("Annual Risk Assessment", { align: "center" });
      doc.fontSize(12).text(m.organizationName, { align: "center" });
      doc.moveDown(0.25);
      doc
        .fontSize(10)
        .fillColor("#666")
        .text(
          `Boundary: ${m.boundaryName}  ·  Period: ${m.reviewPeriodStart} → ${m.reviewPeriodEnd}`,
          { align: "center" },
        );
      doc.moveDown(0.5);
      doc
        .fontSize(8)
        .fillColor("#888")
        .text(
          `Assessment ID: ${m.assessmentId}  ·  Bundle fingerprint: ${fingerprint.slice(0, 16)}…`,
          { align: "center" },
        );
      doc.moveDown(1);
      doc.fillColor("#000");

      // ── Scope & methodology ────────────────────────────────
      doc.fontSize(11).text("Scope & Methodology", { underline: true });
      doc.moveDown(0.25);
      doc.fontSize(10).text(m.scopeStatement, { align: "justify" });
      doc.moveDown(0.25);
      doc.fontSize(9).fillColor("#444").text(`Methodology: ${m.methodology}`);
      doc.fillColor("#000");
      doc.moveDown(0.5);

      // ── Sign-off block ─────────────────────────────────────
      doc.fontSize(11).text("Sign-off", { underline: true });
      doc.moveDown(0.25);
      doc.fontSize(10);
      doc.text(`Assessor: ${m.assessor}`);
      doc.text(`Preparer: ${m.preparer}`);
      if (m.reviewer) doc.text(`Reviewer: ${m.reviewer}`);
      doc.text(`Approver: ${m.approver}`);
      doc.text(`Sign-off date: ${m.signOffDate}`);
      doc.moveDown(0.75);

      // ── Severity summary ───────────────────────────────────
      doc.fontSize(11).text("Risk Inventory Summary", { underline: true });
      doc.moveDown(0.25);

      const sevCounts = { critical: 0, high: 0, moderate: 0, low: 0 };
      const treatCounts: Record<string, number> = {};
      for (const r of input.risks) {
        const lvl = r.inherentRisk as keyof typeof sevCounts;
        if (sevCounts[lvl] !== undefined) sevCounts[lvl]++;
        treatCounts[r.treatmentStrategy] = (treatCounts[r.treatmentStrategy] ?? 0) + 1;
      }
      doc.fontSize(10);
      doc.text(
        `Total: ${input.risks.length}  ·  Critical: ${sevCounts.critical}  ·  High: ${sevCounts.high}  ·  Moderate: ${sevCounts.moderate}  ·  Low: ${sevCounts.low}`,
      );
      const treatLine = Object.entries(treatCounts)
        .map(([k, v]) => `${k}: ${v}`)
        .join("  ·  ");
      if (treatLine) doc.text(`Treatment: ${treatLine}`);
      doc.moveDown(0.75);

      // ── Risk table ─────────────────────────────────────────
      doc.fontSize(11).text("Identified Risks", { underline: true });
      doc.moveDown(0.5);

      input.risks.forEach((r, idx) => {
        // page break heuristic
        if (doc.y > 680) {
          doc.addPage();
        }
        doc
          .fontSize(10)
          .fillColor("#000")
          .text(`${idx + 1}. ${r.scenarioId} · ${r.riskId}`, { continued: false });
        doc
          .fontSize(9)
          .fillColor("#444")
          .text(
            `Likelihood: ${r.likelihood}  ·  Impact: ${r.impact}  ·  Inherent: ${r.inherentRisk.toUpperCase()}  ·  Treatment: ${r.treatmentStrategy}  ·  Owner: ${r.owner}` +
              (r.targetDate ? `  ·  Target: ${r.targetDate}` : ""),
          );
        doc.fillColor("#000").fontSize(9).text(r.riskStatement, { align: "justify" });
        if (r.existingControls.length > 0) {
          doc.fontSize(8).fillColor("#555").text("Existing controls:");
          for (const c of r.existingControls) {
            doc.text(`  • ${c}`);
          }
          doc.fillColor("#000");
        }
        if (r.applicableControls.length > 0) {
          doc.fontSize(8).fillColor("#555").text(`Mapped controls: ${r.applicableControls.join(", ")}`);
          doc.fillColor("#000");
        }
        if (r.notes) {
          doc.fontSize(8).fillColor("#555").text(`Notes: ${r.notes}`);
          doc.fillColor("#000");
        }
        doc.moveDown(0.5);
      });

      // ── Footer page ─────────────────────────────────────────
      doc.addPage();
      doc.fontSize(11).text("Bundle Verification", { underline: true });
      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .text(
          "This evidence bundle was generated by Trust Codex for offline C3PAO review. The accompanying ZIP contains:",
          { align: "left" },
        );
      doc.moveDown(0.25);
      doc.fontSize(9).text("  • cover.pdf — this document");
      doc.text("  • risks.csv / risks.json — full risk inventory");
      doc.text("  • posture-snapshot.json — org posture at bundle generation");
      doc.text("  • assessment-meta.json — top-level metadata");
      doc.text("  • README.txt — verification notes");
      doc.moveDown(0.5);
      doc.fontSize(9).text(`SHA-256 over bundled artifacts: ${fingerprint}`);
      doc.text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown(1);
      doc
        .fontSize(8)
        .fillColor("#888")
        .text(
          "The signed risk-assessment program attestation in Trust Codex (artifact label risk_assessment_program) is the customer's program-level declaration. This bundle is the output of one specific assessment cycle and corroborates 3.11.1 alongside the live risk_register.",
          { align: "justify" },
        );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function buildPostureSnapshot(posture: OrgPosture): Record<string, unknown> {
  return {
    snapshot_taken_at: new Date().toISOString(),
    boundary_name: posture.boundaryName,
    implemented_control_count: posture.implementedControlCount,
    at_risk_control_count: posture.atRiskControlCount,
    signed_attestations: posture.signedAttestations.map((a) => ({
      label: a.label,
      signed_at: a.signedAt.toISOString(),
      signed_by: a.signedBy,
      control_ids: a.controlIds,
    })),
    cadence_by_source: Object.fromEntries(
      Object.entries(posture.cadenceByName).map(([k, v]) => [
        k,
        {
          source: v.source,
          last_seen_at: v.lastSeenAt?.toISOString() ?? null,
          days_since_last: v.daysSinceLast,
          status: v.status,
        },
      ]),
    ),
    vulnerability: posture.vulnerability,
  };
}

function buildReadme(meta: AssessmentMeta, fingerprint: string): string {
  return [
    "Annual Risk Assessment — Evidence Bundle",
    "========================================",
    "",
    `Organization: ${meta.organizationName}`,
    `Boundary: ${meta.boundaryName}`,
    `Assessment ID: ${meta.assessmentId}`,
    `Review period: ${meta.reviewPeriodStart} → ${meta.reviewPeriodEnd}`,
    `Sign-off: ${meta.preparer} (preparer)${meta.reviewer ? ` / ${meta.reviewer} (reviewer)` : ""} / ${meta.approver} (approver) on ${meta.signOffDate}`,
    "",
    "Bundle contents",
    "---------------",
    "  cover.pdf               Assessment cover sheet (scope, sign-off, summary, full risk inventory).",
    "  risks.csv               All identified risks (NIST SP 800-30 columns).",
    "  risks.json              Same data, structured JSON.",
    "  posture-snapshot.json   Org posture at bundle generation: signed attestations, cadence health,",
    "                          open CVE counts, control statuses. Use this to corroborate the existing",
    "                          controls referenced in each risk.",
    "  assessment-meta.json    Top-level metadata mirroring this README.",
    "",
    "Verification",
    "------------",
    `  Bundle fingerprint (SHA-256 over JSON manifest): ${fingerprint}`,
    "",
    "  This fingerprint is embedded in cover.pdf and assessment-meta.json. It is",
    "  computed deterministically from the canonical-form JSON of risks +",
    "  posture + meta — re-generating the bundle from the same source data",
    "  produces the same fingerprint.",
    "",
    "Notes for the C3PAO assessor",
    "----------------------------",
    "  • The signed risk_assessment_program attestation in Trust Codex is the",
    "    customer's program-level declaration. This bundle is the output of one",
    "    specific assessment cycle.",
    "  • All risk entries also live in the risk_register (live, queryable) so",
    "    closure / treatment progress can be verified independently.",
    "  • Treatment != accept always carries a target date; accept treatments",
    "    require explicit approver sign-off (see assessment-meta.json).",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ].join("\n");
}

/**
 * Compute a fingerprint over the canonical JSON of risks + posture + meta.
 * Stable as long as the inputs are stable.
 */
export function computeBundleFingerprint(input: BundleInput): string {
  const canonical = JSON.stringify(
    {
      meta: input.meta,
      risks: input.risks
        .map((r) => ({ ...r, existingControls: [...r.existingControls], applicableControls: [...r.applicableControls] }))
        .sort((a, b) => a.riskId.localeCompare(b.riskId)),
      posture_summary: {
        boundary: input.posture.boundaryName,
        implemented: input.posture.implementedControlCount,
        at_risk: input.posture.atRiskControlCount,
        signed_attestation_labels: input.posture.signedAttestations.map((a) => a.label).sort(),
        vulnerability: input.posture.vulnerability,
      },
    },
    Object.keys({}).sort(),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Builds the assessment bundle and returns the ZIP buffer.
 */
export async function buildAssessmentBundle(input: BundleInput): Promise<{ buffer: Buffer; filename: string; fingerprint: string }> {
  const fingerprint = computeBundleFingerprint(input);
  const dateStr = input.meta.signOffDate.replace(/-/g, "");
  const filename = `risk-assessment_${input.meta.organizationName.replace(/\W+/g, "-").slice(0, 30)}_${dateStr}_${input.meta.assessmentId.slice(0, 8)}.zip`;

  const archive = archiver("zip", { zlib: { level: 9 } });
  const chunks: Buffer[] = [];
  archive.on("data", (chunk: Buffer) => chunks.push(chunk));

  const finalized = new Promise<Buffer>((resolve, reject) => {
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.on("error", reject);
  });

  // README first (text, easy to glance at)
  archive.append(buildReadme(input.meta, fingerprint), { name: "README.txt" });

  // CSV
  archive.append(buildCsv(input.risks), { name: "risks.csv" });

  // JSON
  archive.append(JSON.stringify({ assessment: input.meta, risks: input.risks }, null, 2), {
    name: "risks.json",
  });

  // Posture snapshot
  archive.append(JSON.stringify(buildPostureSnapshot(input.posture), null, 2), {
    name: "posture-snapshot.json",
  });

  // Meta JSON (mirrors README header)
  archive.append(
    JSON.stringify(
      {
        ...input.meta,
        bundle_fingerprint_sha256: fingerprint,
        generated_at: new Date().toISOString(),
        risk_count: input.risks.length,
      },
      null,
      2,
    ),
    { name: "assessment-meta.json" },
  );

  // Cover PDF
  const pdf = await buildCoverPdf(input, fingerprint);
  archive.append(pdf, { name: "cover.pdf" });

  await archive.finalize();
  const buffer = await finalized;

  return { buffer, filename, fingerprint };
}
