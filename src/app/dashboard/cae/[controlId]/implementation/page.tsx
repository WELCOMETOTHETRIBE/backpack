import Link from "next/link";
import { promises as fs } from "node:fs";
import path from "node:path";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { controlObservedImplementations } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getControlAssessmentLogic } from "@/data/cmmc/control-assessment-logic";
import { getLatestAdjudication } from "@/lib/evidence-engine/adjudication/scorer";
import { StatusBadge } from "@/components/governance-wizard/StatusBadge";
import { GOVERNANCE_18_CONTROL_IDS } from "@/lib/compliance/satisfaction-sources";
import vaultNarratives from "@/data/cmmc/vault-narratives.json";
import type { SctmOptimizedControl } from "@/lib/sctm-optimized-types";

/**
 * /dashboard/cae/[controlId]/implementation
 *
 * Per-control "everything about this control" page. Combines:
 *   - SCTM context from CMMC_SCTM_UI_Optimized.json (title, NIST
 *     guidance, determination statement text, onboarding tips, SPRS)
 *   - Vault implementation narrative (from vault-narratives.json)
 *   - Per-objective adjudication verdicts (canonical CAE state)
 *   - Observed-Implementation Statement narrative + history
 *   - Per-requirement evidence breakdown
 *   - Cross-links to SCTM, Governance, Evidence Engine
 *
 * Used to be sparse for any control without an OIS narrative; now
 * always has the SCTM context layer regardless of whether OIS has
 * fired yet.
 */

const VAULT_NARRATIVES = vaultNarratives as Record<string, string>;

/**
 * Load the SCTM-optimized JSON entry for this control. Reads from
 * /public on disk (server-side); falls back to null if the JSON is
 * malformed or the control id isn't found.
 */
async function loadSctmEntry(
  controlId: string,
): Promise<SctmOptimizedControl | null> {
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "CMMC_SCTM_UI_Optimized.json",
    );
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw) as SctmOptimizedControl[];
    // controlId is the bare NIST short form (e.g. "3.1.1"); the JSON
    // uses metadata.nist_id for that, with the full CMMC label
    // (AC.L2-3.1.1) as the top-level id.
    return (
      data.find((c) => c.metadata?.nist_id === controlId) ??
      data.find((c) => c.id?.endsWith(`-${controlId}`)) ??
      null
    );
  } catch {
    return null;
  }
}

function buildVaultNarrative(controlId: string): string | null {
  const raw = VAULT_NARRATIVES[controlId];
  if (!raw) return null;
  return raw.replace(/\\n/g, "\n");
}

