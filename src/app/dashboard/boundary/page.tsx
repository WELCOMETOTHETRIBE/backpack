import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { boundaries, controlRecords, organizations } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  Cloud,
  Server,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { LIKELY_NA_CONTROL_IDS } from "@/lib/compliance/likely-na-controls";
import { SyncInheritedButton } from "./SyncInheritedButton";
import { EndpointSection } from "@/components/boundary/EndpointSection";
import { AzureEntraEvidenceCard } from "@/components/boundary/AzureEntraEvidenceCard";
import { LikelyNaQuestionnaire } from "@/components/boundary/LikelyNaQuestionnaire";

// Adjudication state changes (attestation signs, register entries) flip
// implementationStatus on control_records — this page reads org metadata
// and pulls control records, so force-dynamic keeps both fresh.
export const dynamic = "force-dynamic";

const cardClass =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm";

/**
 * /dashboard/boundary — single canonical page for the CUI Vault customer.
 *
 * Codex is exclusively for MacTech CUI Vault customers (JIT-provisioned via
 * the Identity Command Center). Every customer has the same authorization
 * boundary: ONE Windows Server 2025 Datacenter VM on Microsoft Azure
 * Government FedRAMP High. There is nothing to "scope" — the boundary is a
 * constant of the platform.
 *
 * This page therefore consolidates everything boundary-adjacent into one
 * surface (replaces the old /dashboard/os-baselines wizard pages):
 *
 *   1. Architecture summary (constants — OS, cloud, evidence pipeline names)
 *   2. Organization profile (system name, owner, ISSO, CUI categories)
 *   3. Endpoint registration (one Win 2025 VM, inline create/edit)
 *   4. Cloud evidence pipeline (Azure/Entra validator-run inventory)
 *   5. Likely-N/A questionnaire (6 customer-attestable N/A controls)
 *   6. External service providers (Azure Gov is canonical; declared
 *      additions surface here too)
 *
 * Auto-provisions the canonical boundary row if onboarding hasn't yet —
 * defensive against pre-onboarding-flow orgs and partial completions.
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

  // ── Auto-provision the canonical CUI Vault boundary if missing ───────────
  // Onboarding/complete normally creates this. Render-time fallback so the
  // page is never empty for orgs created before the auto-provision shipped.
  let [boundary] = await db
    .select({ id: boundaries.id })
    .from(boundaries)
    .where(eq(boundaries.organizationId, orgId))
    .limit(1);

  if (!boundary) {
    const [created] = await db
      .insert(boundaries)
      .values({
        organizationId: orgId,
        name: "MacTech CUI Vault",
        description:
          "Primary CUI processing boundary. Runs on MacTech's Azure Government / FedRAMP High enclave; managed by MacTech.",
        scopeComponents: ["mactech_vault_azure_gov"],
        boundaryType: "cui_enclave",
        cloudProvider: "azure",
        azureEnvironment: "gov",
      })
      .returning({ id: boundaries.id });
    boundary = created;
  }

  const profileComplete = !!(
    org?.systemName &&
    org?.systemOwnerName &&
    (org?.cuiCategories as string[] | null)?.length
  );
  const providers =
    (org?.externalServiceProviders as Array<{
      name: string;
      inheritedControls: string[];
    }> | null) ?? [];
  const totalInheritedControls = providers.reduce(
    (sum, p) => sum + (p.inheritedControls?.length ?? 0),
    0,
  );

  // ── Likely-N/A control records (for the questionnaire) ──────────────────
  const likelyNaRecords = await db
    .select({
      controlId: controlRecords.controlId,
      implementationStatus: controlRecords.implementationStatus,
      governanceNarrative: controlRecords.governanceNarrative,
    })
    .from(controlRecords)
    .where(
      and(
        eq(controlRecords.organizationId, orgId),
        inArray(controlRecords.controlId, [...LIKELY_NA_CONTROL_IDS]),
      ),
    );

  return (
    <div className="min-h-0">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-[var(--color-gray-900)]">
            System Boundary
          </h1>
          <p className="mt-2 text-[var(--color-gray-600)]">
            Your CUI authorization boundary is fixed: a Windows Server 2025
            Datacenter VM on Microsoft Azure Government FedRAMP High. This page
            is your single workspace for endpoint registration, evidence
            pipeline status, and architecture-static N/A attestations.
          </p>
        </div>

        {/* ── 1. Canonical architecture (constants) ── */}
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
                Every CUI Vault customer runs on the same hardened boundary.
                There is nothing to choose; the architecture is a constant of
                the platform and drives canonical CMMC L2 control adjudication
                across the 110 NIST 800-171 controls.
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
                    DISA STIG hardened · BitLocker FIPS · OS evidence pipeline
                    (Collect-Cui-Evidence v2)
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
                    FedRAMP High Authorized · Entra ID · Cloud evidence
                    pipeline (validate_azure_entra v1.5)
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

        {/* ── 2. Organization profile ── */}
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
                Captured during onboarding. These values feed the SSP and the
                C3PAO interview pack.
              </p>

              <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-[var(--color-gray-500)]">
                    System Name
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">
                    {org?.systemName ?? (
                      <em className="text-[var(--color-gray-400)]">Not set</em>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-gray-500)]">
                    System Owner
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">
                    {org?.systemOwnerName ?? (
                      <em className="text-[var(--color-gray-400)]">Not set</em>
                    )}
                    {org?.systemOwnerEmail && (
                      <span className="ml-1 text-[var(--color-gray-500)]">
                        · {org.systemOwnerEmail}
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-[var(--color-gray-500)]">
                    ISSO
                  </dt>
                  <dd className="mt-0.5 text-sm text-[var(--color-gray-800)]">
                    {org?.issoName ?? (
                      <em className="text-[var(--color-gray-400)]">Not set</em>
                    )}
                    {org?.issoEmail && (
                      <span className="ml-1 text-[var(--color-gray-500)]">
                        · {org.issoEmail}
                      </span>
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
                      <em className="text-sm text-[var(--color-gray-400)]">
                        Not set
                      </em>
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

        {/* ── 3. Endpoint (one Win 2025 VM) ── */}
        <section className={cardClass}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-base font-semibold text-[var(--color-gray-900)]">
                CUI Vault VM
              </h2>
              <p className="mt-0.5 text-sm text-[var(--color-gray-600)]">
                Register your Windows Server 2025 Datacenter hostname so OS
                evidence runs are attributed to it. One VM per CUI Vault
                customer.
              </p>
            </div>
            <Link
              href="/dashboard/evidence/upload-manifest"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-white px-3.5 py-2 text-sm font-medium text-[var(--color-gray-700)] transition-colors hover:bg-[var(--color-gray-50)]"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload OS evidence
            </Link>
          </div>
          <div className="mt-4">
            <EndpointSection boundaryId={boundary.id} />
          </div>
        </section>

        {/* ── 4. Cloud evidence pipeline (Azure/Entra validator) ── */}
        <AzureEntraEvidenceCard boundaryId={boundary.id} />

        {/* ── 5. Likely-N/A questionnaire (6 customer-attestable N/A controls) ── */}
        <LikelyNaQuestionnaire
          boundaryId={boundary.id}
          initialRecords={likelyNaRecords}
        />

        {/* ── 6. External service providers (additive to Azure Gov canonical) ── */}
        {totalInheritedControls > 0 && (
          <section className={cardClass}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1">
                <h2 className="text-sm font-semibold text-[var(--color-gray-900)]">
                  Inherited controls from external providers
                </h2>
                <p className="mt-1 text-sm text-[var(--color-gray-600)]">
                  {providers.length} provider
                  {providers.length !== 1 ? "s" : ""} ·{" "}
                  {totalInheritedControls} control
                  {totalInheritedControls !== 1 ? "s" : ""} marked inherited.
                </p>
                <p className="mt-1 text-xs text-[var(--color-gray-500)]">
                  Azure Government (the canonical provider) gives you 6
                  inherited 3.10 Physical Protection controls. Additional
                  providers you declare add to this set.
                </p>
                <ul className="mt-3 space-y-1">
                  {providers.map((p) =>
                    p.inheritedControls?.length > 0 ? (
                      <li
                        key={p.name}
                        className="text-xs text-[var(--color-gray-600)]"
                      >
                        <span className="font-medium text-[var(--color-gray-800)]">
                          {p.name}
                        </span>{" "}
                        — {p.inheritedControls.length} control
                        {p.inheritedControls.length !== 1 ? "s" : ""}
                      </li>
                    ) : null,
                  )}
                </ul>
              </div>
              <SyncInheritedButton />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
