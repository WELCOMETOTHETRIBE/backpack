import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries, organizations } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  getSummaryTemplate,
  renderSummary,
  getFallbackSummary,
} from "@/data/cmmc/field-labels-and-summaries";
import { resolveEffectiveBoundary } from "@/lib/evidence-engine/resolve-boundary";
import { ensureEvidenceEngineRegistersForOrg } from "@/lib/evidence-engine/control-dashboard";
import { getEvidenceMap } from "@/data/cmmc";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";
import { schemaIdForRegisterKey, resolveRegisterKeyCandidates } from "@/data/cmmc/register-key-aliases";
import { sourceMeta } from "@/lib/sctm/vuln-stats";
import { AuditorToggle } from "./AuditorToggle";
import { CreateEntryLink } from "./CreateEntryLink";
import { AttestNoEventsButton } from "./AttestNoEventsButton";

const ATTESTATION_EXCLUDED = new Set<string>(["technical_compliance_run"]);

type PageProps = { params: Promise<{ registerId: string }>; searchParams: Promise<{ boundary?: string; auditor?: string }> };

function buildBaseQuery(boundaryId: string | null, extra: Record<string, string> = {}) {
  const q = new URLSearchParams(extra);
  if (boundaryId) q.set("boundary", boundaryId);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function EvidenceEngineRegisterEntriesPage({ params, searchParams }: PageProps) {
  const session = await auth();
  const orgId = (session?.user as { organizationId?: string })?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const { registerId: registerKey } = await params;
  const { boundary: boundaryParam, auditor } = await searchParams;
  const { effectiveBoundaryId, boundaries } = await resolveEffectiveBoundary(orgId, boundaryParam);
  const auditorOnly = auditor === "1";
  const userRole = (session?.user as { role?: string })?.role;
  const canCreate = userRole === "Admin" || userRole === "Compliance";

  const knownRegister = getEvidenceMap().registers.some((r) => r.id === registerKey);
  if (knownRegister) {
    await ensureEvidenceEngineRegistersForOrg(orgId);
  }

  // Accept either vocabulary in the URL (singular schema id or plural seed
  // key). Without alias resolution, links from CONTROL_INTELLIGENCE that
  // reference the schema id (e.g. "access_authorization") would 404 on
  // orgs whose register row was provisioned under the canonical seed key
  // (e.g. "access_authorizations"). Pick the populated row by ordering
  // entry-bearing rows first.
  const candidates = resolveRegisterKeyCandidates(registerKey);
  const matchingRegisters = await db
    .select()
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        sql`${governanceRegisters.registerKey} IN (${sql.join(
          candidates.map((k) => sql`${k}`),
          sql`, `
        )})`
      )
    );

  let register: (typeof matchingRegisters)[number] | undefined;
  if (matchingRegisters.length === 1) {
    register = matchingRegisters[0];
  } else if (matchingRegisters.length > 1) {
    // Multiple rows matched (data drift): prefer the one with entries.
    const counts = await Promise.all(
      matchingRegisters.map(async (r) => {
        const [c] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(governanceRegisterEntries)
          .where(eq(governanceRegisterEntries.registerId, r.id));
        return { reg: r, n: c?.n ?? 0 };
      })
    );
    counts.sort((a, b) => b.n - a.n);
    register = counts[0].reg;
  }

  if (!register) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine/registers" className="text-sm text-[var(--color-gray-600)] hover:underline">
          ← Registers
        </Link>
        <p className="text-sm text-red-600">Register not found.</p>
      </div>
    );
  }

  if (!effectiveBoundaryId) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine/registers" className="text-sm text-[var(--color-gray-600)] hover:underline">← Registers</Link>
        <h2 className="text-xl font-semibold text-[var(--color-navy-primary)]">{register.name}</h2>
        <p className="text-[var(--color-gray-600)]">No system boundary is configured for this organization.</p>
        <Link href="/dashboard/boundary" className="text-sm text-[var(--color-blue-accent)] hover:underline">Open System Boundary</Link>
      </div>
    );
  }

  const conditions = [
    eq(governanceRegisterEntries.registerId, register.id),
    eq(governanceRegisterEntries.boundaryId, effectiveBoundaryId),
  ];
  if (auditorOnly) {
    conditions.push(eq(governanceRegisterEntries.status, "final"));
  }

  const entries = await db
    .select()
    .from(governanceRegisterEntries)
    .where(and(...conditions))
    .orderBy(desc(governanceRegisterEntries.createdAt))
    .limit(100);

  const effectiveBoundaryName = boundaries.find((b) => b.id === effectiveBoundaryId)?.name ?? null;

  // ── Vuln-register-specific augmentation ──
  // When the register is vuln_remediation, surface per-row provenance
  // (source), regression badges, and a deep-link to EnclaveWatch's
  // per-machine timeline view. The deep-link only renders when the
  // org has published enclavewatch_base_url.
  const isVulnRegister = schemaIdForRegisterKey(registerKey) === "vuln_remediation";
  let enclavewatchBaseUrl: string | null = null;
  if (isVulnRegister) {
    const [org] = await db
      .select({ url: organizations.enclavewatchBaseUrl })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);
    enclavewatchBaseUrl = org?.url?.replace(/\/+$/, "") ?? null;
  }

  const entriesWithSummary = entries.map((e) => {
    const data = (e.entryData ?? {}) as Record<string, unknown>;
    const entryType = e.entryType ?? "unknown";
    const template = getSummaryTemplate(registerKey, entryType);
    const summary = template
      ? renderSummary(template, data)
      : getFallbackSummary(entryType, data);
    return {
      id: e.id,
      summary,
      status: e.status,
      entryType: e.entryType,
      finalizedAt: e.finalizedAt,
      createdAt: e.createdAt,
      // Vuln-register-only fields. Strings or null on every row to keep
      // typing tight at the JSX layer.
      source: typeof data.source === "string" ? data.source : null,
      machineId: typeof data.machine_id === "string" ? data.machine_id : null,
      cveId: typeof data.cve_id === "string" ? data.cve_id : null,
      regressedAt: typeof data.regressed_at === "string" ? data.regressed_at : null,
      regressionCount: Number(data.regression_count ?? 0),
    };
  });

  const baseQuery = buildBaseQuery(effectiveBoundaryId, auditorOnly ? { auditor: "1" } : {});

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/evidence-engine/registers${buildBaseQuery(effectiveBoundaryId, auditorOnly ? { auditor: "1" } : {})}`}
          className="text-sm text-[var(--color-gray-600)] hover:underline"
        >
          ← Registers
        </Link>
        <h2 className="mt-1 text-xl font-semibold text-[var(--color-navy-primary)]">
          {register.name}
        </h2>
        {effectiveBoundaryName && (
          <p className="mt-0.5 text-sm font-medium text-[var(--color-gray-700)]">
            Boundary: {effectiveBoundaryName}
          </p>
        )}
        <p className="mt-0.5 font-mono text-sm text-[var(--color-gray-600)]">
          {register.registerKey}
        </p>
        {register.description && (
          <p className="mt-2 text-sm text-[var(--color-gray-600)]">{register.description}</p>
        )}
        <div className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          <strong>How it works:</strong> New entries start as <span className="rounded bg-gray-200 px-1 font-medium text-gray-700">Draft</span>.
          An admin reviews and approves them, changing status to <span className="rounded bg-green-200 px-1 font-medium text-green-700">Final</span>.
          Only finalized entries count toward compliance and are visible in auditor view.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <AuditorToggle registerKey={registerKey} auditorOnly={auditorOnly} />
          {canCreate && <CreateEntryLink registerKey={registerKey} boundaryId={effectiveBoundaryId} />}
          {canCreate && (() => {
            // Offer the "no events this period" attestation only on
            // event-driven registers (cadence_days=0), excluding the
            // OS-collector meta-log where empty means a real gap.
            const schemaId = schemaIdForRegisterKey(registerKey);
            if (ATTESTATION_EXCLUDED.has(schemaId)) return null;
            const cadence = getCadenceRuleByRegisterId(schemaId);
            if (!cadence || cadence.cadence_days !== 0) return null;
            return (
              <AttestNoEventsButton
                registerKey={registerKey}
                registerName={register.name}
                boundaryId={effectiveBoundaryId}
              />
            );
          })()}
          <a
            href={`/api/governance/registers/${encodeURIComponent(registerKey)}/export`}
            className="text-sm font-medium text-[var(--color-blue-accent)] hover:underline"
          >
            Export CSV
          </a>
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Entries</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Summary</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Type</th>
                {isVulnRegister && (
                  <th className="py-2 font-semibold text-[var(--color-gray-700)]">Source</th>
                )}
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Status</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Approved On</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Created</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entriesWithSummary.map((e) => {
                const isAttestation = e.entryType === "no_events_attestation";
                return (
                <tr key={e.id} className="border-b border-[var(--color-border-muted)]">
                  <td className="py-2 text-[var(--color-gray-800)] max-w-md truncate" title={e.summary}>
                    {e.summary}
                  </td>
                  <td className="py-2 text-[var(--color-gray-600)]">
                    {isAttestation ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2 py-0.5 text-[11px] font-medium text-sky-800">
                        No-events attestation
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <span>{e.entryType ?? "—"}</span>
                        {isVulnRegister && e.regressedAt && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800"
                            title={`Last regressed ${e.regressedAt}${e.regressionCount > 1 ? ` (${e.regressionCount}× total)` : ""}`}
                          >
                            ↺ Regressed
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  {isVulnRegister && (
                    <td className="py-2 text-[var(--color-gray-600)]">
                      {e.source ? (
                        (() => {
                          const meta = sourceMeta(e.source);
                          const tone =
                            meta.tone === "blue"
                              ? "bg-blue-50 border-blue-200 text-blue-800"
                              : meta.tone === "purple"
                                ? "bg-purple-50 border-purple-200 text-purple-800"
                                : meta.tone === "amber"
                                  ? "bg-amber-50 border-amber-200 text-amber-800"
                                  : "bg-gray-50 border-gray-200 text-gray-700";
                          return (
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${tone}`}
                              title={meta.description}
                            >
                              {meta.label}
                            </span>
                          );
                        })()
                      ) : (
                        <span className="text-[var(--color-gray-400)]">—</span>
                      )}
                    </td>
                  )}
                  <td className="py-2">
                    <span
                      className={
                        e.status === "final"
                          ? "inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                          : e.status === "void"
                          ? "inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
                          : "inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                      }
                    >
                      {e.status === "final" ? "Approved" : e.status === "void" ? "Voided" : "Draft — awaiting approval"}
                    </span>
                  </td>
                  <td className="py-2 text-[var(--color-gray-600)]">
                    {e.finalizedAt ? new Date(e.finalizedAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2 text-[var(--color-gray-600)]">
                    {new Date(e.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/evidence-engine/entries/${e.id}${buildBaseQuery(effectiveBoundaryId)}`}
                        className="font-medium text-[var(--color-blue-accent)] hover:underline"
                      >
                        {e.status === "draft" && canCreate ? "Review & Approve" : "View"}
                      </Link>
                      {isVulnRegister && enclavewatchBaseUrl && e.machineId && (
                        <a
                          href={`${enclavewatchBaseUrl}/Vulnerabilities?machine=${encodeURIComponent(e.machineId)}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 rounded border border-[var(--color-border)] bg-white px-2 py-0.5 text-[10px] font-medium text-[var(--color-gray-700)] hover:bg-[var(--color-gray-50)]"
                          title={`Open the per-machine timeline for ${e.machineId} on ${enclavewatchBaseUrl}. Requires reachability from your network.`}
                        >
                          ↗ EnclaveWatch
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
        {entriesWithSummary.length === 0 && (
          <p className="mt-2 text-sm text-[var(--color-gray-500)]">
            {auditorOnly ? "No approved entries yet." : "No entries yet. Create one to get started."}
          </p>
        )}
      </div>
    </div>
  );
}
