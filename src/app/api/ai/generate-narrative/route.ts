import { NextResponse } from "next/server";
import { OpenAI } from "openai";
import { z } from "zod";
import { requireOrg, requireRole } from "@/lib/auth";
import { db } from "@/db";
import { controls, controlImplementations, sspSections } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const requestSchema = z.object({
  controlId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const orgId = await requireOrg();
    await requireRole(["Admin", "Compliance"]);

    const body = await requestSchema.parseAsync(await req.json());
    const { controlId } = body;

    // Fetch control implementation details
    const [controlImpl] = await db
      .select({
        control: {
          controlId: controls.controlId,
          title: controls.title,
          nistExactText: controls.nistExactText,
          nistDiscussionGuidance: controls.nistDiscussionGuidance,
        },
      })
      .from(controlImplementations)
      .innerJoin(controls, eq(controlImplementations.controlId, controls.id))
      .where(
        and(
          eq(controlImplementations.id, controlId),
          eq(controlImplementations.organizationId, orgId)
        )
      )
      .limit(1);

    if (!controlImpl) {
      return NextResponse.json({ error: "Control implementation not found" }, { status: 404 });
    }

    // Fetch organization's system description from SSP
    const [systemSection] = await db
      .select({ content: sspSections.content })
      .from(sspSections)
      .where(eq(sspSections.organizationId, orgId))
      .where(eq(sspSections.sectionKey, "system_description"))
      .limit(1);

    const systemDescription = systemSection?.content || "A CMMC Level 2 compliant system handling Controlled Unclassified Information (CUI).";

    // Construct prompt
    const prompt = `You are a CMMC compliance expert. Generate a professional, audit-ready implementation narrative for the following NIST SP 800-171 Rev 2 control.

Control ID: ${controlImpl.control.controlId}
Control Title: ${controlImpl.control.title}
NIST Requirement: ${controlImpl.control.nistExactText || "N/A"}
NIST Discussion: ${controlImpl.control.nistDiscussionGuidance || "N/A"}

System Context: ${systemDescription}

Requirements for the narrative:
1. Be specific and technical, describing actual implementation measures
2. Reference specific technologies, processes, or procedures where appropriate
3. Use professional compliance language suitable for a C3PAO audit
4. Be concise but comprehensive (3-5 sentences)
5. Do not include placeholder text or generic statements
6. Focus on how the control is implemented in practice

Generate the implementation narrative:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a CMMC compliance expert specializing in NIST SP 800-171 Rev 2 control implementation narratives.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    const narrative = completion.choices[0]?.message?.content?.trim() || "";

    if (!narrative) {
      return NextResponse.json({ error: "Failed to generate narrative" }, { status: 500 });
    }

    return NextResponse.json({ narrative });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.errors }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : message.includes("Forbidden") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
