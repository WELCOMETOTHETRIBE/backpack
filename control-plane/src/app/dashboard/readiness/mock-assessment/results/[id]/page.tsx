import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  mockAssessments,
  mockAssessmentResponses,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { DataUnavailable } from "@/components/ui/DataUnavailable";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MockAssessmentResultsPage({ params }: PageProps) {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { id } = await params;

  let assessment:
    | {
        id: string;
        status: string;
        createdAt: Date;
        completedAt: Date | null;
      }
    | undefined;
  let responses: Array<{
    id: string;
    controlId: string;
    questionText: string;
    userResponse: string | null;
    llmEvaluation: string | null;
    score: string | null;
  }> = [];
  try {
    [assessment] = await db
      .select({
        id: mockAssessments.id,
        status: mockAssessments.status,
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

    if (assessment) {
      responses = await db
        .select({
          id: mockAssessmentResponses.id,
          controlId: mockAssessmentResponses.controlId,
          questionText: mockAssessmentResponses.questionText,
          userResponse: mockAssessmentResponses.userResponse,
          llmEvaluation: mockAssessmentResponses.llmEvaluation,
          score: mockAssessmentResponses.score,
        })
        .from(mockAssessmentResponses)
        .where(eq(mockAssessmentResponses.mockAssessmentId, id))
        .orderBy(asc(mockAssessmentResponses.createdAt));
    }
  } catch (err) {
    console.error("Mock-assessment results primary fetch failed:", err);
    return (
      <DataUnavailable
        resource="mock assessment"
        backTo="/dashboard/readiness/mock-assessment"
        backLabel="Back to Mock Assessments"
      />
    );
  }

  if (!assessment) notFound();

  const responsesOrdered = responses;

  const met = responsesOrdered.filter((r) => r.score === "Met").length;
  const partiallyMet = responsesOrdered.filter((r) => r.score === "Partially Met").length;
  const notMet = responsesOrdered.filter((r) => r.score === "Not Met").length;
  const total = responsesOrdered.length;
  const readinessPct = total > 0 ? Math.round((met / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <Breadcrumbs
          items={[
            { label: "Dashboard", href: "/dashboard" },
            { label: "Readiness", href: "/dashboard/readiness" },
            {
              label: "Mock assessments",
              href: "/dashboard/readiness/mock-assessment",
            },
            { label: "Results" },
          ]}
        />
        <h1 className="text-3xl font-bold text-[#0F172A]">Mock Assessment Results</h1>
        <p className="mt-2 text-gray-600">
          Completed{" "}
          {assessment.completedAt
            ? new Date(assessment.completedAt).toLocaleDateString()
            : "—"}
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Readiness Score</h2>
          <div className="text-5xl font-bold text-[#3B82F6]">{readinessPct}%</div>
          <p className="mt-2 text-sm text-gray-600">
            {met} of {total} controls fully met
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Score Summary</h2>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Met:</span>
              <span className="font-semibold text-[#10B981]">{met}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Partially Met:</span>
              <span className="font-semibold text-[#F59E0B]">{partiallyMet}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">Not Met:</span>
              <span className="font-semibold text-[#EF4444]">{notMet}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Per-control results</h2>
        <div className="space-y-4">
          {responsesOrdered.map((r) => (
            <div
              key={r.id}
              className="rounded-lg border border-gray-200 p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono font-medium text-gray-900">{r.controlId}</span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    r.score === "Met"
                      ? "bg-[#10B981]/10 text-[#10B981]"
                      : r.score === "Partially Met"
                        ? "bg-[#F59E0B]/10 text-[#F59E0B]"
                        : "bg-[#EF4444]/10 text-[#EF4444]"
                  }`}
                >
                  {r.score}
                </span>
              </div>
              <p className="mb-2 text-sm text-gray-600">{r.questionText}</p>
              <p className="mb-2 text-sm text-gray-800">
                <span className="font-medium">Your response:</span> {r.userResponse}
              </p>
              <p className="text-sm text-gray-700">
                <span className="font-medium">Evaluator rationale:</span> {r.llmEvaluation}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Link
          href="/dashboard/readiness/mock-assessment"
          className="rounded-lg bg-[#3B82F6] px-6 py-2 font-medium text-white hover:bg-[#2563EB]"
        >
          Back to Mock Assessment
        </Link>
      </div>
    </div>
  );
}
