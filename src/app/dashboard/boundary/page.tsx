import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { CheckCircle2, AlertCircle, ChevronRight, FileText, RefreshCw } from "lucide-react";
import { SyncInheritedButton } from "./SyncInheritedButton";

const cardClass =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

export default async function BoundaryPage() {
  const session = await auth();
  const user = session?.user as { organizationId?: string } | undefined;
  const orgId = user?.organizationId;
  if (!orgId) redirect("/auth/signin");

  const [org] = await db
    .select({
      systemName: organizations.systemName,
      systemDescription: organizations.systemDescription,
      systemOwnerName: organizations.systemOwnerName,
      systemOwnerEmail: organizations.systemOwnerEmail,
      issoName: organizations.issoName,
      issoEmail: organizations.issoEmail,
      cuiCategories: organizations.cuiCategories,
      authorizationBoundaryStatement: organizations.authorizationBoundaryStatement,
      externalServiceProviders: organizations.externalServiceProviders,
      boundaryScopingCompletedAt: organizations.boundaryScopingCompletedAt,
    })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);

  const scopingComplete = !!org?.boundaryScopingCompletedAt;
  const scopingPartial = !scopingComplete && !!(org?.systemName || (org?.cuiCategories as string[] | null)?.length);
  const providers = (org?.externalServiceProviders as Array<{ name: string; inheritedControls: string[] }> | null) ?? [];
  const totalInheritedControls = providers.reduce((sum, p) => sum + (p.inheritedControls?.length ?? 0), 0);

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">System Boundary</h1>
          <p className="mt-2 text-[var(--color-gray-600)]">
            Define the CUI authorization boundary for your System Security Plan.
          </p>
        </div>

        {/* ── Scoping status banner ── */}
        {scopingComplete ? (
          <section className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-status-green)]/10">
                  <CheckCircle2 className="h-5 w-5 text-[var(--color-status-green)]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-gray-900)]">
                    Authorization Boundary Defined
                  </h2>
                  <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                    Scoping wizard completed. Your SSP boundary section is ready.
                  </p>
                  <dl className="mt-3 grid gap-2 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-medium text-[var(--color-gray-500)]">System Name</dt>
                      <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">{org?.systemName ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-[var(--color-gray-500)]">System Owner</dt>
                      <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">
                        {org?.systemOwnerName ?? "—"}
                        {org?.systemOwnerEmail && (
                          <span className="ml-1 text-[var(--color-gray-500)]">· {org.systemOwnerEmail}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium text-[var(--color-gray-500)]">ISSO</dt>
                      <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">
                        {org?.issoName ?? "—"}
                        {org?.issoEmail && (
                          <span className="ml-1 text-[var(--color-gray-500)]">· {org.issoEmail}</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  {(org?.cuiCategories as string[] | null)?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(org!.cuiCategories as string[]).map((cat) => (
                        <span
                          key={cat}
                          className="rounded-full bg-[var(--color-navy-primary)]/8 px-2.5 py-0.5 text-[11px] font-medium text-[var(--color-navy-primary)]"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <Link
                href="/dashboard/boundary/scoping"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)]"
              >
                Edit scoping
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            {org?.authorizationBoundaryStatement && (
              <div className="mt-4 rounded-lg border-l-4 border-[var(--color-navy-primary)]/40 bg-[var(--color-gray-50)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">
                  Authorization Boundary Statement
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-gray-700)]">
                  {org.authorizationBoundaryStatement}
                </p>
              </div>
            )}
          </section>
        ) : (
          <section className={`${cardClass} border-amber-200 bg-amber-50`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-gray-900)]">
                    {scopingPartial ? "Boundary Scoping Incomplete" : "Authorization Boundary Not Defined"}
                  </h2>
                  <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                    {scopingPartial
                      ? "You've started the scoping wizard. Complete it to formally define your authorization boundary for the SSP."
                      : "Your SSP requires a formal authorization boundary statement. Complete the scoping wizard to define the system name, CUI categories, personnel, and boundary narrative."}
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm text-[var(--color-gray-600)]">
                    {[
                      "System identification and description",
                      "CUI categories in scope",
                      "Asset scope narrative",
                      "External service providers and inherited controls",
                      "Network boundary narrative",
                      "System Owner and ISSO designation",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <Link
                href="/dashboard/boundary/scoping"
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-navy-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-hover)]"
              >
                <FileText className="h-4 w-4" />
                {scopingPartial ? "Continue Wizard" : "Start Scoping Wizard"}
              </Link>
            </div>
          </section>
        )}

        {/* ── Inherited controls sync ── */}
        {scopingComplete && totalInheritedControls > 0 && (
          <section className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">
                  Inherited Controls
                </h2>
                <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                  {providers.length} provider{providers.length !== 1 ? "s" : ""} · {totalInheritedControls} control{totalInheritedControls !== 1 ? "s" : ""} marked as inherited in boundary scoping.
                </p>
                <ul className="mt-2 space-y-1">
                  {providers.map((p) =>
                    p.inheritedControls?.length > 0 ? (
                      <li key={p.name} className="text-xs text-[var(--color-gray-500)]">
                        {p.name} — {p.inheritedControls.length} control{p.inheritedControls.length !== 1 ? "s" : ""}
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
              <SyncInheritedButton />
            </div>
          </section>
        )}

        {/* ── OS Endpoint Boundary link ── */}
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">OS Endpoint Boundaries</h2>
              <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                Manage in-scope endpoints, assign OS baselines, and track technical evidence.
              </p>
            </div>
            <Link
              href="/dashboard/os-baselines"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)]"
            >
              Manage endpoints
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
