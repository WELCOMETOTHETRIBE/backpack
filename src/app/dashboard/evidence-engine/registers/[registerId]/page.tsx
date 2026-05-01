import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { governanceRegisters, governanceRegisterEntries } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  getSummaryTemplate,
  renderSummary,
  getFallbackSummary,
} from "@/data/cmmc/field-labels-and-summaries";
import { resolveEffectiveBoundary } from "@/lib/evidence-engine/resolve-boundary";
import { ensureEvidenceEngineRegistersForOrg } from "@/lib/evidence-engine/control-dashboard";
import { getEvidenceMap } from "@/data/cmmc";
import { getCadenceRuleByRegisterId } from "@/data/cmmc/register-cadence-rules";
import { schemaIdForRegisterKey } from "@/data/cmmc/register-key-aliases";
import { BoundarySelector } from "../../BoundarySelector";
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

  const [register] = await db
    .select()
    .from(governanceRegisters)
    .where(
      and(
        eq(governanceRegisters.organizationId, orgId),
        eq(governanceRegisters.registerKey, registerKey)
      )
    );

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

  if (boundaries.length === 0) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine/registers" className="text-sm text-[var(--color-gray-600)] hover:underline">← Registers</Link>
        <h2 className="text-xl font-semibold text-[var(--color-navy-primary)]">{register.name}</h2>
        <p className="text-[var(--color-gray-600)]">Select a system boundary to view evidence.</p>
        <Link href="/dashboard/boundary" className="text-sm text-[var(--color-blue-accent)] hover:underline">Open System Boundary</Link>
      </div>
    );
  }

  if (!effectiveBoundaryId) {
    return (
      <div className="space-y-6">
        <Link href="/dashboard/evidence-engine/registers" className="text-sm text-[var(--color-gray-600)] hover:underline">← Registers</Link>
        <h2 className="text-xl font-semibold text-[var(--color-navy-primary)]">{register.name}</h2>
        <p className="text-[var(--color-gray-600)]">Select a system boundary to view evidence.</p>
        <BoundarySelector boundaries={boundaries} currentBoundaryId={null} />
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
    };
  });

  const baseQuery = buildBaseQuery(effectiveBoundaryId, auditorOnly ? { auditor: "1" } : {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
        <BoundarySelector boundaries={boundaries} currentBoundaryId={effectiveBoundaryId} />
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-[var(--color-navy-primary)]">Entries</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Summary</th>
                <th className="py-2 font-semibold text-[var(--color-gray-700)]">Type</th>
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
                      e.entryType ?? "—"
                    )}
                  </td>
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
                  <td className="py-2 flex items-center gap-2">
                    <Link
                      href={`/dashboard/evidence-engine/entries/${e.id}${buildBaseQuery(effectiveBoundaryId)}`}
                      className="font-medium text-[var(--color-blue-accent)] hover:underline"
                    >
                      {e.status === "draft" && canCreate ? "Review & Approve" : "View"}
                    </Link>
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
