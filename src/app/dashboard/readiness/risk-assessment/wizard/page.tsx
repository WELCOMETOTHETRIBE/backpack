import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import {
  boundaries,
  governanceRegisters,
  governanceRegisterEntries,
  organizations,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import { THREAT_SCENARIOS, SCENARIO_CATEGORIES } from "../threat-scenarios";
import RiskWizardClient from "./RiskWizardClient";

/**
 * Phase 1 — Annual Risk Assessment guided wizard.
 *
 * Server shell: resolves the org's primary boundary + risk_register
 * register id, hands them to the client wizard along with the curated
 * threat scenario library. The client walks the user through 4 steps
 * (Scope -> Threats -> Treatment -> Approve) and POSTs the result to
 * /api/risk-assessment/submit, which writes one risk_identified entry
 * per selected scenario into the risk_register.
 *
 * What this wizard does NOT do (deferred to later phases):
 *   - AI-assisted likelihood/impact suggestions (Phase 2)
 *   - PDF / ZIP evidence-bundle export (Phase 3)
 *   - Free-form scenario authoring beyond the curated library (later)
 *
 * What it DOES do today:
 *   - Captures scope statement, assessor, review-period dates
 *   - Lets the user pick from ~20 curated CUI Vault threat scenarios,
 *     edit suggested likelihood/impact, set treatment + owner + date
 *   - Captures preparer/approver names + sign-off date
 *   - On submit, creates final register entries and returns the count
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function RiskAssessmentWizardPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const [boundary] = await db
    .select({ id: boundaries.id, name: boundaries.name })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);

  if (!boundary) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/dashboard/readiness/risk-assessment" className="text-xs text-[var(--color-gray-500)] hover:underline">
          ← Annual Risk Assessment
        </Link>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm font-semibold text-amber-900">No boundary defined</p>
          <p className="mt-1 text-xs text-amber-800">
            Set up the CUI boundary in System Profile first, then return to start
            the guided risk assessment.
          </p>
        </div>
      </div>
    );
  }

  const candidates = resolveRegisterKeyCandidates("risk_register");
  const [register] = await db
    .select({ id: governanceRegisters.id })
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `,
        )})`,
      ),
    )
    .limit(1);

  if (!register) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/dashboard/readiness/risk-assessment" className="text-xs text-[var(--color-gray-500)] hover:underline">
          ← Annual Risk Assessment
        </Link>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <p className="text-sm font-semibold text-amber-900">Risk register not provisioned</p>
          <p className="mt-1 text-xs text-amber-800">
            The risk_register entry schema is missing for this org. Re-run the
            register provisioning step or contact support.
          </p>
        </div>
      </div>
    );
  }

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      finals: sql<number>`count(*) filter (where ${governanceRegisterEntries.status} = 'final')::int`,
    })
    .from(governanceRegisterEntries)
    .where(eq(governanceRegisterEntries.registerId, register.id));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <Link
          href="/dashboard/readiness/risk-assessment"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-gray-500)] hover:underline"
        >
          <ArrowLeft className="h-3 w-3" /> Annual Risk Assessment
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <ShieldAlert className="h-6 w-6 text-[var(--color-blue-accent)]" aria-hidden />
          <h1 className="text-2xl font-bold text-[var(--color-navy-primary)]">
            Guided Risk Assessment
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-900">
            Phase 1 · MVP
          </span>
        </div>
        <p className="mt-2 text-sm text-[var(--color-gray-600)]">
          Walk through scope, applicable threat scenarios, treatment decisions, and
          management approval. Each selected scenario becomes a final entry in the
          live risk_register and feeds POA&amp;M creation for non-accept treatments.
        </p>
      </header>

      <RiskWizardClient
        orgName={org?.name ?? "your organization"}
        boundaryId={boundary.id}
        boundaryName={boundary.name}
        registerId={register.id}
        existingEntryCount={counts?.total ?? 0}
        existingFinalCount={counts?.finals ?? 0}
        scenarios={THREAT_SCENARIOS}
        categories={SCENARIO_CATEGORIES}
      />
    </div>
  );
}
