import { NextResponse } from "next/server";
import { db } from "@/db";
import { governanceDocuments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { logGovernanceAudit } from "@/lib/governance/audit";
import { GOVERNANCE_DOCUMENT_MATRIX } from "@/lib/governance/governance-document-matrix";

/**
 * Infer the governance document type from the MACTech filename.
 *   MAC-POL-xxx  → POLICY
 *   MAC-SOP-xxx  → SOP / PROCEDURE
 *   MAC-PLN-xxx  → PLAN
 *   MAC-CMP-xxx  → STANDARD
 *   MAC-STD-xxx  → STANDARD
 *   Others       → TEMPLATE
 */
function inferDocType(mactechPath: string): "POLICY" | "SOP" | "PLAN" | "STANDARD" | "PROCEDURE" | "TEMPLATE" {
  const basename = mactechPath.split("/").pop() ?? mactechPath;
  if (basename.startsWith("MAC-POL-")) return "POLICY";
  if (basename.startsWith("MAC-SOP-")) return "PROCEDURE";
  if (basename.startsWith("MAC-PLN-")) return "PLAN";
  if (basename.startsWith("MAC-CMP-") || basename.startsWith("MAC-STD-")) return "STANDARD";
  return "TEMPLATE";
}

/**
 * Extract a MAC-xxx-NNN document ID from the MACTech path.
 */
function extractDocId(mactechPath: string): string {
  const basename = mactechPath.split("/").pop() ?? mactechPath;
  const match = basename.match(/^(MAC-[A-Z]+-\d+)/);
  return match ? match[1] : basename.replace(/\.[^.]+$/, "");
}

/**
 * POST /api/governance/documents/bulk-seed-vault
 *
 * Seeds all governance documents from the MacTech Vault governance matrix.
 * Only creates documents that don't already exist (by docId).
 * Sets status to DRAFT so users can review, tailor, and approve.
 */
export async function POST() {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    // Get existing docs to avoid duplicates
    const existing = await db
      .select({ docId: governanceDocuments.docId })
      .from(governanceDocuments)
      .where(eq(governanceDocuments.organizationId, orgId));

    const existingDocIds = new Set(existing.map((d) => d.docId));

    let created = 0;
    let skipped = 0;

    for (const row of GOVERNANCE_DOCUMENT_MATRIX) {
      // Only seed documents that have a MacTech artifact path
      if (!row.mactechDocument || row.missing) {
        skipped++;
        continue;
      }

      const docId = extractDocId(row.mactechDocument);

      // Skip if already exists
      if (existingDocIds.has(docId)) {
        skipped++;
        continue;
      }

      const type = inferDocType(row.mactechDocument);

      // Infer domain from the document name
      const domain = row.document.toLowerCase().includes("access") ? "AC" :
        row.document.toLowerCase().includes("awareness") || row.document.toLowerCase().includes("training") ? "AT" :
        row.document.toLowerCase().includes("audit") ? "AU" :
        row.document.toLowerCase().includes("config") ? "CM" :
        row.document.toLowerCase().includes("identification") || row.document.toLowerCase().includes("authenticat") ? "IA" :
        row.document.toLowerCase().includes("incident") ? "IR" :
        row.document.toLowerCase().includes("maintenance") ? "MA" :
        row.document.toLowerCase().includes("media") ? "MP" :
        row.document.toLowerCase().includes("personnel") || row.document.toLowerCase().includes("screening") ? "PS" :
        row.document.toLowerCase().includes("physical") || row.document.toLowerCase().includes("facility") ? "PE" :
        row.document.toLowerCase().includes("risk") || row.document.toLowerCase().includes("assessment") ? "RA" :
        row.document.toLowerCase().includes("security") && row.document.toLowerCase().includes("plan") ? "CA" :
        row.document.toLowerCase().includes("system") && row.document.toLowerCase().includes("comm") ? "SC" :
        row.document.toLowerCase().includes("integrity") ? "SI" :
        null;

      await db.insert(governanceDocuments).values({
        organizationId: orgId,
        docId,
        title: row.document,
        type,
        domain,
        status: "DRAFT",
        reviewCadenceDays: 365, // Annual review
      });

      created++;
      existingDocIds.add(docId);
    }

    await logGovernanceAudit(
      orgId,
      user.id ?? null,
      "governance_document_created",
      "governance_document",
      null,
      { action: "bulk_seed_vault", created, skipped }
    );

    return NextResponse.json({ ok: true, created, skipped, total: GOVERNANCE_DOCUMENT_MATRIX.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to seed documents";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
