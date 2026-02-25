import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import {
  mockAssessments,
  mockAssessmentResponses,
  controls,
} from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import MockAssessmentPlayer from "../MockAssessmentPlayer";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MockAssessmentRunPage({ params }: PageProps) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { id } = await params;

  const [assessment] = await db
    .select({
      id: mockAssessments.id,
      status: mockAssessments.status,
      scope: mockAssessments.scope,
      controlIds: mockAssessments.controlIds,
    })
    .from(mockAssessments)
    .where(
      and(
        eq(mockAssessments.id, id),
        eq(mockAssessments.organizationId, orgId)
      )
    )
    .limit(1);

  if (!assessment) notFound();
  if (assessment.status === "completed") {
    redirect(`/dashboard/readiness/mock-assessment/results/${id}`);
  }

  const controlIds = (assessment.controlIds ?? []) as string[];
  const controlRows =
    controlIds.length > 0
      ? await db
          .select({
            controlId: controls.controlId,
            title: controls.title,
          })
          .from(controls)
          .where(inArray(controls.controlId, controlIds))
      : [];
  const controlsMap = Object.fromEntries(
    controlRows.map((c) => [c.controlId, { controlId: c.controlId, title: c.title }])
  );
  const controlsList = controlIds
    .map((cid) => controlsMap[cid])
    .filter(Boolean) as { controlId: string; title: string }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Mock Assessment</h1>
        <p className="mt-2 text-gray-600">
          Answer the interview questions for each control. Your responses will be evaluated against NIST 800-171A assessment objectives.
        </p>
      </div>
      <MockAssessmentPlayer
        mockAssessmentId={id}
        controls={controlsList}
      />
    </div>
  );
}
