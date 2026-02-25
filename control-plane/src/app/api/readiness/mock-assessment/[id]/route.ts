import { NextResponse } from "next/server";
import { db } from "@/db";
import { mockAssessments, mockAssessmentResponses, controls } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { requireOrg } from "@/lib/auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const { id } = await params;

    const [assessment] = await db
      .select({
        id: mockAssessments.id,
        status: mockAssessments.status,
        scope: mockAssessments.scope,
        controlIds: mockAssessments.controlIds,
        createdAt: mockAssessments.createdAt,
        completedAt: mockAssessments.completedAt,
      })
      .from(mockAssessments)
      .where(
        and(
          eq(mockAssessments.id, id),
          eq(mockAssessments.organizationId, orgId)
        )
      )
      .limit(1);

    if (!assessment) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    const controlIds = (assessment.controlIds ?? []) as string[];
    if (controlIds.length === 0) {
      return NextResponse.json({
        assessment: {
          id: assessment.id,
          status: assessment.status,
          scope: assessment.scope,
          createdAt: assessment.createdAt,
          completedAt: assessment.completedAt,
        },
        controls: [],
        responses: [],
      });
    }

    const controlRows = await db
      .select({
        controlId: controls.controlId,
        title: controls.title,
      })
      .from(controls)
      .where(inArray(controls.controlId, controlIds));

    const controlsMap = Object.fromEntries(
      controlRows.map((c) => [c.controlId, { controlId: c.controlId, title: c.title }])
    );
    const controlsList = controlIds
      .map((cid) => controlsMap[cid])
      .filter(Boolean);

    const responses = await db
      .select({
        id: mockAssessmentResponses.id,
        controlId: mockAssessmentResponses.controlId,
        questionText: mockAssessmentResponses.questionText,
        userResponse: mockAssessmentResponses.userResponse,
        llmEvaluation: mockAssessmentResponses.llmEvaluation,
        score: mockAssessmentResponses.score,
        createdAt: mockAssessmentResponses.createdAt,
      })
      .from(mockAssessmentResponses)
      .where(eq(mockAssessmentResponses.mockAssessmentId, id));

    return NextResponse.json({
      assessment: {
        id: assessment.id,
        status: assessment.status,
        scope: assessment.scope,
        createdAt: assessment.createdAt,
        completedAt: assessment.completedAt,
      },
      controls: controlsList,
      responses,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
