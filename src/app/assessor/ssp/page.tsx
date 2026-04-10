import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations, sspSections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, FileText, Building2, Users, Globe, Tag } from "lucide-react";

// CUI category display map (must match the wizard's CUI_CATEGORIES ids)
const CUI_LABELS: Record<string, string> = {
  CTI: "Controlled Technical Information (CTI)",
  ITAR: "Export Controlled (ITAR/EAR)",
  FOR_OFFICIAL_USE: "For Official Use Only (FOUO)",
  PRIVACY_PII: "Privacy — PII",
  PROCUREMENT: "Procurement & Acquisition",
  CRITICAL_INFRA: "Critical Infrastructure",
  INTEL: "Intelligence",
  LAW_ENFORCEMENT: "Law Enforcement",
  LEGAL: "Legal",
  FINANCIAL: "Financial",
  NUCLEAR: "Nuclear",
  TRANSPORT: "Transportation",
  HEALTH: "Health Information",
  RESEARCH: "Research",
  CONTRACTS: "Contract Information",
};

function SectionBlock({
  title,
  content,
  updatedAt,
}: {
  title: string;
  content: string | null | undefined;
  updatedAt?: Date | null;
}) {
  const hasContent = content && content.trim().length > 0;
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-gray-50)] px-5 py-3">
        <div className="flex items-center gap-2.5">
          <FileText className="h-4 w-4 text-[var(--color-gray-400)]" aria-hidden />
          <h3 className="text-sm font-semibold text-[var(--color-gray-800)]">{title}</h3>
        </div>
        <div className="flex items-center gap-2">
          {hasContent ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Authored" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400" aria-label="Not yet authored" />
          )}
          {updatedAt && (
            <span className="text-[10px] text-[var(--color-gray-400)]">
              {updatedAt.toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <div className="px-5 py-4">
        {hasContent ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-gray-700)]">
            {content}
          </p>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Section not yet authored by the organization.
          </div>
        )}
      </div>
    </div>
  );
}

