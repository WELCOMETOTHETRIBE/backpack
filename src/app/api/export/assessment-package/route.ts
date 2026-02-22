import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import {
  controlImplementations,
  controls,
  controlFamilies,
  poamItems,
  evidenceMetadata,
  sspSections,
  assets,
  attestations,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import archiver from "archiver";

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

export async function POST() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `CMMC_Assessment_Package_${date}.zip`;

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

    const sctmCsv = toCSV(
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
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));

    await new Promise<void>((resolve, reject) => {
      archive.on("end", resolve);
      archive.on("error", reject);
      archive.append("System Security Plan (sections)\n\n", { name: "SSP_Overview.txt" });
      for (const s of sspList) {
        archive.append(`[${s.documentCode}] ${s.sectionKey}: ${s.title}\n${s.content ?? ""}\n\n`, {
          name: `SSP_${s.documentCode}_${s.sectionKey}.txt`,
        });
      }
      archive.append(sctmCsv, { name: "SCTM.csv" });
      archive.append(poamCsv, { name: "POAM.csv" });
      archive.append(evidenceCsv, { name: "Evidence_Index.csv" });
      archive.append(controlStatusCsv, { name: "Control_Status_Report.csv" });
      archive.append(toCSV(assetList.map((a) => ({ name: a.name, type: a.type, description: a.description }))), {
        name: "Asset_Inventory.csv",
      });
      archive.append(attestationCsv, { name: "Attestation_Logs.csv" });
      archive.append("Inheritance: see Control_Status_Report for status Inherited\n", { name: "Inheritance_Matrix.txt" });
      archive.append(poamCsv, { name: "Risk_Register.csv" });
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
