import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ExternalLink, Shield } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { riskAssessments } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

const TRAINOS_BASE_URL =
  process.env.NEXT_PUBLIC_TRAINOS_BASE_URL ??
  "https://training.mactechsolutionsllc.com";

/**
 * RA.L2-3.11.1 landing page (post-wizard-removal).
 *
 * The guided risk-assessment wizard moved to the MacTech Training app.
 * Codex now plays the receiver role: the lifecycle envelope (status,
 * objective [a]/[b], hashes, vault pointer, finalize gate) is owned
 * here, but the wizard UX lives in TrainOS — same split as IR
 * tabletops.
 *
 * This page surfaces the current envelope state and a deep link to
 * TrainOS to (re-)run the wizard. No content authoring happens here.
 */
export default async function RiskAssessmentLandingPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  if (!orgId) redirect("/sign-in");

  const [latest] = await db
    .select({
      id: riskAssessments.id,
      status: riskAssessments.status,
      finalizedAt: riskAssessments.finalizedAt,
      nextDueDate: riskAssessments.nextDueDate,
      reviewPeriodEnd: riskAssessments.reviewPeriodEnd,
    })
    .from(riskAssessments)
    .where(eq(riskAssessments.organizationId, orgId))
    .orderBy(
      desc(riskAssessments.finalizedAt),
      desc(riskAssessments.createdAt),
    )
    .limit(1);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-8">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
          <Shield className="h-3.5 w-3.5" />
          RA.L2-3.11.1 — Annual Risk Assessment
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Risk assessment moved to MacTech Training
        </h1>
        <p className="text-gray-600">
          The guided wizard now lives in the Training app. Codex receives
          the finalized bundle metadata over the bridge — same pattern as
          IR tabletops. The lifecycle, objective verdicts, and POA&amp;M /
          acceptance records continue to be tracked here.
        </p>
      </header>

      <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Current state for this organization
        </h2>
        <div className="mt-4">
          {latest ? (
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-gray-500">Most recent envelope</dt>
              <dd className="font-mono">{latest.status}</dd>
              <dt className="text-gray-500">Finalized at</dt>
              <dd className="font-mono">
                {latest.finalizedAt
                  ? latest.finalizedAt.toISOString().slice(0, 10)
                  : "—"}
              </dd>
              <dt className="text-gray-500">Review period ends</dt>
              <dd className="font-mono">{latest.reviewPeriodEnd ?? "—"}</dd>
              <dt className="text-gray-500">Next due</dt>
              <dd className="font-mono">{latest.nextDueDate ?? "—"}</dd>
            </dl>
          ) : (
            <p className="text-sm text-gray-600">
              No risk assessment on file for this organization yet. Run the
              wizard in MacTech Training; the bridge will populate this
              card once you finalize.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <a
          href={`${TRAINOS_BASE_URL}/risk-assessment`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
        >
          Open Risk Assessment wizard in MacTech Training
          <ExternalLink className="h-4 w-4" />
        </a>
        <Link
          href="/dashboard/controls/3.11.1"
          className="ml-3 inline-flex items-center gap-1 text-sm text-sky-700 hover:underline"
        >
          View 3.11.1 in the SCTM
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <p className="text-xs text-gray-500">
        Boundary discipline: the Training app authors the assessment; the
        vault holds the bundle bytes; Codex stores only sanitized metadata,
        hashes, and a vault pointer. See{" "}
        <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
          docs/RA-L2-3.11.1-implementation-plan.md
        </code>
        .
      </p>
    </div>
  );
}
