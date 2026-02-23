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
  questionText: z.string().min(1),
  userResponse: z.string(),
});

/**
 * POST /api/ai/evaluate-assessment-response
 * Body: { controlId, questionText, userResponse }
 * Returns score (Met | Partially Met | Not Met) and rationale.
 */
export async function POST(req: Request) {
  try {
    await requireOrg();

    const body = await requestSchema.parseAsync(await req.json());
    const { controlId, questionText, userResponse } = body;

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
    const prompt = `You are a C3PAO assessor evaluating a response against NIST SP 800-171A assessment objectives. Score the response as exactly one of: "Met", "Partially Met", or "Not Met". Then provide a short rationale (1-3 sentences).

Control ID: ${control.controlId}
Control Title: ${control.title}
NIST Requirement: ${control.nistExactText ?? "N/A"}

Assessment question: ${questionText}

Respondent's answer: ${userResponse}

Respond with a single JSON object with keys "score" (one of "Met", "Partially Met", "Not Met") and "rationale" (string). No other text.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
    });

    const content = completion.choices[0]?.message?.content?.trim() ?? "{}";
    let score: "Met" | "Partially Met" | "Not Met" = "Not Met";
    let rationale = "Unable to evaluate.";

    try {
      const parsed = JSON.parse(content) as { score?: string; rationale?: string };
      if (["Met", "Partially Met", "Not Met"].includes(parsed.score ?? "")) {
        score = parsed.score as "Met" | "Partially Met" | "Not Met";
      }
      if (typeof parsed.rationale === "string") {
        rationale = parsed.rationale;
      }
    } catch {
      if (content.toLowerCase().includes("met")) {
        if (content.toLowerCase().includes("partially")) score = "Partially Met";
        else score = "Met";
      }
      rationale = content.slice(0, 500);
    }

    return NextResponse.json({ score, rationale });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
