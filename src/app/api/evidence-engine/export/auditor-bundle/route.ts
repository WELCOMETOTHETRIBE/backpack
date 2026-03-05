import { NextResponse } from "next/server";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import {
  governanceRegisters,
  governanceRegisterEntries,
  governanceRegisterEntryFiles,
  governanceEntryEvents,
} from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import archiver from "archiver";
import { getStorageService } from "@/lib/storage";
import { ensureEvidenceEngineRegistersForOrg, getRegisterStatsForOrgAndBoundary } from "@/lib/evidence-engine/control-dashboard";
import { computeScoring } from "@/lib/evidence-engine/scoring";
import { getEvidenceMap } from "@/data/cmmc/evidence-map";
import { getRegisterSchemas } from "@/data/cmmc/register-schemas";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import {
  getFieldLabelsAndSummaries,
  getSummaryTemplate,
  renderSummary,
  getFallbackSummary,
} from "@/data/cmmc/field-labels-and-summaries";
import { requireBoundaryForOrg } from "@/lib/evidence-engine/validate-boundary";

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

/** GET /api/evidence-engine/export/auditor-bundle — C3PAO auditor export ZIP (Admin only). Query: boundary_id (required). */
export async function GET(request: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin"]);

    const { searchParams } = new URL(request.url);
    const boundaryResult = await requireBoundaryForOrg(orgId, searchParams.get("boundary_id"));
    if (boundaryResult instanceof NextResponse) return boundaryResult;
    const { boundary } = boundaryResult;

    await ensureEvidenceEngineRegistersForOrg(orgId);
    const statsByRegister = await getRegisterStatsForOrgAndBoundary(orgId, boundary.id);
    const scoring = computeScoring(statsByRegister);

    const date = new Date().toISOString().slice(0, 10);
    const filename = `Evidence_Engine_Auditor_Bundle_${date}.zip`;

    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));

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

      const readme = [
        "Evidence Engine Auditor Bundle",
        "==============================",
        "",
        `Organization ID: ${orgId}`,
        `Boundary ID: ${boundary.id}`,
        `Export timestamp: ${new Date().toISOString()}`,
        "",
        "WARNING: This export must not contain CUI unless explicitly allowed.",
        "Only non-CUI or explicitly exportable items should be included.",
        "",
        "Contents:",
        "- boundary.json   Boundary metadata",
        "- evidence_model/  Artifact definitions (no CUI)",
        "- reports/        control_dashboard.csv, registers.csv, entries.csv",
        "- entries/        One JSON per entry (metadata, rendered summary, timeline, attachments)",
        "- attachments/    Exportable files or attachments_metadata.csv",
      ].join("\n");
      archive.append(readme, { name: "README.txt" });

      archive.append(
        JSON.stringify(
          {
            boundary_id: boundary.id,
            name: boundary.name,
            scope_components: boundary.scopeComponents ?? [],
            cloud_provider: boundary.cloudProvider ?? null,
            azure_environment: boundary.azureEnvironment ?? null,
            boundary_type: boundary.boundaryType ?? "cui_enclave",
          },
          null,
          2
        ),
        { name: "boundary.json" }
      );

      // ----- evidence_model/ -----
      const evidenceMap = getEvidenceMap();
      archive.append(JSON.stringify(evidenceMap, null, 2), { name: "evidence_model/evidence_map.json" });
      const registerSchemas = getRegisterSchemas();
      archive.append(JSON.stringify(registerSchemas, null, 2), { name: "evidence_model/register_entry_schemas.json" });
      const fieldLabels = getFieldLabelsAndSummaries();
      archive.append(JSON.stringify(fieldLabels, null, 2), { name: "evidence_model/field_labels_and_summaries.json" });
      const assessmentLogic = getControlAssessmentLogic();
      archive.append(JSON.stringify(assessmentLogic, null, 2), { name: "evidence_model/control_assessment_logic.json" });

      // ----- reports/control_dashboard.csv -----
      const controlHeader = ["control_id", "family", "control_status", "last_evidence_date", "next_due_date"];
      const controlRows = scoring.controls.map((c) => [
        c.controlId,
        c.family,
        c.controlStatus,
        c.lastEvidenceDate ? c.lastEvidenceDate.toISOString().slice(0, 10) : "",
        c.nextDueDate ? c.nextDueDate.toISOString().slice(0, 10) : "",
      ]);
      const controlCsv = [controlHeader.join(","), ...controlRows.map((r) => r.map(csvEscape).join(","))].join("\n");
      archive.append(controlCsv, { name: "reports/control_dashboard.csv" });

      // ----- reports/registers.csv -----
      const orgRegs = await db
        .select({ id: governanceRegisters.id, registerKey: governanceRegisters.registerKey, name: governanceRegisters.name })
        .from(governanceRegisters)
        .where(eq(governanceRegisters.organizationId, orgId));

      const entryCountByReg = new Map<string, number>();
      const lastFinalByReg = new Map<string, Date | null>();
      for (const reg of orgRegs) {
        const entries = await db
          .select({ id: governanceRegisterEntries.id, status: governanceRegisterEntries.status, finalizedAt: governanceRegisterEntries.finalizedAt })
          .from(governanceRegisterEntries)
          .where(and(eq(governanceRegisterEntries.registerId, reg.id), eq(governanceRegisterEntries.boundaryId, boundary.id)));
        entryCountByReg.set(reg.registerKey, entries.length);
        const lastFinal = entries
          .filter((e) => e.status === "final" && e.finalizedAt)
          .sort((a, b) => (b.finalizedAt!.getTime() - a.finalizedAt!.getTime()))
          [0]?.finalizedAt ?? null;
        lastFinalByReg.set(reg.registerKey, lastFinal);
      }

      const regHeader = ["register_key", "name", "entry_count", "last_finalized_at", "next_due", "due_status"];
      const regRows = orgRegs.map((r) => {
        const stats = statsByRegister.get(r.registerKey);
        return [
          r.registerKey,
          r.name ?? "",
          String(entryCountByReg.get(r.registerKey) ?? 0),
          lastFinalByReg.get(r.registerKey)?.toISOString() ?? "",
          stats?.nextDueAt?.toISOString().slice(0, 10) ?? "",
          stats?.registerHealth ?? "overdue",
        ];
      });
      const regCsv = [regHeader.join(","), ...regRows.map((r) => r.map(csvEscape).join(","))].join("\n");
      archive.append(regCsv, { name: "reports/registers.csv" });

      // ----- reports/entries.csv + entries/*.json + attachments (boundary-scoped) -----
      const allEntries = await db
        .select()
        .from(governanceRegisterEntries)
        .innerJoin(governanceRegisters, eq(governanceRegisterEntries.registerId, governanceRegisters.id))
        .where(
          and(
            eq(governanceRegisters.organizationId, orgId),
            eq(governanceRegisterEntries.boundaryId, boundary.id)
          )
        )
        .orderBy(desc(governanceRegisterEntries.createdAt));

      const entriesHeader = ["entry_id", "register_key", "entry_type", "status", "finalized_at", "created_at", "exportable", "attachment_count"];
      const entriesCsvRows: string[][] = [];
      const attachmentMetaRows: { fileId: string; originalFilename: string; sha256: string; exportable: string }[] = [];

      for (const row of allEntries) {
        const entry = row.governance_register_entries;
        const reg = row.governance_registers;
        const entryId = entry.id;

        const fileRows = await db
          .select()
          .from(governanceRegisterEntryFiles)
          .where(eq(governanceRegisterEntryFiles.registerEntryId, entryId));
        const attachmentCount = fileRows.length;

        entriesCsvRows.push([
          entryId,
          reg.registerKey,
          entry.entryType ?? "",
          entry.status,
          entry.finalizedAt?.toISOString() ?? "",
          entry.createdAt?.toISOString() ?? "",
          entry.exportable ? "true" : "false",
          String(attachmentCount),
        ]);

        const events = await db
          .select({
            eventAt: governanceEntryEvents.eventAt,
            actorUserId: governanceEntryEvents.actorUserId,
            eventType: governanceEntryEvents.eventType,
            eventJson: governanceEntryEvents.eventJson,
          })
          .from(governanceEntryEvents)
          .where(
            and(
              eq(governanceEntryEvents.entryId, entryId),
              eq(governanceEntryEvents.orgId, orgId),
              eq(governanceEntryEvents.boundaryId, boundary.id)
            )
          )
          .orderBy(desc(governanceEntryEvents.eventAt));

        const data = (entry.entryData ?? {}) as Record<string, unknown>;
        const entryType = entry.entryType ?? "unknown";
        const template = getSummaryTemplate(reg.registerKey, entryType);
        const rendered_summary = template ? renderSummary(template, data) : getFallbackSummary(entryType, data);

        const attachmentsMeta = fileRows.map((f) => ({
          id: f.id,
          originalFilename: f.originalFilename ?? "",
          sha256: f.sha256Hash ?? "",
          fileSize: f.fileSize ?? null,
          exportable: f.exportable,
        }));

        const entryJson = {
          id: entry.id,
          registerKey: reg.registerKey,
          entryType: entry.entryType ?? null,
          status: entry.status,
          finalizedAt: entry.finalizedAt?.toISOString() ?? null,
          createdAt: entry.createdAt?.toISOString() ?? null,
          exportable: entry.exportable,
          rendered_summary,
          timeline: events.map((e) => ({
            event_at: e.eventAt?.toISOString() ?? null,
            actor_user_id: e.actorUserId,
            event_type: e.eventType,
            event_json: e.eventJson,
          })),
          attachments: attachmentsMeta,
        };
        archive.append(JSON.stringify(entryJson, null, 2), { name: `entries/${entryId}.json` });

        for (const f of fileRows) {
          attachmentMetaRows.push({
            fileId: f.id,
            originalFilename: f.originalFilename ?? "",
            sha256: f.sha256Hash ?? "",
            exportable: f.exportable ? "true" : "false",
          });
          if (f.exportable && f.storageKey) {
            await addFileToZip(f.storageKey, `attachments/${f.id}_${(f.originalFilename ?? "file").replace(/[^a-zA-Z0-9._-]/g, "_")}`);
          }
        }
      }

      const entriesCsv = [entriesHeader.join(","), ...entriesCsvRows.map((r) => r.map(csvEscape).join(","))].join("\n");
      archive.append(entriesCsv, { name: "reports/entries.csv" });

      const attachHeader = ["file_id", "original_filename", "sha256", "exported"];
      const attachMetaCsv = [
        attachHeader.join(","),
        ...attachmentMetaRows.map((r) =>
          [r.fileId, r.originalFilename, r.sha256, r.exportable === "true" ? "yes" : "not exported"].map(csvEscape).join(",")
        ),
      ].join("\n");
      archive.append(attachMetaCsv, { name: "attachments/attachments_metadata.csv" });

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