export default async function OISPage({
  params,
}: {
  params: Promise<{ controlId: string }>;
}) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string } | undefined)
    ?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { controlId } = await params;
  const decoded = decodeURIComponent(controlId);

  const logic = getControlAssessmentLogic();
  const control = logic.controls.find((c) => c.control_id === decoded);
  if (!control) notFound();

  // SCTM-optimized JSON entry for the rich human-facing context.
  const sctm = await loadSctmEntry(decoded);
  const vaultNarrative = buildVaultNarrative(decoded);

  // Latest OIS row + last 5 history rows for the timeline panel.
  const rows = await db
    .select()
    .from(controlObservedImplementations)
    .where(
      and(
        eq(controlObservedImplementations.organizationId, orgId),
        eq(controlObservedImplementations.controlId, decoded),
      ),
    )
    .orderBy(desc(controlObservedImplementations.periodEnd))
    .limit(6);

  const latest = rows[0] ?? null;
  const history = rows.slice(1);

  // Phase 7 — latest adjudication snapshot for this control.
  const adjudication = await getLatestAdjudication(orgId, decoded);
  const requirementResults = (adjudication?.requirementsJson ?? []) as Array<{
    register_key: string;
    required_min: number;
    observed_final: number;
    observed_isso_verified: number;
    cadence_days_required: number;
    cadence_days_actual: number | null;
    satisfied: boolean;
    evidence_entry_ids: string[];
    gap_reason?: string;
  }>;

  // Per-objective verdicts from the canonical adjudication snapshot.
  // Each entry: { objective: 'a', verdict: 'MET'|'NOT_MET'|'NA', ... }.
  const objectiveVerdicts = (adjudication?.objectiveVerdicts ?? []) as Array<{
    objective: string;
    verdict: "MET" | "NOT_MET" | "NA";
    rationale?: string | null;
  }>;
  const verdictByLetter = new Map(
    objectiveVerdicts.map((v) => [v.objective, v]),
  );

  const evidence =
    (latest?.evidenceSummary ?? {}) as Record<
      string,
      Record<string, Record<string, number>>
    >;

  let totalEntries = 0;
  const lifecycleRollup = new Map<string, number>();
  for (const byType of Object.values(evidence)) {
    for (const byLifecycle of Object.values(byType)) {
      for (const [lifecycle, count] of Object.entries(byLifecycle)) {
        totalEntries += count;
        lifecycleRollup.set(
          lifecycle,
          (lifecycleRollup.get(lifecycle) ?? 0) + count,
        );
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-8">
      {/* Header + cross-links */}
      <div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/dashboard/cae"
            className="text-[var(--color-gray-600)] hover:underline"
          >
            ← Adjudication Engine
          </Link>
          <span className="text-[var(--color-gray-300)]">·</span>
          <Link
            href={`/dashboard/controls?control=${encodeURIComponent(decoded)}`}
            className="text-[var(--color-blue-accent)] hover:underline"
          >
            View in SCTM ↗
          </Link>
          {GOVERNANCE_18_CONTROL_IDS.has(decoded) && (
            <>
              <span className="text-[var(--color-gray-300)]">·</span>
              <Link
                href={`/dashboard/adjudication/governance/${encodeURIComponent(decoded)}`}
                className="text-violet-700 hover:underline"
              >
                Governance docs ↗
              </Link>
            </>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold text-[var(--color-navy-primary)]">
            {sctm ? `${sctm.id} — ${sctm.title}` : `${decoded} — Control`}
          </h1>
          {sctm && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-[var(--color-gray-100)] px-2 py-0.5 text-[var(--color-gray-700)]">
              {sctm.metadata?.family ?? control.family} · {sctm.metadata?.level ?? "L2"}
            </span>
          )}
          {sctm?.scoring?.sprs ? (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700 ring-1 ring-rose-200">
              SPRS {sctm.scoring.sprs}
            </span>
          ) : null}
          {latest?.narrativeLockStartedAt && (
            <span className="text-[10px] uppercase tracking-wide rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
              locked for assessment
            </span>
          )}
          {adjudication && (
            <StatusBadge
              kind="adjudication"
              status={adjudication.status}
              confidence={adjudication.confidence}
              size="md"
            />
          )}
        </div>
        {sctm?.summary && (
          <p className="mt-2 text-sm text-[var(--color-gray-700)] leading-relaxed">
            {sctm.summary}
          </p>
        )}
      </div>

      {/* Requirement (verbatim NIST language) */}
      {sctm?.requirement && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            Security requirement (NIST SP 800-171 Rev. 2)
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-gray-800)]">
            {sctm.requirement}
          </p>
        </section>
      )}

      {/* Determination statements with per-objective verdicts inline */}
      {sctm?.objectives && sctm.objectives.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            Assessment objectives [NIST SP 800-171A]
          </h2>
          <p className="mt-1 text-xs text-[var(--color-gray-500)]">
            CMMC L2 Assessment Guide v2.13: each [a]–[z] objective is
            scored independently. One NOT MET fails the entire requirement.
          </p>
          <ul className="mt-3 space-y-2">
            {sctm.objectives.map((obj) => {
              // Objective ids look like "AC.L2-3.1.1-a"; the trailing
              // letter is the objective key.
              const letter =
                obj.id.split("-").slice(-1)[0]?.toLowerCase() ?? "?";
              const verdict = verdictByLetter.get(letter);
              return (
                <li
                  key={obj.id}
                  className="flex items-start gap-3 rounded-md border border-[var(--color-border-muted)] bg-[var(--color-gray-50)]/30 px-3 py-2"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-indigo-100 font-mono text-[10px] font-semibold uppercase text-indigo-800 ring-1 ring-inset ring-indigo-200">
                    {letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-[var(--color-gray-800)]">
                      {obj.text}
                    </p>
                    {verdict && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <VerdictPill verdict={verdict.verdict} />
                        {verdict.rationale && (
                          <span className="text-[var(--color-gray-600)]">
                            {verdict.rationale}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Implementation method (vault narrative) */}
      {vaultNarrative && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            Implementation method
          </h2>
          <p className="mt-1 text-xs text-[var(--color-gray-500)]">
            How MacTech satisfies this control. Sourced from
            vault-narratives.json — the same text the SSP renders for
            this control.
          </p>
          <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-gray-800)]">
            {vaultNarrative}
          </div>
        </section>
      )}

      {/* NIST guidance + onboarding tips (collapsed-feel via subtle bg) */}
      {(sctm?.nist_guidance || sctm?.onboarding_tips) && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          {sctm.nist_guidance && (
            <details className="group" open>
              <summary className="cursor-pointer list-none">
                <h2 className="inline text-sm font-semibold text-[var(--color-navy-primary)]">
                  NIST 800-171 Rev. 2 guidance
                </h2>
                <span className="ml-2 text-[11px] text-[var(--color-gray-500)] group-open:hidden">
                  click to expand
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-gray-700)]">
                {sctm.nist_guidance}
              </p>
            </details>
          )}
          {sctm.onboarding_tips && (
            <details className="group mt-4">
              <summary className="cursor-pointer list-none">
                <h2 className="inline text-sm font-semibold text-[var(--color-navy-primary)]">
                  Operator guidance — what assessors look for
                </h2>
                <span className="ml-2 text-[11px] text-[var(--color-gray-500)] group-open:hidden">
                  click to expand
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-gray-700)]">
                {sctm.onboarding_tips}
              </p>
            </details>
          )}
        </section>
      )}

      {/* Observed-Implementation narrative — only when present */}
      {latest && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
              Observed-implementation statement
            </h2>
            <span className="text-[11px] text-[var(--color-gray-500)]">
              period {latest.periodStart.toString().slice(0, 10)}…
              {latest.periodEnd.toString().slice(0, 10)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-gray-800)]">
            {latest.narrative}
          </p>
          <p className="mt-3 text-[11px] text-[var(--color-gray-500)]">
            Generated {new Date(latest.generatedAt).toLocaleString()}
            {latest.generatedFromManifestId && (
              <>
                {" · "}from manifest{" "}
                <Link
                  href={`/dashboard/monitoring/manifests/${encodeURIComponent(
                    latest.generatedFromManifestId,
                  )}`}
                  className="font-mono text-[var(--color-blue-accent)] hover:underline"
                >
                  {latest.generatedFromManifestId.slice(0, 16)}…
                </Link>
              </>
            )}
            {latest.mostRecentEvidenceAt && (
              <>
                {" · "}most recent signed evidence{" "}
                {new Date(latest.mostRecentEvidenceAt).toLocaleString()}
              </>
            )}
          </p>
        </section>
      )}

      {!latest && (
        <section className="rounded-[var(--radius-xl)] border border-amber-200 bg-amber-50/40 p-6 text-sm text-amber-900">
          <p className="font-medium">
            No observed-implementation narrative yet.
          </p>
          <p className="mt-1 text-xs">
            The OIS engine runs on every ISSO weekly export ingest. Once
            the next manifest lands and touches this control&rsquo;s
            required registers, a narrative will appear here.
          </p>
          <p className="mt-2 text-xs">
            Required registers for {decoded}:{" "}
            <span className="font-mono">
              {control.register_requirements.length === 0
                ? "(none — control has no operational evidence requirement)"
                : control.register_requirements
                    .map((r) => r.register_id)
                    .join(", ")}
            </span>
          </p>
        </section>
      )}

      {/* Adjudication requirement breakdown */}
      {adjudication && requirementResults.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
              Adjudication requirements (
              {requirementResults.filter((r) => r.satisfied).length}/
              {requirementResults.length} satisfied)
            </h2>
            <span className="text-[11px] text-[var(--color-gray-500)]">
              computed {new Date(adjudication.computedAt).toLocaleString()}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-[var(--color-border-muted)]">
            {requirementResults.map((req) => (
              <li key={req.register_key} className="py-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      req.satisfied
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {req.satisfied ? "satisfied" : "gap"}
                  </span>
                  <Link
                    href={`/dashboard/evidence-engine/registers/${encodeURIComponent(
                      req.register_key,
                    )}`}
                    className="font-mono text-xs text-[var(--color-blue-accent)] hover:underline"
                  >
                    {req.register_key}
                  </Link>
                  <span className="text-[11px] text-[var(--color-gray-600)]">
                    {req.observed_final}/{req.required_min} final ·{" "}
                    {req.observed_isso_verified} ISSO-verified · cadence{" "}
                    {req.cadence_days_actual === null
                      ? "—"
                      : `${req.cadence_days_actual}d`}
                    /
                    {req.cadence_days_required === 0
                      ? "event-driven"
                      : `${req.cadence_days_required}d`}
                  </span>
                </div>
                {req.gap_reason && (
                  <p className="mt-1 text-xs text-red-700">
                    Gap: {req.gap_reason}
                  </p>
                )}
                {req.evidence_entry_ids.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {req.evidence_entry_ids.map((id) => (
                      <Link
                        key={id}
                        href={`/dashboard/evidence-engine/entries/${id}`}
                        className="rounded border border-[var(--color-border)] bg-[var(--color-gray-50)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-gray-700)] hover:bg-[var(--color-gray-100)]"
                      >
                        {id.slice(0, 8)}…
                      </Link>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidence breakdown card */}
      {latest && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
              Evidence breakdown ({totalEntries} entr
              {totalEntries === 1 ? "y" : "ies"})
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
              {Array.from(lifecycleRollup.entries())
                .sort(([, a], [, b]) => b - a)
                .map(([lifecycle, count]) => (
                  <span
                    key={lifecycle}
                    className={`rounded-full px-2 py-0.5 font-medium uppercase tracking-wide ${lifecycleTone(
                      lifecycle,
                    )}`}
                  >
                    {count} {lifecycle.replace(/_/g, " ")}
                  </span>
                ))}
            </div>
          </div>
          {Object.keys(evidence).length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-gray-500)]">
              No entries observed in the period across the control&rsquo;s
              required registers.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {Object.entries(evidence).map(([registerKey, byType]) => (
                <div key={registerKey}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-gray-600)]">
                    <Link
                      href={`/dashboard/evidence-engine/registers/${encodeURIComponent(
                        registerKey,
                      )}`}
                      className="hover:underline"
                    >
                      {registerKey}
                    </Link>
                  </h3>
                  <table className="mt-1 w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border-muted)] text-[11px] uppercase tracking-wide text-[var(--color-gray-500)]">
                        <th className="py-1 text-left">Entry type</th>
                        <th className="py-1 text-left">Lifecycle states</th>
                        <th className="py-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(byType).map(
                        ([entryType, byLifecycle]) => {
                          const total = Object.values(byLifecycle).reduce(
                            (a, b) => a + b,
                            0,
                          );
                          return (
                            <tr
                              key={entryType}
                              className="border-b border-[var(--color-border-muted)] last:border-0"
                            >
                              <td className="py-1.5 font-mono text-xs">
                                {entryType}
                              </td>
                              <td className="py-1.5">
                                <div className="flex flex-wrap gap-1">
                                  {Object.entries(byLifecycle)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([lifecycle, count]) => (
                                      <span
                                        key={lifecycle}
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${lifecycleTone(
                                          lifecycle,
                                        )}`}
                                      >
                                        {count}{" "}
                                        {lifecycle.replace(/_/g, " ")}
                                      </span>
                                    ))}
                                </div>
                              </td>
                              <td className="py-1.5 text-right font-mono text-xs text-[var(--color-gray-700)]">
                                {total}
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-[var(--color-gray-500)]">
            Cadence requirement:{" "}
            {Math.max(
              ...control.register_requirements.map((r) => r.cadence_days),
              0,
            )}{" "}
            d. Min final entries per register:{" "}
            {Math.max(
              ...control.register_requirements.map((r) => r.min_final_entries),
              0,
            )}
            .
          </p>
        </section>
      )}

      {history.length > 0 && (
        <section className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--color-navy-primary)]">
            History ({history.length} prior period
            {history.length === 1 ? "" : "s"})
          </h2>
          <ul className="mt-3 space-y-1.5">
            {history.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-2 border-b border-[var(--color-border-muted)] pb-1.5 text-sm last:border-0"
              >
                <span className="font-mono text-[10px] text-[var(--color-gray-500)]">
                  {row.periodStart.toString().slice(0, 10)}…
                  {row.periodEnd.toString().slice(0, 10)}
                </span>
                <span className="flex-1 text-xs text-[var(--color-gray-700)] line-clamp-2">
                  {row.narrative.slice(0, 200)}
                  {row.narrative.length > 200 ? "…" : ""}
                </span>
                {row.generatedFromManifestId && (
                  <Link
                    href={`/dashboard/monitoring/manifests/${encodeURIComponent(
                      row.generatedFromManifestId,
                    )}`}
                    className="font-mono text-[10px] text-[var(--color-blue-accent)] hover:underline"
                  >
                    manifest →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function VerdictPill({ verdict }: { verdict: "MET" | "NOT_MET" | "NA" }) {
  const tone =
    verdict === "MET"
      ? "bg-emerald-100 text-emerald-800"
      : verdict === "NOT_MET"
        ? "bg-rose-100 text-rose-800"
        : "bg-zinc-100 text-zinc-700";
  const label = verdict === "NOT_MET" ? "NOT MET" : verdict === "NA" ? "N/A" : "MET";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

function lifecycleTone(lifecycle: string): string {
  switch (lifecycle) {
    case "draft":
      return "bg-amber-100 text-amber-800";
    case "admin_signed":
      return "bg-blue-100 text-blue-800";
    case "isso_verified":
      return "bg-emerald-100 text-emerald-800";
    case "escalated":
      return "bg-red-100 text-red-800";
    case "disputed":
      return "bg-purple-100 text-purple-800";
    case "resolved":
      return "bg-emerald-50 text-emerald-700";
    case "void":
      return "bg-gray-100 text-gray-600";
    case "auto_recorded":
      return "bg-gray-100 text-gray-700";
    case "auto_recorded_legacy":
      return "bg-gray-50 text-gray-600";
    case "isso_flagged":
      return "bg-amber-100 text-amber-800";
    case "admin_resolved":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}
