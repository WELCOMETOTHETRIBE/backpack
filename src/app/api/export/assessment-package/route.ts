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
  poamItems,
  evidenceMetadata,
  sspSections,
  assets,
  attestations,
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

export async function POST() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `CMMC_Assessment_Package_${date}.zip`;

    // ----- Unified 110 control records (SSP + SCTM source) -----
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

    // SSP document (live from control records)
    const sspLines: string[] = [
      "# System Security Plan",
      "",
      "Generated from control records. One section per NIST SP 800-171 Rev 2 control.",
      "",
      "---",
      "",
    ];
    for (const controlId of ALL_CONTROL_IDS) {
      const r = recordByControlId[controlId];
      const title = r?.title ?? controlId;
      const gov = r?.governanceNarrative?.trim() ?? "";
      const tech = r?.technicalNarrative?.trim() ?? "";
      const status = r?.implementationStatus ?? "not_started";
      sspLines.push(`## ${controlId} — ${title}`);
      sspLines.push("");
      sspLines.push(`**Status:** ${status}`);
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

    // SCTM: control, status, responsible role, governance artifacts (labels + URLs), technical evidence (URLs)
    const sctmRows = ALL_CONTROL_IDS.map((controlId) => {
      const r = recordByControlId[controlId];
      const recId = r?.id;
      const artList = recId ? artifactsByRecord.get(recId) ?? [] : [];
      const techList = recId ? techByRecord.get(recId) ?? [] : [];
      return {
        controlId,
        status: r?.implementationStatus ?? "not_started",
        responsibleRole: r?.roleName ?? "",
        governanceArtifacts: artList.map((a) => `${a.artifactLabel}: ${a.fileUrl}`).join("; "),
        technicalEvidence: techList.map((t) => `${t.requirementId ?? t.description ?? "file"}: ${t.fileUrl || t.sourceUrl || ""}`).join("; "),
      };
    });
    const sctmCsvUnified = toCSV(sctmRows);

    // Legacy data (keep for backward compat)
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

    const evidenceList = await db
      .select()
      .from(evidenceMetadata)
      .where(eq(evidenceMetadata.organizationId, orgId));

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
    const poamCsv = toCSV(poamList.map((p) => ({ ...p, targetCompletionDate: p.targetCompletionDate?.toString() })));
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

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => { chunks.push(chunk); });

    // Fetch file from storage and add to archive (best-effort)
    const storage = getStorageService();
    async function addFileToZip(
      key: string,
      zipPath: string
    ): Promise<void> {
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

      archive.append(sspMarkdown, { name: "SSP_Document.md" });
      archive.append("System Security Plan (legacy sections)\n\n", { name: "SSP_Overview.txt" });
      for (const s of sspList) {
        archive.append(`[${s.documentCode}] ${s.sectionKey}: ${s.title}\n${s.content ?? ""}\n\n`, {
          name: `SSP_${s.documentCode}_${s.sectionKey}.txt`,
        });
      }
      archive.append(sctmCsvUnified, { name: "SCTM.csv" });
      archive.append(sctmCsvLegacy, { name: "SCTM_Legacy.csv" });
      archive.append(poamCsv, { name: "POAM.csv" });
      archive.append(evidenceCsv, { name: "Evidence_Index.csv" });
      archive.append(controlStatusCsv, { name: "Control_Status_Report.csv" });
      archive.append(toCSV(assetList.map((a) => ({ name: a.name, type: a.type, description: a.description }))), {
        name: "Asset_Inventory.csv",
      });
      archive.append(attestationCsv, { name: "Attestation_Logs.csv" });
      archive.append("Inheritance: see Control_Status_Report for status Inherited\n", { name: "Inheritance_Matrix.txt" });
      archive.append(poamCsv, { name: "Risk_Register.csv" });

      // Zip of governance artifacts (with storageKey); technical evidence has no storageKey in DB so only artifacts
      const zipPromises: Promise<void>[] = [];
      for (const a of allArtifacts) {
        if (!a.storageKey) continue;
        const controlId = recordIdToControlId[a.controlRecordId] ?? "unknown";
        const zipPath = safeZipName("governance", `${controlId}_${a.artifactLabel.replace(/\s+/g, "_")}_${a.fileName}`);
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
