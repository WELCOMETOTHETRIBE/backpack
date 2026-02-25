import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import {
  organizations,
  controlRecords,
  governanceControlLinks,
  governanceDocuments,
  governanceDocumentVersions,
  governanceRegisters,
  governanceRegisterEntries,
  governanceEvidenceItems,
  governanceEvidenceFiles,
} from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import archiver from "archiver";
import { getStorageService } from "@/lib/storage";

function csvEscape(s: string | null | undefined): string {
  if (s == null) return "";
  const t = String(s);
  if (t.includes(",") || t.includes('"') || t.includes("\n")) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function safeZipName(prefix: string, name: string): string {
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${prefix}/${safe}`.slice(0, 120);
}

/** POST /api/governance/export — Generate assessor package ZIP (Admin only) */
export async function POST() {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin"]);

    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, orgId));
    const orgName = org?.name ?? "Organization";

    const date = new Date().toISOString().slice(0, 10);
    const filename = `Governance_Assessor_Package_${date}.zip`;

    const manifest: {
      scope: { organizationName: string; exportDate: string };
      artifacts: { path: string; sha256?: string }[];
    } = {
      scope: { organizationName: orgName, exportDate: new Date().toISOString() },
      artifacts: [],
    };

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));

    const storage = getStorageService();
    async function addFileToZip(
      key: string,
      zipPath: string,
      sha256?: string | null
    ): Promise<void> {
      try {
        const url = await storage.getDownloadUrl(key);
        const res = await fetch(url);
        if (!res.ok) return;
        const buf = Buffer.from(await res.arrayBuffer());
        archive.append(buf, { name: zipPath });
        if (sha256) manifest.artifacts.push({ path: zipPath, sha256 });
      } catch {
        // skip if storage not configured or fetch fails
      }
    }

    await new Promise<void>(async (resolve, reject) => {
      archive.on("end", resolve);
      archive.on("error", reject);

      // ----- Controls -----
      const records = await db
        .select({
          id: controlRecords.id,
          controlId: controlRecords.controlId,
          implementationStatus: controlRecords.implementationStatus,
          governanceNarrative: controlRecords.governanceNarrative,
        })
        .from(controlRecords)
        .where(eq(controlRecords.organizationId, orgId));

      const recordIds = records.map((r) => r.id);
      const allLinks = recordIds.length
        ? await db
            .select({
              controlRecordId: governanceControlLinks.controlRecordId,
              linkType: governanceControlLinks.linkType,
              linkId: governanceControlLinks.linkId,
            })
            .from(governanceControlLinks)
            .where(inArray(governanceControlLinks.controlRecordId, recordIds))
        : [];

      const linksByRecord = new Map<string, typeof allLinks>();
      for (const l of allLinks) {
        const list = linksByRecord.get(l.controlRecordId) ?? [];
        list.push(l);
        linksByRecord.set(l.controlRecordId, list);
      }

      for (const r of records) {
        const recLinks = linksByRecord.get(r.id) ?? [];
        const docLinks = recLinks.filter((l) => l.linkType === "document").map((l) => l.linkId);
        const registerLinks = recLinks.filter((l) => l.linkType === "register_entry").map((l) => l.linkId);
        const evidenceLinks = recLinks.filter((l) => l.linkType === "evidence").map((l) => l.linkId);
        const controlJson = JSON.stringify(
          {
            controlId: r.controlId,
            status: r.implementationStatus,
            implementation_statement: r.governanceNarrative ?? undefined,
            linkedDocumentIds: docLinks,
            linkedRegisterEntryIds: registerLinks,
            linkedEvidenceIds: evidenceLinks,
          },
          null,
          2
        );
        const path = `controls/${(r.controlId ?? "unknown").replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
        archive.append(controlJson, { name: path });
        manifest.artifacts.push({ path });
      }

      // ----- Documents (approved, latest version) -----
      const approvedDocs = await db
        .select()
        .from(governanceDocuments)
        .where(and(eq(governanceDocuments.organizationId, orgId), eq(governanceDocuments.status, "APPROVED")));

      for (const doc of approvedDocs) {
        const [latest] = await db
          .select()
          .from(governanceDocumentVersions)
          .where(eq(governanceDocumentVersions.documentId, doc.id))
          .orderBy(desc(governanceDocumentVersions.versionNumber))
          .limit(1);

        if (latest?.storageKey) {
          const ext = latest.originalFilename?.match(/\.[a-z0-9]+$/i)?.[0] ?? ".pdf";
          const zipPath = safeZipName("documents", `${doc.docId}${ext}`);
          await addFileToZip(latest.storageKey, zipPath, latest.sha256Hash ?? undefined);
        }
      }

      // ----- Registers (CSV per register) -----
      const orgRegisters = await db
        .select()
        .from(governanceRegisters)
        .where(eq(governanceRegisters.organizationId, orgId));

      for (const reg of orgRegisters) {
        const entries = await db
          .select()
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, reg.id))
          .orderBy(desc(governanceRegisterEntries.createdAt));

        const columns = (reg.requiredColumns as { key: string }[]) ?? [];
        const keys = columns.map((c) => c.key);
        const header = ["id", "created_at", "hold", ...keys];
        const rows = entries.map((e) => {
          const data = (e.entryData ?? {}) as Record<string, unknown>;
          return [
            e.id,
            e.createdAt?.toISOString() ?? "",
            e.hold ? "yes" : "no",
            ...keys.map((k) => (data[k] != null ? String(data[k]) : "")),
          ];
        });
        const csv = [header.join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
        const zipPath = `registers/${reg.registerKey}.csv`;
        archive.append(csv, { name: zipPath });
        manifest.artifacts.push({ path: zipPath });
      }

      // ----- Evidence files -----
      const evidenceItems = await db
        .select()
        .from(governanceEvidenceItems)
        .where(eq(governanceEvidenceItems.organizationId, orgId));

      for (const item of evidenceItems) {
        const files = await db
          .select()
          .from(governanceEvidenceFiles)
          .where(eq(governanceEvidenceFiles.evidenceItemId, item.id));

        for (let i = 0; i < files.length; i++) {
          const f = files[i]!;
          if (!f.storageKey) continue;
          const base = (f.originalFilename ?? `evidence-${item.id}`).replace(/[^a-zA-Z0-9._-]/g, "_");
          const zipPath = safeZipName("evidence", `${item.id}_${i}_${base}`);
          await addFileToZip(f.storageKey, zipPath, f.sha256Hash ?? undefined);
        }
      }

      // Manifest last
      archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

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
