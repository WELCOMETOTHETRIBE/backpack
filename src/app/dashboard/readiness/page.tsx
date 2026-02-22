import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, FileText, Calculator } from "lucide-react";
import { db } from "@/db";
import { calculateSprsScore } from "@/lib/sprs";
import { controlImplementations, controls } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function ReadinessPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  // Calculate SPRS score
  const sprsScore = await calculateSprsScore(orgId);

  // Get compliance percentage
  const impls = await db
    .select({ status: controlImplementations.status })
    .from(controlImplementations)
    .where(eq(controlImplementations.organizationId, orgId));

  const total = impls.length;
  const implemented = impls.filter((i) => i.status === "Implemented").length;
  const compliancePct = total > 0 ? Math.round((implemented / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[#0F172A]">Readiness & Audit</h1>
        <p className="mt-2 text-gray-600">
          Prepare for C3PAO assessment with mock assessments and readiness tools
        </p>
      </div>

      {/* SPRS Score Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#0F172A]">SPRS Score</h2>
            <p className="mt-1 text-sm text-gray-600">
              Your current Supplier Performance Risk System score based on NIST SP 800-171 DoD Assessment Methodology
            </p>
          </div>
          <div className="text-right">
            <div className="text-5xl font-bold text-[#3B82F6]">{sprsScore}</div>
            <div className="text-sm text-gray-600">out of 110</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-[#3B82F6] transition-all"
              style={{ width: `${(sprsScore / 110) * 100}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Maximum score is 110. Each unimplemented control deducts its point value.
          </p>
        </div>
      </div>

      {/* Readiness Tools Grid */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Link
          href="/dashboard/readiness/mock-assessment"
          className="group rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:border-[#3B82F6] hover:shadow-md"
        >
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#3B82F6]/10">
            <FileText className="h-6 w-6 text-[#3B82F6]" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[#0F172A] group-hover:text-[#3B82F6]">
            Mock Assessment Simulator
          </h3>
          <p className="text-sm text-gray-600">
            Practice the C3PAO audit process with a guided workflow. Test your readiness with Examine, Test, and Interview scenarios.
          </p>
        </Link>

        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-[#10B981]/10">
            <Calculator className="h-6 w-6 text-[#10B981]" />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[#0F172A]">SPRS Score Modeler</h3>
          <p className="mb-4 text-sm text-gray-600">
            Model the impact of control status changes on your SPRS score. See how closing POA&Ms affects your score.
          </p>
          <p className="text-xs text-gray-500 italic">Coming soon</p>
        </div>
      </div>

      {/* Readiness Summary */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[#0F172A]">Readiness Summary</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-gray-600">Compliance Score</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A]">{compliancePct}%</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">SPRS Score</p>
            <p className="mt-1 text-2xl font-bold text-[#3B82F6]">{sprsScore}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Controls Implemented</p>
            <p className="mt-1 text-2xl font-bold text-[#0F172A]">
              {implemented}/{total}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
