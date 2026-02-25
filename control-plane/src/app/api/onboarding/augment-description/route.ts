import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";

async function getOpenAI() {
  const { OpenAI } = await import("openai");
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const requestSchema = z.object({
  field: z.enum(["cuiBoundary", "systemScope"]),
  text: z.string().max(2000),
});

/**
 * POST /api/onboarding/augment-description
 * Expands user keywords into a short, professional CUI boundary or system scope description.
 */
export async function POST(req: Request) {
  try {
    await requireOrg();
    const body = await requestSchema.parseAsync(await req.json());
    const { field, text } = body;

    const trimmed = text.trim();
    if (!trimmed) {
      return NextResponse.json(
        { error: "Enter a few keywords or a short phrase to augment." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Augment is not configured (OPENAI_API_KEY missing)." },
        { status: 503 }
      );
    }

    const isBoundary = field === "cuiBoundary";
    const prompt = isBoundary
      ? `You are a CMMC compliance writer. The user will provide keywords or a short phrase describing their CUI environment boundary. Expand this into 2-4 clear, professional sentences that describe the physical and logical boundary of their CUI environment (what systems, networks, and locations are inside the boundary). Use formal language suitable for an SSP. Output only the expanded text, no preamble or labels.`
      : `You are a CMMC compliance writer. The user will provide keywords or a short phrase describing the scope of systems covered by CMMC. Expand this into 2-4 clear, professional sentences that describe the scope of systems and components in scope for CMMC assessment. Use formal language suitable for an SSP. Output only the expanded text, no preamble or labels.`;

    const openai = await getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: trimmed },
      ],
      max_tokens: 400,
    });

    const augmented =
      completion.choices[0]?.message?.content?.trim() ||
      trimmed;

    return NextResponse.json({ augmented });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Augment failed";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
