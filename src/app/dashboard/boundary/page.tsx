import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import { CheckCircle2, ChevronRight, Cloud, Server, ShieldCheck } from "lucide-react";
import { SyncInheritedButton } from "./SyncInheritedButton";

// Adjudication state changes (attestation signs, register entries) flip
// implementationStatus on control_records — this page reads org metadata
// only, but force-dynamic keeps the read fresh after Phase 1 onboarding edits.
export const dynamic = "force-dynamic";

const cardClass =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

/**
 * /dashboard/boundary — System Boundary
 *
 * Codex is now exclusively for MacTech CUI Vault customers (JIT-provisioned
 * via the Identity Command Center). Every customer has the same authorization
 * boundary: a Windows Server 2025 Datacenter VM hosted on Microsoft Azure
 * Government FedRAMP High. There is nothing to "scope" — the boundary is a
 * constant of the platform.
 *
 * This page is therefore a READ-ONLY summary of:
 *   - The canonical boundary architecture (constants)
 *   - The customer's organization-profile fields collected during onboarding
 *     (system name, owner, ISSO, CUI categories) — editable via the Settings
 *     surface, not via a separate "scoping wizard"
 *   - External service providers and inherited controls (Azure Gov is the
 *     canonical one; customers may have additional declared providers)
 *   - A link to the OS endpoint boundaries page (still relevant — manage
 *     in-scope endpoints, assign baselines, track evidence)
 *
 * The /dashboard/boundary/scoping wizard is preserved as an "edit org
 * profile" surface for now but should be retired in a follow-up sprint.
 */
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

  const profileComplete = !!(
    org?.systemName &&
    org?.systemOwnerName &&
    (org?.cuiCategories as string[] | null)?.length
  );
  const providers = (org?.externalServiceProviders as Array<{
    name: string;
    inheritedControls: string[];
  }> | null) ?? [];
  const totalInheritedControls = providers.reduce(
    (sum, p) => sum + (p.inheritedControls?.length ?? 0),
    0
  );

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">System Boundary</h1>
          <p className="mt-2 text-[var(--color-gray-600)]">
            Your CUI authorization boundary is fixed: a Windows Server 2025 Datacenter
            VM on Microsoft Azure Government FedRAMP High. This page summarizes the
            canonical architecture and your organization profile.
          </p>
        </div>

        {/* ── Canonical boundary (architecture-fixed) ── */}
        <section className={cardClass}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-status-green)]/10">
              <ShieldCheck className="h-5 w-5 text-[var(--color-status-green)]" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-[var(--color-gray-900)]">
                MacTech CUI Vault — fixed architecture
              </h2>
              <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                Every CUI Vault customer runs on the same hardened boundary. There is
                nothing to choose; the architecture is a constant of the platform and
                drives canonical CMMC L2 control adjudication across the 110 NIST 800-171 controls.
              </p>

              <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--color-border)] bg-white p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    <Server className="h-3.5 w-3.5" />
                    Operating system
                  </div>
                  <dd className="mt-1 text-sm font-medium text-[var(--color-gray-900)]">
                    Windows Server 2025 Datacenter
                  </dd>
                  <dd className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                    DISA STIG hardened · BitLocker FIPS · OS evidence pipeline (Collect-Cui-Evidence v2)
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-white p-3">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-blue-700">
                    <Cloud className="h-3.5 w-3.5" />
                    Cloud platform
                  </div>
                  <dd className="mt-1 text-sm font-medium text-[var(--color-gray-900)]">
                    Microsoft Azure Government
                  </dd>
                  <dd className="mt-0.5 text-xs text-[var(--color-gray-600)]">
                    FedRAMP High Authorized · Entra ID · Cloud evidence pipeline (validate_azure_entra v1.5)
                  </dd>
                </div>
              </dl>

              {org?.authorizationBoundaryStatement && (
                <div className="mt-4 rounded-lg border-l-4 border-[var(--color-navy-primary)]/40 bg-[var(--color-gray-50)] px-5 py-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-gray-500)]">
                    Authorization Boundary Statement (for SSP)
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-gray-700)]">
                    {org.authorizationBoundaryStatement}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Organization profile (collected during onboarding) ── */}
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--color-gray-900)]">
                  Organization profile
                </h2>
                {profileComplete && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                    <CheckCircle2 className="h-3 w-3" />
                    Complete
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                Captured during onboarding. These values feed the SSP and the C3PAO
                interview pack.
              </p>

              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-[var(--color-gray-500)]">
                    System Name
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">
                    {org?.systemName ?? <em className="text-[var(--color-gray-400)]">Not set</em>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-gray-500)]">
                    System Owner
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">
                    {org?.systemOwnerName ?? <em className="text-[var(--color-gray-400)]">Not set</em>}
                    {org?.systemOwnerEmail && (
                      <span className="ml-1 text-[var(--color-gray-500)]">
                        · {org.systemOwnerEmail}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-gray-500)]">ISSO</dt>
                  <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">
                    {org?.issoName ?? <em className="text-[var(--color-gray-400)]">Not set</em>}
                    {org?.issoEmail && (
                      <span className="ml-1 text-[var(--color-gray-500)]">· {org.issoEmail}</span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-gray-500)]">
                    CUI Categories
                  </dt>
                  <dd className="mt-0.5">
                    {(org?.cuiCategories as string[] | null)?.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {(org!.cuiCategories as string[]).map((cat) => (
                          <span
                            key={cat}
                            className="rounded-full bg-[var(--color-navy-primary)]/8 px-2 py-0.5 text-[11px] font-medium text-[var(--color-navy-primary)]"
                          >
                            {cat}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <em className="text-sm text-[var(--color-gray-400)]">Not set</em>
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <Link
              href="/dashboard/boundary/scoping"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)]"
            >
              Edit profile
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* ── External service providers (Azure Gov is canonical, others additive) ── */}
        {totalInheritedControls > 0 && (
          <section className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">
                  Inherited controls from external providers
                </h2>
                <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                  {providers.length} provider{providers.length !== 1 ? "s" : ""} ·{" "}
                  {totalInheritedControls} control
                  {totalInheritedControls !== 1 ? "s" : ""} marked inherited.
                </p>
                <p className="mt-1 text-xs text-[var(--color-gray-500)]">
                  Azure Government (the canonical provider) gives you 6 inherited 3.10
                  Physical Protection controls. Additional providers you declare add
                  to this set.
                </p>
                <ul className="mt-3 space-y-1">
                  {providers.map((p) =>
                    p.inheritedControls?.length > 0 ? (
                      <li key={p.name} className="text-xs text-[var(--color-gray-600)]">
                        <span className="font-medium text-[var(--color-gray-800)]">
                          {p.name}
                        </span>{" "}
                        — {p.inheritedControls.length} control
                        {p.inheritedControls.length !== 1 ? "s" : ""}
                      </li>
                    ) : null
                  )}
                </ul>
              </div>
              <SyncInheritedButton />
            </div>
          </section>
        )}

        {/* ── OS Endpoint Boundary link (still relevant — endpoint inventory) ── */}
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">
                OS Endpoint Boundaries
              </h2>
              <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                Manage in-scope endpoints, assign OS baselines, and upload validator
                reports (OS Collector + Azure/Entra Collector).
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
