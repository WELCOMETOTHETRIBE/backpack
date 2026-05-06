import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { assessments } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { OpenAssessmentForm } from "./OpenAssessmentForm";
import { CloseAssessmentForm } from "./CloseAssessmentForm";

/**
 * /dashboard/admin/assessments — admin page to open/close C3PAO
 * assessment sessions.
 *
 * Phase 10 follow-up B1. The admin opens an assessment with a title +
 * assessor identity. That fans out narrative locks onto every
 * controlObservedImplementations row so the OIS regenerator skips them
 * during the assessment. Closing the assessment unlocks the rows AND
 * generates a signed close-out receipt (Phase 10 B3) snapshotting every
 * (control, narrative, verdict, scratchpad) into a tamper-evident JSON
 * with sha256 hash.
 *
 * Auth: session, Admin or Compliance role.
 */

export default async function AssessmentsAdminPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (!orgId) redirect("/auth/signin");
  if (role !== "Admin" && role !== "Compliance") {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-xl font-semibold">Forbidden</h1>
        <p className="mt-2 text-sm text-[var(--color-gray-600)]">
          Only Admin or Compliance roles can manage assessment sessions.
        </p>
      </div>
    );
  }

  const recent = await db
    .select()
    .from(assessments)
    .where(eq(assessments.organizationId, orgId))
    .orderBy(desc(assessments.openedAt))
    .limit(10);

  const openOnes = recent.filter((a) => a.status === "open");

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          C3PAO assessments
        </h1>
        <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
          Open an assessment to freeze every control's
          observed-implementation narrative for the duration. The C3PAO
          adjudicates against the frozen narratives + engine verdicts +
          their own scratchpad notes via{" "}
          <Link
            href="/auditor"
            className="text-[var(--color-blue-accent)] hover:underline"
          >
            /auditor
          </Link>
          . Closing the assessment unlocks the narratives and generates a
          tamper-evident sha256-signed receipt of the entire evidence
          state.
        </p>
      </div>

      {/* Open new assessment */}
      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
          Open a new assessment
        </h2>
        <p className="mt-1 text-xs text-[var(--color-gray-600)]">
          Locks every observed-implementation narrative until close-out.
        </p>
        <OpenAssessmentForm />
      </section>

      {/* Open assessments — close-out form per row */}
      {openOnes.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/40 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-amber-900">
            Currently open ({openOnes.length})
          </h2>
          <ul className="mt-3 space-y-4">
            {openOnes.map((a) => (
              <li
                key={a.id}
                className="rounded-md border border-amber-300 bg-white p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--color-navy-primary)]">
                      {a.title}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                      Opened {new Date(a.openedAt).toLocaleString()}{" "}
                      {a.assessorName && (
                        <>
                          · assessor{" "}
                          <span className="font-medium">{a.assessorName}</span>
                          {a.assessorOrg && <> ({a.assessorOrg})</>}
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <CloseAssessmentForm assessmentId={a.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* History */}
      <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
          Recent assessments
        </h2>
        {recent.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">
            No assessments opened yet.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-[var(--color-border-muted)]">
            {recent.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline gap-2 py-2 text-sm"
              >
                <span className="font-medium">{a.title}</span>
                <span
                  className={`text-[10px] uppercase tracking-wide rounded-full px-2 py-0.5 ${
                    a.status === "open"
                      ? "bg-amber-100 text-amber-800"
                      : a.status === "closed"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {a.status}
                </span>
                <span className="text-[11px] text-[var(--color-gray-600)]">
                  opened {new Date(a.openedAt).toLocaleString()}
                  {a.closedAt && (
                    <> · closed {new Date(a.closedAt).toLocaleString()}</>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
