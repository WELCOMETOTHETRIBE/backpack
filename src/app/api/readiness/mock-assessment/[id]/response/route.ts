import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { db } from "@/db";
import { mockAssessments, mockAssessmentResponses } from "@/db/schema";
import { eq, and } from "drizzle-orm";

const requestSchema = z.object({
  controlId: z.string().min(1),
  questionText: z.string().min(1),
  userResponse: z.string(),
  llmEvaluation: z.string(),
  score: z.enum(["Met", "Partially Met", "Not Met"]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const { id: mockAssessmentId } = await params;
    const body = await requestSchema.parseAsync(await req.json());

    const [assessment] = await db
      .select({ id: mockAssessments.id })
      .from(mockAssessments)
      .where(
        and(
          eq(mockAssessments.id, mockAssessmentId),
          eq(mockAssessments.organizationId, orgId),
          eq(mockAssessments.status, "in_progress")
        )
      )
      .limit(1);

    if (!assessment) {
      return NextResponse.json(
        { error: "Assessment not found or not in progress" },
        { status: 404 }
      );
    }

    await db.insert(mockAssessmentResponses).values({
      mockAssessmentId,
      controlId: body.controlId,
      questionText: body.questionText,
      userResponse: body.userResponse,
      llmEvaluation: body.llmEvaluation,
      score: body.score,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
