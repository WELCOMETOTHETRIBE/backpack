import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  ListChecks,
  Shield,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  governanceRegisterEntries,
  governanceRegisters,
  riskAcceptances,
  riskAssessments,
  riskPoamLinks,
} from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

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
 * The page is the C3PAO's first read on the latest assessment — it must
 * surface enough enrichment to defend objective [a] (frequency rationale)
 * and objective [b] (scenarios + acceptances + POA&M links) without
 * cracking open the vault zip. Anything stored on the envelope row or
 * mirrored into the risk_register entries / risk_acceptances /
 * risk_poam_links tables is fair game.
 */
export default async function RiskAssessmentLandingPage() {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  if (!orgId) redirect("/sign-in");

  // Pull the full envelope row, not just status/dates.
  const [latest] = await db
    .select()
    .from(riskAssessments)
    .where(eq(riskAssessments.organizationId, orgId))
    .orderBy(
      desc(riskAssessments.finalizedAt),
      desc(riskAssessments.createdAt),
    )
    .limit(1);

  // Pull the per-risk register entries + acceptances + POA&M links so
  // the C3PAO can see the full posture inline.
  let riskEntries: Array<{
    id: string;
    entryData: Record<string, unknown> | null;
  }> = [];
  let acceptances: Array<typeof riskAcceptances.$inferSelect> = [];
  let poamLinks: Array<typeof riskPoamLinks.$inferSelect> = [];

  if (latest) {
    const entriesRes = await db
      .select({
        id: governanceRegisterEntries.id,
        entryData: governanceRegisterEntries.entryData,
      })
      .from(governanceRegisterEntries)
      .innerJoin(
        governanceRegisters,
        eq(governanceRegisters.id, governanceRegisterEntries.registerId),
      )
      .where(
        and(
          eq(governanceRegisters.organizationId, orgId),
          eq(governanceRegisters.registerKey, "risk_register"),
          sql`${governanceRegisterEntries.entryData} ->> 'assessment_id' = ${latest.assessmentPivotId}`,
          eq(governanceRegisterEntries.status, "final"),
        ),
      );
    riskEntries = entriesRes as typeof riskEntries;

    acceptances = await db
      .select()
      .from(riskAcceptances)
      .where(eq(riskAcceptances.riskAssessmentId, latest.id));

    poamLinks = await db
      .select()
      .from(riskPoamLinks)
      .where(eq(riskPoamLinks.riskAssessmentId, latest.id));
  }

  const objectivePill = (status: string) => {
    if (status === "met") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-3 w-3" /> MET
        </span>
      );
    }
    if (status === "not_applicable") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 ring-1 ring-gray-200">
          N/A
        </span>
      );
    }
    if (status === "not_met") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
          <XCircle className="h-3 w-3" /> NOT MET
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
        <ShieldAlert className="h-3 w-3" /> UNKNOWN
      </span>
    );
  };

  const severityChip = (sev: string | null | undefined) => {
    const s = (sev ?? "").toUpperCase();
    const cls =
      s === "CRITICAL"
        ? "bg-rose-100 text-rose-800 ring-rose-200"
        : s === "HIGH"
          ? "bg-orange-100 text-orange-800 ring-orange-200"
          : s === "MODERATE"
            ? "bg-amber-100 text-amber-800 ring-amber-200"
            : s === "LOW"
              ? "bg-emerald-100 text-emerald-800 ring-emerald-200"
              : "bg-gray-100 text-gray-700 ring-gray-200";
    return (
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${cls}`}
      >
        {s || "—"}
      </span>
    );
  };

  // Sort risks worst-first for the assessor scan.
  const sevOrder: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MODERATE: 2,
    LOW: 3,
  };
  const sortedRisks = [...riskEntries].sort((a, b) => {
    const aSev = String(
      (a.entryData?.severity as string | null) ?? "",
    ).toUpperCase();
    const bSev = String(
      (b.entryData?.severity as string | null) ?? "",
    ).toUpperCase();
    return (sevOrder[aSev] ?? 99) - (sevOrder[bSev] ?? 99);
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <header className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
          <Shield className="h-3.5 w-3.5" />
          RA.L2-3.11.1 — Annual Risk Assessment
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Latest assessment for this organization
        </h1>
        <p className="text-gray-600">
          The guided wizard lives in MacTech Training; Codex receives the
          finalized envelope + risk register + acceptances + POA&amp;M
          links over the bridge. Everything below is C3PAO-ready
          enrichment — no need to crack open the vault zip to see the
          posture.
        </p>
      </header>

      {!latest ? (
        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">
            No risk assessment on file for this organization yet. Run the
            wizard in MacTech Training; the bridge will populate this
            page once you finalize.
          </p>
          <a
            href={`${TRAINOS_BASE_URL}/admin/risk-assessments/new`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
          >
            Start a new assessment in MacTech Training
            <ExternalLink className="h-4 w-4" />
          </a>
        </section>
      ) : (
        <>
          {/* ─── Envelope card ─────────────────────────────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Envelope
                </h2>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {latest.assessmentName ??
                    latest.systemName ??
                    "Unnamed assessment"}
                </p>
                {latest.systemBoundaryName && (
                  <p className="text-sm text-gray-600">
                    Boundary: {latest.systemBoundaryName}
                  </p>
                )}
              </div>
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                  latest.status === "finalized"
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-gray-50 text-gray-700 ring-gray-200"
                }`}
              >
                {latest.status}
              </span>
            </div>

            <dl className="mt-5 grid grid-cols-1 gap-y-3 text-sm md:grid-cols-2">
              <Row label="Methodology" value={latest.methodology} />
              <Row
                label="Scope type"
                value={latest.scopeType}
                mono
              />
              <Row
                label="Defined frequency"
                value={
                  latest.definedFrequencyDays
                    ? `${latest.definedFrequencyDays} days`
                    : null
                }
              />
              <Row
                label="Review period"
                value={
                  latest.reviewPeriodStart && latest.reviewPeriodEnd
                    ? `${latest.reviewPeriodStart} → ${latest.reviewPeriodEnd}`
                    : null
                }
              />
              <Row
                label="Finalized at"
                value={
                  latest.finalizedAt
                    ? latest.finalizedAt.toISOString().slice(0, 19) + "Z"
                    : null
                }
                mono
              />
              <Row label="Next due" value={latest.nextDueDate} mono />
              <Row label="Assessor" value={latest.assessorDisplayName} />
              <Row label="Reviewer" value={latest.reviewerDisplayName} />
              <Row label="Approver" value={latest.approverDisplayName} />
              <Row label="SSP reference" value={latest.sspReference} />
            </dl>

            {/* Frequency rationale — defensibility for objective [a]. */}
            {latest.frequencyRationale && (
              <div className="mt-5 rounded-lg border border-sky-100 bg-sky-50/50 p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
                  Frequency rationale (objective [a] defensibility)
                </p>
                <p className="mt-1 text-sm leading-relaxed text-gray-800">
                  {latest.frequencyRationale}
                </p>
              </div>
            )}

            {/* Objectives. */}
            <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">
                    Objective [a] — Frequency defined
                  </span>
                  {objectivePill(latest.objectiveAStatus)}
                </div>
                {latest.objectiveARationale && (
                  <p className="mt-1 text-xs text-gray-600">
                    {latest.objectiveARationale}
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">
                    Objective [b] — Assessment performed
                  </span>
                  {objectivePill(latest.objectiveBStatus)}
                </div>
                {latest.objectiveBRationale && (
                  <p className="mt-1 text-xs text-gray-600">
                    {latest.objectiveBRationale}
                  </p>
                )}
              </div>
            </div>

            {/* Hashes + vault. */}
            <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-4 font-mono text-[11px]">
              <p className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
                Integrity anchors
              </p>
              <p>
                <span className="text-gray-500">finalReportSha256: </span>
                {latest.finalReportSha256 ?? "—"}
              </p>
              <p>
                <span className="text-gray-500">packageSha256: </span>
                {latest.packageSha256 ?? "—"}
              </p>
              <p>
                <span className="text-gray-500">manifestSha256: </span>
                {latest.evidenceManifestSha256 ?? "—"}
              </p>
              <p className="mt-1 break-all">
                <span className="text-gray-500">vault: </span>
                {latest.vaultArtifactPointer ?? "—"}
              </p>
            </div>
          </section>

          {/* ─── Risk register entries (worst-first) ───────────────── */}
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Risk register entries ({riskEntries.length})
              </h2>
              <Link
                href="/dashboard/evidence-engine/registers/risk_register"
                className="inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
              >
                Open register
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {sortedRisks.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">
                No final risk_register entries pivoted to this assessment.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-gray-100">
                {sortedRisks.map((r) => {
                  const d = (r.entryData ?? {}) as Record<string, unknown>;
                  const sev =
                    (d["severity"] as string | null) ??
                    (d["risk_rating"] as string | null);
                  const treat = String(
                    d["treatment_strategy"] ?? "",
                  ).toUpperCase();
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex flex-col items-start gap-1">
                          {severityChip(sev)}
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700">
                            {treat || "—"}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {String(d["risk_statement"] ?? d["risk_id"] ?? "—")
                              .split("\n")[0]
                              ?.slice(0, 200)}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-600">
                            <span className="text-gray-500">L×I: </span>
                            {String(d["inherent_likelihood"] ?? "?")}×
                            {String(d["inherent_impact"] ?? "?")}={" "}
                            {String(d["inherent_risk"] ?? "?")} (inherent),{" "}
                            {String(d["residual_likelihood"] ?? "?")}×
                            {String(d["residual_impact"] ?? "?")}={" "}
                            {String(d["residual_risk"] ?? "?")} (residual)
                            {d["control_effectiveness"]
                              ? ` · controls: ${String(d["control_effectiveness"])}`
                              : ""}
                          </p>
                          {d["treatment_rationale"] ? (
                            <p className="mt-1 text-xs italic text-gray-700">
                              <span className="text-gray-500">
                                Rationale:
                              </span>{" "}
                              {String(d["treatment_rationale"]).slice(0, 280)}
                            </p>
                          ) : null}
                          {d["acceptance_rationale"] ? (
                            <p className="mt-1 text-xs italic text-amber-800">
                              <span className="text-amber-600">Accepted:</span>{" "}
                              {String(d["acceptance_rationale"]).slice(0, 280)}
                              {d["acceptance_review_date"]
                                ? ` (review by ${String(d["acceptance_review_date"])})`
                                : ""}
                            </p>
                          ) : null}
                          {d["transfer_mechanism"] ? (
                            <p className="mt-1 text-xs italic text-purple-800">
                              <span className="text-purple-600">
                                Transferred:
                              </span>{" "}
                              {String(d["transfer_mechanism"]).slice(0, 280)}
                            </p>
                          ) : null}
                          {Array.isArray(d["relevant_cmmc_controls"]) &&
                          (d["relevant_cmmc_controls"] as string[]).length >
                            0 ? (
                            <p className="mt-1 flex flex-wrap gap-1 text-[10px] text-gray-500">
                              {(d["relevant_cmmc_controls"] as string[]).map(
                                (c) => (
                                  <span
                                    key={c}
                                    className="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-indigo-700 ring-1 ring-indigo-100"
                                  >
                                    {c}
                                  </span>
                                ),
                              )}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ─── Acceptances + POA&M links ─────────────────────────── */}
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-amber-800">
                <ShieldAlert className="h-4 w-4" />
                Executive acceptances ({acceptances.length})
              </h2>
              {acceptances.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">
                  No HIGH/CRITICAL acceptances on this assessment.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {acceptances.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border border-amber-100 bg-white p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono">
                          {a.riskExternalId}
                        </span>
                        {severityChip(a.severity)}
                      </div>
                      <p className="mt-1 italic text-gray-700">
                        {a.acceptanceRationaleSummary}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Approver: {a.approverDisplayName} · review by{" "}
                        {a.nextReviewDate}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-5 shadow-sm">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-sky-800">
                <ListChecks className="h-4 w-4" />
                POA&amp;M links ({poamLinks.length})
              </h2>
              {poamLinks.length === 0 ? (
                <p className="mt-3 text-sm text-gray-600">
                  No POA&amp;M links recorded for this assessment.
                </p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {poamLinks.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-lg border border-sky-100 bg-white p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {p.sanitizedTitle ?? p.riskExternalId}
                        </span>
                        {severityChip(p.severity)}
                      </div>
                      <p className="mt-1 text-[11px] text-gray-500">
                        Source: {p.poamSource}
                        {p.dueDate ? ` · due ${p.dueDate}` : ""}
                        {p.ownerRole ? ` · owner: ${p.ownerRole}` : ""}
                      </p>
                      {p.poamExternalRef && (
                        <p className="mt-0.5 break-all font-mono text-[10px] text-gray-400">
                          {p.poamExternalRef}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* ─── Actions ───────────────────────────────────────────── */}
          <section className="space-y-3">
            <a
              href={`${TRAINOS_BASE_URL}/admin/risk-assessments/${latest.id}/evidence`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-3 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
            >
              Open evidence map in MacTech Training
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
        </>
      )}

      <p className="text-xs text-gray-500">
        Boundary discipline: the Training app authors the assessment; the
        vault holds the bundle bytes; Codex stores only sanitized
        metadata, hashes, vault pointers, and the per-risk enrichment
        needed to defend the control inline.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className={mono ? "font-mono text-gray-800" : "text-gray-800"}>
        {value ?? "—"}
      </dd>
    </>
  );
}
