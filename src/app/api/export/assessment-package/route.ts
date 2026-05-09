import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import {
  controlRecords,
  controls,
  controlFamilies,
  roles,
  artifacts,
  technicalEvidence,
  controlImplementations,
  controlEvidenceLinks,
  poamItems,
  poamEntries,
  evidenceMetadata,
  sspSections,
  assets,
  attestations,
  organizations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import archiver from "archiver";
import { ALL_CONTROL_IDS } from "@/lib/artifact-guide";
import { getStorageService } from "@/lib/storage";

function csvEscape(s: string | null | undefined): string {
  if (s == null) return "";
  const t = String(s);
  if (t.includes(",") || t.includes('"') || t.includes("\n")) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]!);
  return [keys.join(","), ...rows.map((r) => keys.map((k) => csvEscape(r[k] as string)).join(","))].join("\n");
}

function safeZipName(prefix: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}/${safe}`.slice(0, 120);
}

/** Human-readable status label for the manifest. */
function statusLabel(s: string): string {
  const map: Record<string, string> = {
    not_started: "Not Started",
    in_progress: "In Progress",
    implemented: "Implemented",
    assessed: "Assessed",
    inherited: "Inherited",
    not_applicable: "Not Applicable",
  };
  return map[s] ?? s;
}

export async function POST() {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `CMMC_Assessment_Package_${date}.zip`;

    // ----- Org metadata (for SSP header + manifest) -----
    const [org] = await db
      .select({
        name: organizations.name,
        systemName: organizations.systemName,
        systemDescription: organizations.systemDescription,
        authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
        systemOwnerName: organizations.systemOwnerName,
        systemOwnerEmail: organizations.systemOwnerEmail,
        issoName: organizations.issoName,
        issoEmail: organizations.issoEmail,
        cuiCategories: organizations.cuiCategories,
        externalServiceProviders: organizations.externalServiceProviders,
        boundaryNarrative: organizations.boundaryNarrative,
        boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
        cageCode: organizations.cageCode,
        cmmcTargetLevel: organizations.cmmcTargetLevel,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    // ----- Unified 110 control records -----
    const records = await db
      .select({
        id: controlRecords.id,
        controlId: controlRecords.controlId,
        implementationStatus: controlRecords.implementationStatus,
        governanceNarrative: controlRecords.governanceNarrative,
        technicalNarrative: controlRecords.technicalNarrative,
        responsibleRoleId: controlRecords.responsibleRoleId,
        title: controls.title,
        roleName: roles.name,
      })
      .from(controlRecords)
      .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
      .leftJoin(roles, eq(controlRecords.responsibleRoleId, roles.id))
      .where(eq(controlRecords.organizationId, orgId));

    const recordByControlId: Record<string, (typeof records)[0]> = {};
    for (const r of records) recordByControlId[r.controlId] = r;

    const allArtifacts = await db
      .select({
        controlRecordId: artifacts.controlRecordId,
        artifactLabel: artifacts.artifactLabel,
        fileName: artifacts.fileName,
        fileUrl: artifacts.fileUrl,
        storageKey: artifacts.storageKey,
      })
      .from(artifacts)
      .where(eq(artifacts.organizationId, orgId));

    const allTechEvidence = await db
      .select({
        controlRecordId: technicalEvidence.controlRecordId,
        requirementId: technicalEvidence.requirementId,
        description: technicalEvidence.description,
        fileUrl: technicalEvidence.fileUrl,
        sourceUrl: technicalEvidence.sourceUrl,
      })
      .from(technicalEvidence)
      .where(eq(technicalEvidence.organizationId, orgId));

    const recordIdToControlId: Record<string, string> = {};
    for (const r of records) recordIdToControlId[r.id] = r.controlId;

    const artifactsByRecord = new Map<string, typeof allArtifacts>();
    for (const a of allArtifacts) {
      const list = artifactsByRecord.get(a.controlRecordId) ?? [];
      list.push(a);
      artifactsByRecord.set(a.controlRecordId, list);
    }
    const techByRecord = new Map<string, typeof allTechEvidence>();
    for (const t of allTechEvidence) {
      const list = techByRecord.get(t.controlRecordId) ?? [];
      list.push(t);
      techByRecord.set(t.controlRecordId, list);
    }

    // ----- SSP document — with org metadata header -----
    type ExtProvider = { name: string; serviceType: string; dataTypes: string[]; inheritedControls: string[]; website?: string };
    const providers = (org?.externalServiceProviders ?? []) as ExtProvider[];
    const cuiCategories = (org?.cuiCategories ?? []) as string[];

    const sspLines: string[] = [
      "# System Security Plan",
      "",
      `**Organization:** ${org?.name ?? "Unknown"}`,
      `**System Name:** ${org?.systemName ?? "Not set"}`,
      ...(org?.systemDescription ? [`**System Description:** ${org.systemDescription}`, ""] : []),
      ...(org?.cageCode ? [`**CAGE Code:** ${org.cageCode}`, ""] : []),
      ...(org?.cmmcTargetLevel ? [`**CMMC Target Level:** ${org.cmmcTargetLevel}`, ""] : []),
      `**Generated:** ${new Date().toISOString()}`,
      "",
      "---",
      "",
      "## System Identification",
      "",
    ];

    if (org?.systemOwnerName || org?.systemOwnerEmail) {
      sspLines.push(`**System Owner:** ${org?.systemOwnerName ?? ""}${org?.systemOwnerEmail ? ` (${org.systemOwnerEmail})` : ""}`);
    }
    if (org?.issoName || org?.issoEmail) {
      sspLines.push(`**ISSO:** ${org?.issoName ?? ""}${org?.issoEmail ? ` (${org.issoEmail})` : ""}`);
    }
    sspLines.push("");

    if (cuiCategories.length > 0) {
      sspLines.push("## CUI Categories");
      sspLines.push("");
      for (const cat of cuiCategories) sspLines.push(`- ${cat}`);
      sspLines.push("");
    }

    if (org?.authorizationBoundaryStatement) {
      sspLines.push("## Authorization Boundary Statement");
      sspLines.push("");
      sspLines.push(org.authorizationBoundaryStatement);
      sspLines.push("");
    }

    if (org?.boundaryNarrative) {
      sspLines.push("## Network & Boundary Narrative");
      sspLines.push("");
      sspLines.push(org.boundaryNarrative);
      sspLines.push("");
    }

    if (providers.length > 0) {
      sspLines.push("## External Service Providers");
      sspLines.push("");
      for (const p of providers) {
        sspLines.push(`### ${p.name} (${p.serviceType})`);
        if (p.website) sspLines.push(`Documentation: ${p.website}`);
        if (p.dataTypes.length > 0) sspLines.push(`CUI Types: ${p.dataTypes.join(", ")}`);
        if (p.inheritedControls.length > 0) {
          sspLines.push(`Inherited Controls (${p.inheritedControls.length}): ${p.inheritedControls.join(", ")}`);
        }
        sspLines.push("");
      }
    }

    sspLines.push("---");
    sspLines.push("");
    sspLines.push("## Control Narratives");
    sspLines.push("");
    sspLines.push("*One section per NIST SP 800-171 Rev 2 control.*");
    sspLines.push("");
    sspLines.push("---");
    sspLines.push("");

    for (const controlId of ALL_CONTROL_IDS) {
      const r = recordByControlId[controlId];
      const title = r?.title ?? controlId;
      const gov = r?.governanceNarrative?.trim() ?? "";
      const tech = r?.technicalNarrative?.trim() ?? "";
      const status = r?.implementationStatus ?? "not_started";
      sspLines.push(`## ${controlId} — ${title}`);
      sspLines.push("");
      sspLines.push(`**Status:** ${statusLabel(status)}`);
      if (r?.roleName) sspLines.push(`**Responsible Role:** ${r.roleName}`);
      sspLines.push("");
      if (gov) {
        sspLines.push("### Governance narrative");
        sspLines.push("");
        sspLines.push(gov);
        sspLines.push("");
      }
      if (tech) {
        sspLines.push("### Technical narrative");
        sspLines.push("");
        sspLines.push(tech);
        sspLines.push("");
      }
      if (!gov && !tech) sspLines.push("*No narrative yet.*");
      sspLines.push("");
      sspLines.push("---");
      sspLines.push("");
    }
    const sspMarkdown = sspLines.join("\n");

    // SSP HTML
    const sspHtmlParts: string[] = [
      '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>System Security Plan</title>',
      "<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1.5rem;color:#1a202c;}",
      "h1{border-bottom:3px solid #1e3a5f;padding-bottom:.5rem;color:#1e3a5f;}",
      "h2{margin-top:2rem;color:#1e3a5f;border-bottom:1px solid #e2e8f0;padding-bottom:.25rem;}",
      "h3{margin-top:1rem;color:#2d3748;} .status{display:inline-block;padding:.2rem .6rem;border-radius:.25rem;font-size:.8rem;font-weight:600;}",
      ".status-implemented{background:#d1fae5;color:#065f46;} .status-inherited{background:#ccfbf1;color:#0f766e;}",
      ".status-assessed{background:#ede9fe;color:#5b21b6;} .status-in_progress{background:#dbeafe;color:#1d4ed8;}",
      ".status-not_started{background:#f3f4f6;color:#374151;} .status-not_applicable{background:#f1f5f9;color:#475569;}",
      "pre{white-space:pre-wrap;background:#f8fafc;padding:1rem;border-radius:.5rem;border:1px solid #e2e8f0;font-size:.85rem;}",
      ".meta{background:#f0f4f8;border-left:4px solid #1e3a5f;padding:1rem 1.5rem;margin:1.5rem 0;border-radius:0 .5rem .5rem 0;}",
      ".meta dl{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;} .meta dt{font-weight:600;font-size:.8rem;color:#64748b;text-transform:uppercase;letter-spacing:.05em;}",
      ".provider{border:1px solid #e2e8f0;border-radius:.5rem;padding:1rem;margin:.5rem 0;}",
      ".tag{display:inline-block;background:#f0fdfa;color:#0f766e;padding:.15rem .5rem;border-radius:.25rem;font-size:.75rem;font-family:monospace;margin:.1rem;}</style></head><body>",
      "<h1>System Security Plan</h1>",
    ];

    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    // Org metadata block
    sspHtmlParts.push('<div class="meta"><dl>');
    sspHtmlParts.push(`<dt>Organization</dt><dd>${esc(org?.name ?? "")}</dd>`);
    sspHtmlParts.push(`<dt>System Name</dt><dd>${esc(org?.systemName ?? "Not set")}</dd>`);
    if (org?.systemOwnerName) sspHtmlParts.push(`<dt>System Owner</dt><dd>${esc(org.systemOwnerName)}${org.systemOwnerEmail ? ` &lt;${esc(org.systemOwnerEmail)}&gt;` : ""}</dd>`);
    if (org?.issoName) sspHtmlParts.push(`<dt>ISSO</dt><dd>${esc(org.issoName)}${org.issoEmail ? ` &lt;${esc(org.issoEmail)}&gt;` : ""}</dd>`);
    if (org?.cageCode) sspHtmlParts.push(`<dt>CAGE Code</dt><dd>${esc(org.cageCode)}</dd>`);
    sspHtmlParts.push(`<dt>Generated</dt><dd>${new Date().toLocaleDateString()}</dd>`);
    sspHtmlParts.push("</dl></div>");

    if (org?.authorizationBoundaryStatement) {
      sspHtmlParts.push("<h2>Authorization Boundary Statement</h2>");
      sspHtmlParts.push(`<pre>${esc(org.authorizationBoundaryStatement)}</pre>`);
    }
    if (org?.boundaryNarrative) {
      sspHtmlParts.push("<h2>Network &amp; Boundary Narrative</h2>");
      sspHtmlParts.push(`<pre>${esc(org.boundaryNarrative)}</pre>`);
    }
    if (cuiCategories.length > 0) {
      sspHtmlParts.push("<h2>CUI Categories</h2>");
      sspHtmlParts.push(`<ul>${cuiCategories.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`);
    }
    if (providers.length > 0) {
      sspHtmlParts.push("<h2>External Service Providers</h2>");
      for (const p of providers) {
        sspHtmlParts.push(`<div class="provider"><strong>${esc(p.name)}</strong> — ${esc(p.serviceType)}`);
        if (p.inheritedControls.length > 0) {
          sspHtmlParts.push(`<br><strong>Inherited controls:</strong> ${p.inheritedControls.map((c) => `<span class="tag">${esc(c)}</span>`).join(" ")}`);
        }
        sspHtmlParts.push("</div>");
      }
    }

    sspHtmlParts.push("<h2>Control Narratives</h2><p><em>One section per NIST SP 800-171 Rev 2 control.</em></p>");
    for (const controlId of ALL_CONTROL_IDS) {
      const r = recordByControlId[controlId];
      const title = r?.title ?? controlId;
      const gov = r?.governanceNarrative?.trim() ?? "";
      const tech = r?.technicalNarrative?.trim() ?? "";
      const status = r?.implementationStatus ?? "not_started";
      sspHtmlParts.push(`<h2>${esc(controlId)} — ${esc(title)}</h2>`);
      sspHtmlParts.push(`<p><span class="status status-${status}">${esc(statusLabel(status))}</span>`);
      if (r?.roleName) sspHtmlParts.push(` &nbsp; <em>Role: ${esc(r.roleName)}</em>`);
      sspHtmlParts.push("</p>");
      if (gov) { sspHtmlParts.push("<h3>Governance narrative</h3>"); sspHtmlParts.push(`<pre>${esc(gov)}</pre>`); }
      if (tech) { sspHtmlParts.push("<h3>Technical narrative</h3>"); sspHtmlParts.push(`<pre>${esc(tech)}</pre>`); }
      if (!gov && !tech) sspHtmlParts.push("<p><em>No narrative yet.</em></p>");
    }
    sspHtmlParts.push("</body></html>");
    const sspHtml = sspHtmlParts.join("\n");

    // ----- SCTM (unified) -----
    const sctmRows = ALL_CONTROL_IDS.map((controlId) => {
      const r = recordByControlId[controlId];
      const recId = r?.id;
      const artList = recId ? artifactsByRecord.get(recId) ?? [] : [];
      const techList = recId ? techByRecord.get(recId) ?? [] : [];
      return {
        controlId,
        status: statusLabel(r?.implementationStatus ?? "not_started"),
        responsibleRole: r?.roleName ?? "",
        governanceArtifacts: artList.map((a) => `${a.artifactLabel}: ${a.fileUrl}`).join("; "),
        technicalEvidence: techList.map((t) => `${t.requirementId ?? t.description ?? "file"}: ${t.fileUrl || t.sourceUrl || ""}`).join("; "),
      };
    });
    const sctmCsvUnified = toCSV(sctmRows);

    const sctmDocumentRows = ALL_CONTROL_IDS.map((controlId) => {
      const r = recordByControlId[controlId];
      const recId = r?.id;
      const artList = recId ? artifactsByRecord.get(recId) ?? [] : [];
      const techList = recId ? techByRecord.get(recId) ?? [] : [];
      return {
        "Control ID": controlId,
        "Control Name": r?.title ?? controlId,
        "Implementation Status": statusLabel(r?.implementationStatus ?? "not_started"),
        "Responsible Role": r?.roleName ?? "",
        "Governance Artifacts": artList.map((a) => a.artifactLabel).join(", "),
        "Technical Evidence": techList.map((t) => t.requirementId || t.description || "—").join("; "),
      };
    });
    const sctmDocumentCsv = toCSV(sctmDocumentRows);

    // ----- Legacy data -----
    const impls = await db
      .select({
        controlId: controls.controlId,
        title: controls.title,
        familyCode: controlFamilies.code,
        status: controlImplementations.status,
        implementationNarrative: controlImplementations.implementationNarrative,
        policySopRefs: controlImplementations.policySopRefs,
      })
      .from(controlImplementations)
      .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
      .innerJoin(controlFamilies, eq(controls.controlFamilyId, controlFamilies.id))
      .where(eq(controlImplementations.organizationId, orgId));

    // ----- POA&M (legacy model) -----
    const poamList = await db
      .select({
        poamId: poamItems.poamId,
        title: poamItems.title,
        status: poamItems.status,
        riskSeverity: poamItems.riskSeverity,
        targetCompletionDate: poamItems.targetCompletionDate,
      })
      .from(poamItems)
      .where(eq(poamItems.organizationId, orgId));

    // ----- POA&M (new model) -----
    const poamNewList = await db
      .select({
        id: poamEntries.id,
        status: poamEntries.status,
        weaknessDescription: poamEntries.weaknessDescription,
        remediationPlan: poamEntries.remediationPlan,
        scheduledCompletionDate: poamEntries.scheduledCompletionDate,
        closedAt: poamEntries.closedAt,
        createdAt: poamEntries.createdAt,
        controlId: controlRecords.controlId,
      })
      .from(poamEntries)
      .leftJoin(controlRecords, eq(poamEntries.controlRecordId, controlRecords.id))
      .where(eq(poamEntries.organizationId, orgId));

    // ----- Evidence (legacy) -----
    const evidenceList = await db
      .select()
      .from(evidenceMetadata)
      .where(eq(evidenceMetadata.organizationId, orgId));

    // ----- Evidence (new controlEvidenceLinks) -----
    const evidenceLinkList = await db
      .select({
        runId: controlEvidenceLinks.runId,
        filePath: controlEvidenceLinks.filePath,
        sha256Hash: controlEvidenceLinks.sha256Hash,
        source: controlEvidenceLinks.source,
        description: controlEvidenceLinks.description,
        linkedAt: controlEvidenceLinks.linkedAt,
        expiresAt: controlEvidenceLinks.expiresAt,
        controlId: controlRecords.controlId,
        controlTitle: controls.title,
      })
      .from(controlEvidenceLinks)
      .leftJoin(controlRecords, eq(controlEvidenceLinks.controlRecordId, controlRecords.id))
      .leftJoin(controls, eq(controlRecords.controlId, controls.controlId))
      .where(eq(controlEvidenceLinks.organizationId, orgId));

    const now = new Date();
    const evidenceLinkRows = evidenceLinkList.map((e) => {
      let evStatus = "Valid";
      if (e.expiresAt) {
        if (e.expiresAt < now) evStatus = "Expired";
        else if (e.expiresAt.getTime() - now.getTime() < 30 * 86_400_000) evStatus = "Expiring Soon";
      }
      return {
        "Control ID": e.controlId ?? "",
        "Control Title": e.controlTitle ?? "",
        "Run ID": e.runId,
        "File Path": e.filePath,
        "SHA-256": e.sha256Hash,
        Source: e.source ?? "",
        Description: e.description ?? "",
        "Linked At": e.linkedAt?.toISOString() ?? "",
        "Expires At": e.expiresAt?.toISOString() ?? "",
        Status: evStatus,
        "Is Inherited": e.runId.startsWith("INHERITED-") ? "Yes" : "No",
      };
    });
    const evidenceLinkCsv = toCSV(evidenceLinkRows);

    // ----- SSP sections -----
    const sspList = await db
      .select()
      .from(sspSections)
      .where(eq(sspSections.organizationId, orgId));

    const assetList = await db.select().from(assets).where(eq(assets.organizationId, orgId));
    const attestationList = await db.select().from(attestations).where(eq(attestations.organizationId, orgId));

    const sctmCsvLegacy = toCSV(
      impls.map((i) => ({
        controlId: i.controlId,
        family: i.familyCode,
        title: i.title,
        status: i.status,
        policySopRefs: i.policySopRefs,
      }))
    );
    const poamCsv = toCSV(
      poamList.map((p) => ({ ...p, targetCompletionDate: p.targetCompletionDate?.toString() }))
    );
    const poamNewCsv = toCSV(
      poamNewList.map((p) => ({
        id: p.id,
        controlId: p.controlId ?? "",
        status: p.status,
        weaknessDescription: p.weaknessDescription ?? "",
        remediationPlan: p.remediationPlan ?? "",
        scheduledCompletionDate: p.scheduledCompletionDate ?? "",
        closedAt: p.closedAt?.toISOString() ?? "",
        createdAt: p.createdAt?.toISOString() ?? "",
      }))
    );
    const evidenceCsv = toCSV(
      evidenceList.map((e) => ({
        evidenceId: e.evidenceId,
        runId: e.runId,
        artifactFilename: e.artifactFilename,
        storageLocation: e.storageLocation,
        sha256Hash: e.sha256Hash,
        retentionUntil: e.retentionUntil?.toString(),
      }))
    );
    const controlStatusCsv = toCSV(
      impls.map((i) => ({
        controlId: i.controlId,
        status: i.status,
        title: i.title,
      }))
    );
    const attestationCsv = toCSV(
      attestationList.map((a) => ({
        attestationType: a.attestationType,
        resourceType: a.resourceType,
        resourceId: a.resourceId,
        attestedAt: a.attestedAt?.toString(),
      }))
    );

    // ----- Assessment readiness + control summary (for manifest) -----
    const statusCounts = {
      total: ALL_CONTROL_IDS.length,
      implemented: 0,
      inherited: 0,
      assessed: 0,
      inProgress: 0,
      notApplicable: 0,
      notStarted: 0,
    };
    for (const controlId of ALL_CONTROL_IDS) {
      const s = recordByControlId[controlId]?.implementationStatus ?? "not_started";
      if (s === "implemented") statusCounts.implemented++;
      else if (s === "inherited") statusCounts.inherited++;
      else if (s === "assessed") statusCounts.assessed++;
      else if (s === "in_progress") statusCounts.inProgress++;
      else if (s === "not_applicable") statusCounts.notApplicable++;
      else statusCounts.notStarted++;
    }

    const implementedPct = Math.round(
      ((statusCounts.implemented + statusCounts.inherited + statusCounts.assessed) / statusCounts.total) * 100
    );
    // Per the customer's "outstanding → POA&M" rule, anything not
    // closed counts as outstanding work the assessor must evaluate —
    // including auto-created drafts. Otherwise the export package
    // under-reports the work surface relative to the dashboard.
    const openPoamCount = poamNewList.filter((p) => p.status !== "closed").length;
    const expiredEvidenceCount = evidenceLinkList.filter(
      (e) => e.expiresAt && e.expiresAt < now
    ).length;
    const sspAuthoredSections = sspList.filter((s) => s.content && s.content.trim().length > 0).length;
    const boundaryComplete = !!org?.boundaryScopingCompletedAt;
    const readinessScore =
      (boundaryComplete ? 20 : 0) +
      (sspAuthoredSections >= 3 ? 20 : 0) +
      (implementedPct >= 80 ? 30 : 0) +
      (openPoamCount === 0 ? 15 : 0) +
      (expiredEvidenceCount === 0 ? 15 : 0);

    // ----- manifest.json -----
    const manifest = {
      organization: org?.name ?? "",
      cageCode: org?.cageCode ?? null,
      systemName: org?.systemName ?? null,
      systemOwner: org?.systemOwnerName ?? null,
      isso: org?.issoName ?? null,
      exportedAt: new Date().toISOString(),
      exportedBy: (user as { email?: string }).email ?? null,
      cmmc_level: 2,
      nist_revision: "SP 800-171 Rev 2",
      boundaryScopingCompleted: boundaryComplete,
      artifacts: [
        "System_Security_Plan.html",
        "SSP_Document.md",
        "Security_Control_Traceability_Matrix.csv",
        "SCTM.csv",
        "POAM.csv",
        "POAM_Detailed.csv",
        "Evidence_Index.csv",
        "Evidence_Links.csv",
        "Control_Status_Report.csv",
        "Asset_Inventory.csv",
        "Attestation_Logs.csv",
      ],
      assessmentReadinessScore: readinessScore,
      controlsSummary: {
        total: statusCounts.total,
        implemented: statusCounts.implemented,
        inherited: statusCounts.inherited,
        assessed: statusCounts.assessed,
        inProgress: statusCounts.inProgress,
        notApplicable: statusCounts.notApplicable,
        notStarted: statusCounts.notStarted,
        implementedOrInheritedPct: implementedPct,
      },
      openPoamCount,
      expiredEvidenceCount,
    };

    // ----- Build ZIP -----
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => { chunks.push(chunk); });

    const storage = getStorageService();
    async function addFileToZip(key: string, zipPath: string): Promise<void> {
      try {
        const url = await storage.getDownloadUrl(key);
        const res = await fetch(url);
        if (!res.ok) return;
        const buf = Buffer.from(await res.arrayBuffer());
        archive.append(buf, { name: zipPath });
      } catch {
        // skip if storage not configured or fetch fails
      }
    }

    await new Promise<void>(async (resolve, reject) => {
      archive.on("end", resolve);
      archive.on("error", reject);

      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
      archive.append(sspHtml, { name: "System_Security_Plan.html" });
      archive.append(sspMarkdown, { name: "SSP_Document.md" });

      // SSP legacy sections
      archive.append("System Security Plan (legacy sections)\n\n", { name: "SSP_Overview.txt" });
      for (const s of sspList) {
        archive.append(
          `[${s.documentCode}] ${s.sectionKey}: ${s.title}\n${s.content ?? ""}\n\n`,
          { name: `SSP_${s.documentCode}_${s.sectionKey}.txt` }
        );
      }

      archive.append(sctmDocumentCsv, { name: "Security_Control_Traceability_Matrix.csv" });
      archive.append(sctmCsvUnified, { name: "SCTM.csv" });
      archive.append(sctmCsvLegacy, { name: "SCTM_Legacy.csv" });
      archive.append(poamCsv, { name: "POAM.csv" });
      archive.append(poamNewCsv, { name: "POAM_Detailed.csv" });
      archive.append(evidenceCsv, { name: "Evidence_Index.csv" });
      archive.append(evidenceLinkCsv, { name: "Evidence_Links.csv" });
      archive.append(controlStatusCsv, { name: "Control_Status_Report.csv" });
      archive.append(
        toCSV(assetList.map((a) => ({ name: a.name, type: a.type, description: a.description }))),
        { name: "Asset_Inventory.csv" }
      );
      archive.append(attestationCsv, { name: "Attestation_Logs.csv" });

      // evidence/ folder: all uploaded governance artifacts
      const zipPromises: Promise<void>[] = [];
      for (const a of allArtifacts) {
        if (!a.storageKey) continue;
        const controlId = recordIdToControlId[a.controlRecordId] ?? "unknown";
        const zipPath = safeZipName(
          "evidence",
          `${controlId}_${a.artifactLabel.replace(/\s+/g, "_")}_${a.fileName}`
        );
        zipPromises.push(addFileToZip(a.storageKey, zipPath));
      }
      await Promise.all(zipPromises);

      archive.finalize();
    });

    const buffer = Buffer.concat(chunks);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unauthorized";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