export default async function AssessorSspPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string; role?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId || user?.role !== "Assessor") redirect("/auth/signin");

  // ── Org metadata ──
  const [org] = await db
    .select({
      name: organizations.name,
      systemName: organizations.systemName,
      systemDescription: organizations.systemDescription,
      authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
      systemOwnerName: organizations.systemOwnerName,
      systemOwnerEmail: organizations.systemOwnerEmail,
      issoName: organizations.issoName,
      issoEmail: organizations.issoEmail,
      cuiCategories: organizations.cuiCategories,
      externalServiceProviders: organizations.externalServiceProviders,
      boundaryNarrative: organizations.boundaryNarrative,
      boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  // ── SSP sections ──
  const sections = await db
    .select({
      id: sspSections.id,
      documentCode: sspSections.documentCode,
      sectionKey: sspSections.sectionKey,
      title: sspSections.title,
      content: sspSections.content,
      orderIndex: sspSections.orderIndex,
    })
    .from(sspSections)
    .where(eq(sspSections.organizationId, orgId))
    .orderBy(sspSections.documentCode, sspSections.orderIndex);

  const authoredCount = sections.filter((s) => s.content && s.content.trim().length > 0).length;

  type ExtProvider = { name: string; serviceType: string; dataTypes: string[]; inheritedControls: string[]; website?: string };
  const providers = (org?.externalServiceProviders ?? []) as ExtProvider[];
  const cuiCategories = (org?.cuiCategories ?? []) as string[];

  const cardClass = "rounded-xl border border-[var(--color-border)] bg-white shadow-sm";

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-gray-900)]">System Security Plan</h1>
          <p className="mt-1 text-sm text-[var(--color-gray-600)]">
            Read-only view of the SSP boundary scoping and authored sections.
          </p>
        </div>

        {/* Authorization Boundary Statement — formal document block */}
        <div className="rounded-xl border-l-4 border-[var(--color-navy-primary)] bg-white px-6 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-navy-primary)]">
            Authorization Boundary Statement
          </p>
          {org?.authorizationBoundaryStatement ? (
            <p className="mt-3 text-sm leading-relaxed text-[var(--color-gray-700)]">
              {org.authorizationBoundaryStatement}
            </p>
          ) : (
            <p className="mt-3 text-sm italic text-amber-600">
              Authorization boundary statement not yet authored. Complete boundary scoping wizard to generate this statement.
            </p>
          )}
          <div className="mt-3 flex items-center gap-2">
            {org?.boundaryScopingCompletedAt ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Boundary scoping completed {org.boundaryScopingCompletedAt.toLocaleDateString()}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-600">
                <AlertTriangle className="h-3.5 w-3.5" />
                Boundary scoping incomplete
              </span>
            )}
          </div>
        </div>

        {/* System identity */}
        <div className={cardClass}>
          <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3">
            <Building2 className="h-4 w-4 text-[var(--color-gray-400)]" aria-hidden />
            <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">System Identification</h2>
          </div>
          <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">Organization</dt>
              <dd className="mt-1 text-sm text-[var(--color-gray-800)]">{org?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">System Name</dt>
              <dd className="mt-1 text-sm text-[var(--color-gray-800)]">
                {org?.systemName ?? <span className="italic text-amber-600">Not set</span>}
              </dd>
            </div>
            {org?.systemDescription && (
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">System Description</dt>
                <dd className="mt-1 text-sm leading-relaxed text-[var(--color-gray-700)]">{org.systemDescription}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Personnel */}
        <div className={cardClass}>
          <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3">
            <Users className="h-4 w-4 text-[var(--color-gray-400)]" aria-hidden />
            <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">System Personnel</h2>
          </div>
          <dl className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">System Owner</dt>
              <dd className="mt-1 text-sm text-[var(--color-gray-800)]">
                {org?.systemOwnerName ?? <span className="italic text-[var(--color-gray-400)]">Not designated</span>}
              </dd>
              {org?.systemOwnerEmail && (
                <dd className="mt-0.5 text-xs text-[var(--color-gray-500)]">{org.systemOwnerEmail}</dd>
              )}
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--color-gray-400)]">ISSO</dt>
              <dd className="mt-1 text-sm text-[var(--color-gray-800)]">
                {org?.issoName ?? <span className="italic text-[var(--color-gray-400)]">Not designated</span>}
              </dd>
              {org?.issoEmail && (
                <dd className="mt-0.5 text-xs text-[var(--color-gray-500)]">{org.issoEmail}</dd>
              )}
            </div>
          </dl>
        </div>

        {/* CUI categories */}
        {cuiCategories.length > 0 && (
          <div className={cardClass}>
            <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3">
              <Tag className="h-4 w-4 text-[var(--color-gray-400)]" aria-hidden />
              <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">CUI Categories In Scope</h2>
            </div>
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {cuiCategories.map((cat) => (
                <span
                  key={cat}
                  className="rounded-full border border-[var(--color-border)] bg-[var(--color-gray-50)] px-3 py-1 text-xs font-medium text-[var(--color-gray-700)]"
                >
                  {CUI_LABELS[cat] ?? cat}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* External service providers */}
        {providers.length > 0 && (
          <div className={cardClass}>
            <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3">
              <Globe className="h-4 w-4 text-[var(--color-gray-400)]" aria-hidden />
              <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">
                External Service Providers ({providers.length})
              </h2>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {providers.map((p, i) => (
                <div key={i} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-gray-800)]">{p.name}</p>
                      <p className="text-xs text-[var(--color-gray-500)]">{p.serviceType}</p>
                      {p.website && (
                        <a
                          href={p.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--color-blue-accent)] hover:underline"
                        >
                          {p.website}
                        </a>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-teal-700">
                        {p.inheritedControls.length} inherited control{p.inheritedControls.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  {p.inheritedControls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.inheritedControls.map((ctrl) => (
                        <span
                          key={ctrl}
                          className="rounded-md bg-teal-50 px-2 py-0.5 font-mono text-[10px] font-medium text-teal-700"
                        >
                          {ctrl}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.dataTypes.length > 0 && (
                    <p className="mt-1.5 text-xs text-[var(--color-gray-500)]">
                      CUI types: {p.dataTypes.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Network narrative */}
        {org?.boundaryNarrative && (
          <div className={cardClass}>
            <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-5 py-3">
              <FileText className="h-4 w-4 text-[var(--color-gray-400)]" aria-hidden />
              <h2 className="text-sm font-semibold text-[var(--color-gray-800)]">Network & Boundary Narrative</h2>
            </div>
            <div className="px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-gray-700)]">
                {org.boundaryNarrative}
              </p>
            </div>
          </div>
        )}

        {/* SSP sections from sspSections table */}
        {sections.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-baseline gap-3">
              <h2 className="text-sm font-semibold text-[var(--color-gray-700)]">
                Authored SSP Sections
              </h2>
              <span className="text-xs text-[var(--color-gray-400)]">
                {authoredCount}/{sections.length} completed
              </span>
            </div>
            {sections.map((s) => (
              <SectionBlock
                key={s.id}
                title={`[${s.documentCode}] ${s.title}`}
                content={s.content}
              />
            ))}
          </div>
        )}

        {sections.length === 0 && providers.length === 0 && !org?.systemName && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
            <p className="font-semibold">Boundary scoping has not been completed.</p>
            <p className="mt-1">
              The compliance team must complete the boundary scoping wizard before SSP content will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
