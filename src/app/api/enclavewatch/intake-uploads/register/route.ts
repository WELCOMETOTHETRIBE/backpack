import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveOrgFromSessionOrBearer } from "@/lib/auth-bearer";
import { registerIntakeFileFromEnclaveWatchVault } from "@/lib/intake/service";

const txnIdRegex = /^[a-zA-Z0-9_.:-]+$/;

const bodySchema = z
  .object({
    intakeTransactionId: z.string().min(3).max(100).regex(txnIdRegex),
    originalFilename: z.string().min(1).max(500),
    blobPath: z.string().min(1).max(2048).optional().nullable(),
    storageAccount: z.string().max(200).optional().nullable(),
    containerName: z.string().max(200).optional().nullable(),
    contentType: z.string().max(200).optional().nullable(),
    fileSize: z.number().int().nonnegative().optional().nullable(),
    sha256Hash: z.string().regex(/^[a-f0-9]{64}$/).optional().nullable(),
    uploadedByIdentity: z.string().max(500).optional().nullable(),
  })
  .strict();

/**
 * Vault bearer registration for intake_files after a successful Azure blob ingest.
 * Auth: Clerk session OR Authorization: Bearer organizations.enclavewatch_api_token
 */
export async function POST(req: Request) {
  const ctx = await resolveOrgFromSessionOrBearer(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = (await req.json().catch(() => null)) as unknown | null;
  const parsedBody = bodySchema.safeParse(raw ?? {});
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: parsedBody.error.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  }

  const b = parsedBody.data;

  try {
    const file = await registerIntakeFileFromEnclaveWatchVault({
      orgId: ctx.orgId,
      intakeTransactionId: b.intakeTransactionId.trim(),
      originalFilename: b.originalFilename.trim(),
      blobPathForHash: b.blobPath?.trim() ?? null,
      storageAccount: b.storageAccount?.trim() ?? null,
      containerName: b.containerName?.trim() ?? null,
      contentType: b.contentType?.trim() ?? null,
      fileSize: b.fileSize ?? null,
      sha256Hex: b.sha256Hash ?? null,
      uploadedByIdentity: b.uploadedByIdentity?.trim() ?? "enclavewatch_vault_customer_upload",
    });

    return NextResponse.json({ ok: true, file }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    const lower = message.toLowerCase();
    if (lower.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (lower.includes("not accepting vault file registration")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (lower.includes("invalid status transition")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
