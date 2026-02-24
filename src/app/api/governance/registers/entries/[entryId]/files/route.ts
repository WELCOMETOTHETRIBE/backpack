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

/** POST /api/governance/registers/entries/[entryId]/files — attach file (multipart: file) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> }
) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance", "Assessor"]);
    const { entryId } = await params;
    if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 });

    const [entry] = await db
      .select()
      .from(governanceRegisterEntries)
      .where(eq(governanceRegisterEntries.id, entryId));

    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

    const [register] = await db
      .select()
      .from(governanceRegisters)
      .where(eq(governanceRegisters.id, entry.registerId));

    if (!register || register.organizationId !== orgId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Content-Type must be multipart/form-data" }, { status: 400 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: "file required" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = sha256Hex(buffer);
    const originalFilename = file.name || "attachment";

    const storage = getStorageService();
    const result = await storage.upload(buffer, {
      organizationId: orgId,
      controlId: `gov-reg-${entry.registerId}`,
      fileName: originalFilename,
      mimeType: file.type || "application/octet-stream",
    });

    const [row] = await db
      .insert(governanceRegisterEntryFiles)
      .values({
        registerEntryId: entryId,
        fileUrl: result.fileUrl,
        storageKey: result.fileId,
        sha256Hash: hash,
        fileSize: buffer.length,
        originalFilename,
      })
      .returning();

    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
