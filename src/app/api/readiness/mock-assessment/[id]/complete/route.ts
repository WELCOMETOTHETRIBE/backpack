import { NextResponse } from "next/server";
import { db } from "@/db";
import { mockAssessments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrg } from "@/lib/auth";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const orgId = await requireOrg();
    const { id } = await params;

    const [updated] = await db
      .update(mockAssessments)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(
        and(
          eq(mockAssessments.id, id),
          eq(mockAssessments.organizationId, orgId),
          eq(mockAssessments.status, "in_progress")
        )
      )
      .returning({ id: mockAssessments.id });

    if (!updated) {
      return NextResponse.json(
        { error: "Assessment not found or already completed" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    const status = message.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
