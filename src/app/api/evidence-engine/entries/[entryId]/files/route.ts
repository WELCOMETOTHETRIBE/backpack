import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  governanceRegisters,
  governanceRegisterEntries,
  governanceRegisterEntryFiles,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg, requireRole } from "@/lib/auth";
import { getStorageService } from "@/lib/storage";
import { sha256Hex } from "@/lib/governance/hash";
import { errorResponse } from "@/lib/evidence-engine/api-errors";
import { logEntryEvent } from "@/lib/evidence-engine/entry-events";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
]);

function allowedMime(mime: string, filename: string): boolean {
  if (ALLOWED_MIMES.has(mime)) return true;
  const ext = filename.split(".").pop()?.toLowerCase();
  return ext === "pdf" || ext === "csv" || ext === "txt" || ext === "xlsx" || ext === "xls" || ["jpg", "jpeg", "png", "gif", "webp"].includes(ext ?? "");
}

/**
 * GET /api/evidence-engine/entries/[entryId]/files — list attachments for an entry.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance", "Assessor"]);
    const { entryId } = await params;
    if (!entryId) return errorResponse("entryId required", 400);

    const [entry] = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.id, entryId));
    if (!entry) return errorResponse("Entry not found", 404);

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.id, entry.registerId),
          eq(governanceRegisters.organizationId, orgId)
        )
      );
    if (!register) return errorResponse("Register not found", 404);

    const files = await db
      .select({
        id: governanceRegisterEntryFiles.id,
        fileUrl: governanceRegisterEntryFiles.fileUrl,
        originalFilename: governanceRegisterEntryFiles.originalFilename,
        fileSize: governanceRegisterEntryFiles.fileSize,
        sha256Hash: governanceRegisterEntryFiles.sha256Hash,
        createdAt: governanceRegisterEntryFiles.createdAt,
      })
      .from(governanceRegisterEntryFiles)
      .where(eq(governanceRegisterEntryFiles.registerEntryId, entryId));

    return NextResponse.json({ files });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return errorResponse(msg, 401, { code: "UNAUTHORIZED" });
  }
}

/**
 * POST /api/evidence-engine/entries/[entryId]/files — attach file (multipart: file).
 * Enforces file type allowlist and max size (10MB).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { entryId } = await params;
    if (!entryId) return errorResponse("entryId required", 400);

    const [entry] = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.id, entryId));
    if (!entry) return errorResponse("Entry not found", 404);

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(
        and(
          eq(governanceRegisters.id, entry.registerId),
          eq(governanceRegisters.organizationId, orgId)
        )
      );
    if (!register) return errorResponse("Register not found", 404);

    if (entry.status === "final" || entry.status === "void") {
      return errorResponse("Attachments cannot be added to locked or voided entries", 400, { code: "LOCKED_ENTRY" });
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return errorResponse("Content-Type must be multipart/form-data", 400, { code: "BAD_REQUEST" });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return errorResponse("file required", 400, { code: "BAD_REQUEST" });

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return errorResponse(`File size must not exceed ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB`, 400, { code: "BAD_REQUEST" });
    }
    const mime = file.type || "application/octet-stream";
    const originalFilename = file.name || "attachment";
    if (!allowedMime(mime, originalFilename)) {
      return errorResponse("File type not allowed. Use PDF, images, CSV, TXT, or XLSX.", 400, { code: "BAD_REQUEST" });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = sha256Hex(buffer);

    const storage = getStorageService();
    const result = await storage.upload(buffer, {
      organizationId: orgId,
      controlId: `gov-reg-${entry.registerId}`,
      fileName: originalFilename,
      mimeType: mime,
    });

    const [row] = await db
      .insert(governanceRegisterEntryFiles)
      .values({
        registerEntryId: entryId,
        boundaryId: entry.boundaryId,
        fileUrl: result.fileUrl,
        storageKey: result.fileId,
        sha256Hash: hash,
        fileSize: buffer.length,
        originalFilename,
        uploadedById: user?.id ?? null,
        uploadedAt: new Date(),
      })
      .returning();

    await logEntryEvent(orgId, entryId, entry.boundaryId, "attachment_added", user?.id ?? null, {
      fileId: row?.id,
      originalFilename,
      sha256: hash,
    });

    return NextResponse.json({
      id: row?.id,
      fileUrl: row?.fileUrl,
      originalFilename: row?.originalFilename,
      fileSize: row?.fileSize,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return errorResponse(msg, 500, { code: "INTERNAL_ERROR" });
  }
}
