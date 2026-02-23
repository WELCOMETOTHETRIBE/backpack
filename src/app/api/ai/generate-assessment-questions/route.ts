import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { controls } from "@/db/schema";
import { eq } from "drizzle-orm";

async function getOpenAI() {
  const { OpenAI } = await import("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const requestSchema = z.object({
  controlId: z.string().min(1),
});

/**
 * POST /api/ai/generate-assessment-questions
 * Body: { controlId: string } (NIST id e.g. "3.13.2")
 * Returns interview-style questions based on NIST 800-171A assessment procedures.
 */
export async function POST(req: Request) {
  try {
    await requireOrg();

    const body = await requestSchema.parseAsync(await req.json());
    const { controlId } = body;

    const [control] = await db
      .select({
        controlId: controls.controlId,
        title: controls.title,
        nistExactText: controls.nistExactText,
        nistDiscussionGuidance: controls.nistDiscussionGuidance,
      })
      .from(controls)
      .where(eq(controls.controlId, controlId))
      .limit(1);

    if (!control) {
      return NextResponse.json({ error: "Control not found" }, { status: 404 });
    }

    const openai = await getOpenAI();
    const prompt = `You are a C3PAO assessor following NIST SP 800-171A assessment procedures. For the following NIST SP 800-171 Rev 2 control, generate 3 concise interview questions that an assessor would ask to determine if the control is met. Use Examine, Interview, and Test thinking: one question about what to examine (evidence/documents), one about who to interview and what to ask, and one about what to test.

Control ID: ${control.controlId}
Control Title: ${control.title}
NIST Requirement: ${control.nistExactText ?? "N/A"}
NIST Discussion: ${control.nistDiscussionGuidance ?? "N/A"}

Return ONLY a JSON array of exactly 3 question strings, no other text. Example: ["Question 1?", "Question 2?", "Question 3?"]`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "[]";
    let questions: string[] = [];
    try {
      const parsed = JSON.parse(content);
      questions = Array.isArray(parsed)
        ? parsed.filter((q: unknown) => typeof q === "string").slice(0, 3)
        : [];
    } catch {
      questions = content.split("\n").filter((s) => s.trim().length > 0).slice(0, 3);
    }
    if (questions.length === 0) {
      questions = [
        `Describe how ${control.title} is implemented in your organization.`,
        `Who is responsible for this control and how often is it reviewed?`,
        `What evidence demonstrates that this control is effective?`,
      ];
    }

    return NextResponse.json({ questions });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
