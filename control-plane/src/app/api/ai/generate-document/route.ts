import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import { controlRecords } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getSpecForControl } from "@/lib/artifact-guide";
import { getStorageService } from "@/lib/storage";
import { artifacts } from "@/db/schema";
import { calculateControlStatus } from "@/lib/control-status";

async function getOpenAI() {
  const { OpenAI } = await import("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const requestSchema = z.object({
  controlRecordId: z.string().uuid(),
  artifactLabel: z.string().min(1),
});

/**
 * POST /api/ai/generate-document
 * Body: { controlRecordId, artifactLabel }
 * Generates an audit-ready policy/procedure template for the control and artifact, saves to storage and artifacts table.
 */
export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    const user = await requireRole(["Admin", "Compliance"]);

    const body = await requestSchema.parseAsync(await req.json());
    const { controlRecordId, artifactLabel } = body;

    const [record] = await db
      .select()
      .from(controlRecords)
      .where(
        and(
          eq(controlRecords.id, controlRecordId),
          eq(controlRecords.organizationId, orgId)
        )
      )
      .limit(1);

    if (!record) {
      return NextResponse.json({ error: "Control record not found" }, { status: 404 });
    }

    const spec = getSpecForControl(record.controlId);
    const validLabel = spec?.artifacts.some((a) => a.label === artifactLabel);
    if (!spec || !validLabel) {
      return NextResponse.json(
        { error: "Artifact label not valid for this control" },
        { status: 400 }
      );
    }

    const openai = await getOpenAI();
    const prompt = `You are a compliance writer for CMMC (NIST SP 800-171) documentation. Generate a comprehensive, audit-ready template for the following document. The document should be suitable for a C3PAO assessor review.

Control ID: ${record.controlId}
Document type: ${artifactLabel}

Requirements:
- Use clear section headings (##).
- Include placeholder text where the organization must fill in specific details (mark with [ORGANIZATION TO COMPLETE]).
- Use formal policy/procedure language.
- Length: roughly 1-2 pages when rendered.
- Output valid Markdown only, no frontmatter.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 2000,
    });

    const content =
      completion.choices[0]?.message?.content?.trim() ||
      `# ${artifactLabel}\n\n[ORGANIZATION TO COMPLETE: Add content for ${artifactLabel} per control ${record.controlId}.]`;

    const fileName = `${artifactLabel.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-]/g, "")}-${record.controlId.replace(/\./g, "-")}.md`;
    const buffer = Buffer.from(content, "utf-8");
    const mimeType = "text/markdown";

    const storage = getStorageService();
    const { fileUrl, fileId } = await storage.upload(buffer, {
      organizationId: orgId,
      controlId: record.controlId,
      fileName,
      mimeType,
    });

    const [inserted] = await db
      .insert(artifacts)
      .values({
        organizationId: orgId,
        controlRecordId,
        artifactLabel,
        fileName,
        fileUrl,
        storageKey: fileId,
        fileType: mimeType,
        fileSize: buffer.length,
        uploadedBy: user.id,
      })
      .returning();

    await calculateControlStatus(controlRecordId);

    return NextResponse.json(inserted);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: e.issues }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Document generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
